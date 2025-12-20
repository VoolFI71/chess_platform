package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/yourorg/games_service_go/internal/config"
	"github.com/yourorg/games_service_go/internal/database"
	"github.com/yourorg/games_service_go/internal/models"
	"github.com/yourorg/games_service_go/internal/realtime"
	"github.com/yourorg/games_service_go/internal/services"
)

// createUpgrader создает WebSocket upgrader с валидацией origin
func createUpgrader(allowedOrigins []string) websocket.Upgrader {
	allowedSet := make(map[string]bool)
	for _, origin := range allowedOrigins {
		allowedSet[origin] = true
	}

	return websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		// ReadLimit устанавливается отдельно на каждое соединение
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				// Разрешаем запросы без Origin заголовка (например, из браузера с тем же origin)
				return true
			}
			// Если список разрешенных origins пуст, разрешаем все (для разработки)
			if len(allowedSet) == 0 {
				return true
			}
			return allowedSet[origin]
		},
	}
}

// validateJWT валидирует JWT токен и возвращает user ID
func validateJWT(tokenString, secret string) (int, error) {
	// Убираем "Bearer " префикс если есть
	tokenString = strings.TrimPrefix(tokenString, "Bearer ")
	tokenString = strings.TrimSpace(tokenString)

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})

	if err != nil {
		return 0, err
	}

	if !token.Valid {
		return 0, jwt.ErrSignatureInvalid
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, jwt.ErrInvalidKey
	}

	// Извлекаем user_id из claims
	// В Python версии sub хранится как строка, поэтому пробуем сначала string
	var userID int
	var found bool

	// Пробуем sub как строку (стандартный формат в Python версии)
	if subStr, okStr := claims["sub"].(string); okStr {
		if parsed, err := strconv.Atoi(subStr); err == nil {
			userID = parsed
			found = true
		}
	} else if subFloat, okFloat := claims["sub"].(float64); okFloat {
		// Если sub - число (float64)
		userID = int(subFloat)
		found = true
	} else if subInt, okInt := claims["sub"].(int); okInt {
		// Если sub - int
		userID = subInt
		found = true
	}

	// Если sub не сработал, пробуем user_id
	if !found {
		if uidStr, okStr := claims["user_id"].(string); okStr {
			if parsed, err := strconv.Atoi(uidStr); err == nil {
				userID = parsed
				found = true
			}
		} else if uidFloat, okFloat := claims["user_id"].(float64); okFloat {
			userID = int(uidFloat)
			found = true
		} else if uidInt, okInt := claims["user_id"].(int); okInt {
			userID = uidInt
			found = true
		}
	}

	if !found {
		return 0, fmt.Errorf("user_id not found in token claims (sub or user_id)")
	}

	return userID, nil
}

// handleWebSocketWithUpgrader обрабатывает WebSocket соединения с кастомным upgrader
func handleWebSocketWithUpgrader(db *database.DB, wsManager *realtime.ConnectionManager, cfg *config.Config, wsUpgrader websocket.Upgrader) gin.HandlerFunc {
	return func(c *gin.Context) {
		gameIDStr := c.Param("game_id")
		gameID, err := uuid.Parse(gameIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid game_id"})
			return
		}

		token := c.Query("token")
		sessionID := c.Query("session_id")
		var userID *int
		var playerSessionID *string

		// Валидация JWT токена
		if token != "" {
			uid, err := validateJWT(token, cfg.JWTSecret)
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
		defer ws.Close()

		// Устанавливаем лимит чтения для защиты от больших сообщений (512KB)
		ws.SetReadLimit(512 * 1024)

		service := services.NewGameService(db)
		ctx := c.Request.Context()

		// Загружаем игру
		gameDetail, err := service.GetGame(ctx, gameID)
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
			Websocket: ws,
			UserID:    userID,
			Role:      role,
		}
		wsManager.Connect(gameID, connInfo)
		defer wsManager.Disconnect(ws)

		// Отправляем начальное состояние
		stateMsg := map[string]interface{}{
			"type": "state",
			"game": gameDetail,
		}
		if err := wsManager.SendPersonal(ws, stateMsg); err != nil {
			// Failed to send initial state
			return
		}

		// Отправляем начальное количество зрителей
		viewersCount := wsManager.GetViewersCount(gameID)
		viewersMsg := map[string]interface{}{
			"type":          "viewers_count",
			"viewers_count": viewersCount,
		}
		if err := wsManager.SendPersonal(ws, viewersMsg); err != nil {
			// Failed to send initial viewers count
		}

		// Кэш последних ходов для оптимизации
		cachedMoves := make([]models.Move, len(gameDetail.Moves))
		copy(cachedMoves, gameDetail.Moves)
		const recentMovesLimit = 60

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
				wsManager.SendPersonal(ws, map[string]interface{}{
					"type":           "error",
					"message":        "Invalid payload",
					"client_move_id": getClientMoveID(rawMessage),
				})
				continue
			}

			if userID == nil && playerSessionID == nil {
				wsManager.SendPersonal(ws, map[string]interface{}{
					"type":           "move_rejected",
					"message":        "Authentication or session_id required",
					"client_move_id": payload.ClientMoveID,
				})
				continue
			}

			// Обработка хода через service.MakeMove()
			updatedGame, move, err := service.MakeMove(ctx, gameID, userID, playerSessionID, &payload)
			if err != nil {
				// Move rejected
				wsManager.SendPersonal(ws, map[string]interface{}{
					"type":           "move_rejected",
					"message":        err.Error(),
					"client_move_id": payload.ClientMoveID,
				})
				continue
			}

			// Добавляем новый ход в кэш
			if move != nil {
				cachedMoves = append(cachedMoves, *move)
				// Ограничиваем размер кэша
				if len(cachedMoves) > recentMovesLimit {
					cachedMoves = cachedMoves[len(cachedMoves)-recentMovesLimit:]
				}
			}

			// Создаем game detail с кэшированными ходами
			broadcastGameDetail := &models.GameDetail{
				Game:  *updatedGame,
				Moves: cachedMoves,
			}
			// Парсим TimeControl из JSON
			if len(updatedGame.TimeControl) > 0 {
				var tc models.TimeControl
				if err := json.Unmarshal(updatedGame.TimeControl, &tc); err != nil {
					// Failed to unmarshal TimeControl
				} else {
					broadcastGameDetail.WhiteFinishMs = &tc.WhiteFinishMs
					broadcastGameDetail.BlackFinishMs = &tc.BlackFinishMs
				}
			}

			// Broadcast обновления всем подключенным
			moveMadeMsg := map[string]interface{}{
				"type":           "move_made",
				"client_move_id": payload.ClientMoveID,
				"move":           move,
				"game":           *broadcastGameDetail,
			}
			if err := wsManager.Broadcast(gameID, moveMadeMsg); err != nil {
				// Failed to broadcast move_made
			}

			// Если игра завершена, отправляем game_finished
			if updatedGame.Status == models.GameStatusFinished {
				finishedMsg := map[string]interface{}{
					"type": "game_finished",
					"game": broadcastGameDetail,
				}
				if err := wsManager.Broadcast(gameID, finishedMsg); err != nil {
					// Failed to broadcast game_finished
				}
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
