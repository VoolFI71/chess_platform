package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/yourorg/computer_games_service/internal/config"
	"github.com/yourorg/computer_games_service/internal/realtime"
	"github.com/yourorg/computer_games_service/internal/services"
	"github.com/yourorg/go_shared/middleware"
)

// handleWebSocket обрабатывает WebSocket соединения для компьютерных игр
func handleWebSocket(cfg *config.Config, service *services.ComputerGameService, wsManager *realtime.Manager, upgrader websocket.Upgrader) gin.HandlerFunc {
	return func(c *gin.Context) {
		gameIDStr := c.Param("game_id")
		gameID, err := uuid.Parse(gameIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid game_id"})
			return
		}

		// Получаем идентификаторы игрока из query (WebSocket не поддерживает кастомные заголовки в браузере)
		token := c.Query("token")
		sessionID := c.Query("session_id")
		var playerID *int
		var playerSessionID *string

		if token != "" {
			uid, err := middleware.ValidateJWT(token, cfg.JWTSecret, cfg.JWTAlgorithm)
			if err == nil {
				playerID = &uid
			}
		}
		if sessionID != "" && playerID == nil {
			if _, err := uuid.Parse(sessionID); err == nil {
				playerSessionID = &sessionID
			}
		}

		// Обновляем соединение до WebSocket
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("[WebSocket] Failed to upgrade connection: %v", err)
			return
		}
		defer conn.Close()

		// Регистрируем соединение
		wsManager.Register(gameID.String(), conn)
		defer wsManager.Unregister(gameID.String(), conn)

		log.Printf("[WebSocket] Client connected to game %s", gameID)

		// Создаем контекст для WebSocket соединения с таймаутом для операций БД
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		// Обработка сообщений
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("[WebSocket] Error reading message: %v", err)
				break
			}

			var msg map[string]interface{}
			if err := json.Unmarshal(message, &msg); err != nil {
				log.Printf("[WebSocket] Failed to parse message: %v", err)
				continue
			}

			// Обработка хода игрока
			if msgType, ok := msg["type"].(string); ok && msgType == "move" {
				uciMove, ok := msg["uci"].(string)
				if !ok {
					log.Printf("[WebSocket] Invalid move message: missing uci")
					continue
				}

				if playerID == nil && playerSessionID == nil {
					errorMsg := map[string]interface{}{
						"type":  "error",
						"error": "Authentication or session_id required to make moves",
					}
					_ = conn.WriteJSON(errorMsg)
					continue
				}

				// Применяем ход игрока с контекстом запроса
				if err := service.MakePlayerMove(ctx, gameID, uciMove, playerID, playerSessionID); err != nil {
					log.Printf("[WebSocket] Failed to make player move: %v", err)
					// Отправляем ошибку клиенту
					errorMsg := map[string]interface{}{
						"type":  "error",
						"error": err.Error(),
					}
					if err := conn.WriteJSON(errorMsg); err != nil {
						log.Printf("[WebSocket] Failed to send error: %v", err)
					}
					continue
				}

				// Получаем обновленную игру с контекстом запроса
				updatedGame, err := service.GetGame(ctx, gameID)
				if err != nil {
					log.Printf("[WebSocket] Failed to get updated game: %v", err)
					continue
				}

				// Отправляем обновление всем подключенным клиентам
				updateMsg := map[string]interface{}{
					"type": "game_update",
					"game": updatedGame,
				}
				wsManager.Broadcast(gameID.String(), updateMsg)
			}
		}

		log.Printf("[WebSocket] Client disconnected from game %s", gameID)
	}
}
