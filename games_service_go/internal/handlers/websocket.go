package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/yourorg/games_service_go/internal/config"
	"github.com/yourorg/games_service_go/internal/models"
	"github.com/yourorg/games_service_go/internal/realtime"
	"github.com/yourorg/games_service_go/internal/services"
	"github.com/yourorg/go_shared/middleware"
)

const realtimeInitialMovesLimit = 200

// createUpgrader создает WebSocket upgrader с валидацией origin
func createUpgrader(allowedOrigins []string) websocket.Upgrader {
	allowedSet := make(map[string]bool)
	for _, origin := range allowedOrigins {
		origin = strings.TrimRight(strings.TrimSpace(origin), "/")
		if origin != "" {
			allowedSet[origin] = true
		}
	}

	return websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		// ReadLimit устанавливается отдельно на каждое соединение
		CheckOrigin: func(r *http.Request) bool {
			origin := strings.TrimRight(strings.TrimSpace(r.Header.Get("Origin")), "/")
			if origin == "" {
				// Разрешаем запросы без Origin заголовка (например, из браузера с тем же origin)
				return true
			}
			return allowedSet[origin]
		},
	}
}

// handleWebSocketWithUpgrader обрабатывает WebSocket соединения с кастомным upgrader
func handleWebSocketWithUpgrader(gameService *services.GameService, wsManager *realtime.ConnectionManager, cfg *config.Config, wsUpgrader websocket.Upgrader) gin.HandlerFunc {
	return func(c *gin.Context) {
		gameIDStr := c.Param("game_id")
		gameID, err := uuid.Parse(gameIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid game_id"})
			return
		}

		token, _ := c.Cookie("access_token")
		sessionID := c.Query("session_id")
		var userID *int
		var playerSessionID *string

		// Валидация JWT токена
		if token != "" {
			uid, err := middleware.ValidateJWT(token, cfg.JWTSecret, cfg.JWTAlgorithm)
			if err == nil {
				userID = &uid
			} else {
				// JWT validation failed
				// Не закрываем соединение, просто работаем как viewer
			}
		}

		// Проверяем session_id для анонимных пользователей
		if sessionID != "" && userID == nil {
			// Валидируем формат UUID
			if _, err := uuid.Parse(sessionID); err == nil {
				playerSessionID = &sessionID
			} else {
				// Invalid session_id format
			}
		}

		ws, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			// Failed to upgrade connection
			return
		}
		client := realtime.NewClient(ws)
		defer client.Close()

		// Устанавливаем лимит чтения для защиты от больших сообщений (512KB)
		ws.SetReadLimit(512 * 1024)
		client.SetReadDeadline()

		ctx := c.Request.Context()

		// Загружаем игру
		gameDetail, err := gameService.GetGameWithMoves(ctx, gameID, realtimeInitialMovesLimit)
		if err != nil {
			// Failed to get game
			ws.WriteJSON(map[string]interface{}{
				"type":    "error",
				"message": "Game not found",
			})
			return
		}

		// Определяем роль (учитывая session_id для анонимных игроков)
		role := resolveRoleWithSession(gameDetail.Game, userID, playerSessionID)

		// Регистрируем соединение
		connInfo := &realtime.ConnectionInfo{
			Client: client,
			UserID: userID,
			Role:   role,
		}
		wsManager.Connect(gameID, connInfo)
		defer wsManager.Disconnect(client)

		// Отправляем начальное состояние
		stateMsg := map[string]interface{}{
			"type":     "state",
			"revision": gameDetail.MoveCount,
			"game":     gameDetail,
		}
		if err := wsManager.SendPersonal(client, stateMsg); err != nil {
			// Failed to send initial state
			return
		}

		// Отправляем начальное количество зрителей
		viewersCount := wsManager.GetViewersCount(gameID)
		viewersMsg := map[string]interface{}{
			"type":          "viewers_count",
			"viewers_count": viewersCount,
		}
		if err := wsManager.SendPersonal(client, viewersMsg); err != nil {
			// Failed to send initial viewers count
		}

		// Основной цикл обработки сообщений
		for {
			var rawMessage json.RawMessage
			if err := ws.ReadJSON(&rawMessage); err != nil {
				// Проверяем, не является ли это закрытием соединения
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					// Unexpected close error
				}
				break
			}

			// Парсим payload
			var payload services.MakeMovePayload
			if err := json.Unmarshal(rawMessage, &payload); err != nil {
				// Failed to parse payload
				wsManager.SendPersonal(client, map[string]interface{}{
					"type":           "error",
					"message":        "Invalid payload",
					"client_move_id": getClientMoveID(rawMessage),
				})
				continue
			}
			if payload.Type != "make_move" {
				wsManager.SendPersonal(client, map[string]interface{}{
					"type":           "error",
					"message":        "unknown message type",
					"client_move_id": payload.ClientMoveID,
				})
				continue
			}

			if userID == nil && playerSessionID == nil {
				wsManager.SendPersonal(client, map[string]interface{}{
					"type":           "move_rejected",
					"message":        "Authentication or session_id required",
					"client_move_id": payload.ClientMoveID,
				})
				continue
			}

			// Обработка хода через gameService.MakeMove()
			updatedGame, move, err := gameService.MakeMove(ctx, gameID, userID, playerSessionID, &payload)
			if err != nil {
				// Move rejected
				wsManager.SendPersonal(client, map[string]interface{}{
					"type":           "move_rejected",
					"message":        err.Error(),
					"client_move_id": payload.ClientMoveID,
				})
				continue
			}

			// Broadcast только дельты: клиент уже получил snapshot при подключении.
			moveMadeMsg := map[string]interface{}{
				"type":           "move_made",
				"client_move_id": payload.ClientMoveID,
				"revision":       updatedGame.MoveCount,
				"move":           move,
				"game":           updatedGame,
			}
			if err := wsManager.Broadcast(gameID, moveMadeMsg); err != nil {
				// Failed to broadcast move_made
			}
		}
	}
}

// getClientMoveID извлекает client_move_id из raw JSON сообщения
func getClientMoveID(raw json.RawMessage) *string {
	var data map[string]interface{}
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil
	}
	if id, ok := data["client_move_id"].(string); ok {
		return &id
	}
	return nil
}

func resolveRole(game models.Game, userID *int) realtime.Role {
	if userID == nil {
		return realtime.RoleViewer
	}
	if game.WhiteID != nil && *game.WhiteID == *userID {
		return realtime.RoleWhite
	}
	if game.BlackID != nil && *game.BlackID == *userID {
		return realtime.RoleBlack
	}
	return realtime.RoleViewer
}

// resolveRoleWithSession определяет роль игрока, учитывая user_id и session_id
func resolveRoleWithSession(game models.Game, userID *int, sessionID *string) realtime.Role {
	// Проверяем авторизованного пользователя
	if userID != nil {
		if game.WhiteID != nil && *game.WhiteID == *userID {
			return realtime.RoleWhite
		}
		if game.BlackID != nil && *game.BlackID == *userID {
			return realtime.RoleBlack
		}
	}

	// Проверяем анонимного пользователя через session_id
	if sessionID != nil {
		var metadata map[string]interface{}
		if len(game.Metadata) > 0 {
			if err := json.Unmarshal(game.Metadata, &metadata); err == nil {
				whiteSessionID, _ := metadata["white_session_id"].(string)
				blackSessionID, _ := metadata["black_session_id"].(string)
				if *sessionID == whiteSessionID {
					return realtime.RoleWhite
				}
				if *sessionID == blackSessionID {
					return realtime.RoleBlack
				}
			}
		}
	}

	return realtime.RoleViewer
}
