package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

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

var upgrader = createUpgrader(nil) // По умолчанию разрешаем все origins

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

func handleWebSocket(db *database.DB, wsManager *realtime.ConnectionManager, cfg *config.Config) gin.HandlerFunc {
	return handleWebSocketWithUpgrader(db, wsManager, cfg, upgrader)
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
		var userID *int

		// Валидация JWT токена
		if token != "" {
			uid, err := validateJWT(token, cfg.JWTSecret)
			if err == nil {
				userID = &uid
			} else {
				log.Printf("[WS] JWT validation failed: %v", err)
				// Не закрываем соединение, просто работаем как viewer
			}
		}

		ws, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("[WS] Failed to upgrade connection: %v", err)
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
			log.Printf("[WS] Failed to get game %s: %v", gameID, err)
			ws.WriteJSON(map[string]interface{}{
				"type":    "error",
				"message": "Game not found",
			})
			return
		}

		// Определяем роль
		role := resolveRole(gameDetail.Game, userID)

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
			log.Printf("[WS] Failed to send initial state: %v", err)
			return
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
					log.Printf("[WS] Unexpected close error: %v", err)
				}
				break
			}

			// Парсим payload
			var payload services.MakeMovePayload
			if err := json.Unmarshal(rawMessage, &payload); err != nil {
				log.Printf("[WS] Failed to parse payload: %v", err)
				wsManager.SendPersonal(ws, map[string]interface{}{
					"type":           "error",
					"message":        "Invalid payload",
					"client_move_id": getClientMoveID(rawMessage),
				})
				continue
			}

			if userID == nil {
				wsManager.SendPersonal(ws, map[string]interface{}{
					"type":           "move_rejected",
					"message":        "Authentication required",
					"client_move_id": payload.ClientMoveID,
				})
				continue
			}

			log.Printf("[WS RECEIVE MOVE] game_id=%s player_id=%d client_move_id=%s uci=%s",
				gameID, *userID, payload.ClientMoveID, payload.UCI)

			// Обработка хода через service.MakeMove()
			updatedGame, move, err := service.MakeMove(ctx, gameID, *userID, &payload)
			if err != nil {
				log.Printf("[WS] Move rejected: %v", err)
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
					log.Printf("[WS] Failed to unmarshal TimeControl for game %s: %v", gameID, err)
				} else {
					broadcastGameDetail.WhiteFinishMs = &tc.WhiteFinishMs
					broadcastGameDetail.BlackFinishMs = &tc.BlackFinishMs
				}
			}

			moveTimestampMs := move.CreatedAt.UnixMilli()
			nowMs := time.Now().UTC().UnixMilli()

			log.Printf("[WS BROADCAST move_made] game_id=%s client_move_id=%s move_id=%d move_index=%d move_created_at=%s move_timestamp_ms=%d game_white_clock=%d game_black_clock=%d game_next_turn=%s now_ms=%d",
				gameID, payload.ClientMoveID, move.ID, move.MoveIndex, move.CreatedAt.Format(time.RFC3339),
				moveTimestampMs, updatedGame.WhiteClockMs, updatedGame.BlackClockMs, updatedGame.NextTurn, nowMs)

			// Broadcast обновления всем подключенным
			moveMadeMsg := map[string]interface{}{
				"type":           "move_made",
				"client_move_id": payload.ClientMoveID,
				"move":           move,
				"game":           *broadcastGameDetail,
			}
			if err := wsManager.Broadcast(gameID, moveMadeMsg); err != nil {
				log.Printf("[WS] Failed to broadcast move_made: %v", err)
			}

			// Если игра завершена, отправляем game_finished
			if updatedGame.Status == models.GameStatusFinished {
				finishedMsg := map[string]interface{}{
					"type": "game_finished",
					"game": broadcastGameDetail,
				}
				if err := wsManager.Broadcast(gameID, finishedMsg); err != nil {
					log.Printf("[WS] Failed to broadcast game_finished: %v", err)
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
