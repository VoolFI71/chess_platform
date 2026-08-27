package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"github.com/yourorg/games_service_go/internal/config"
	"github.com/yourorg/games_service_go/internal/models"
	"github.com/yourorg/games_service_go/internal/realtime"
	"github.com/yourorg/games_service_go/internal/services"
	"github.com/yourorg/go_shared/middleware"
)

type wsMatchmakingMessage struct {
	Type        string `json:"type"`
	TimeControl *struct {
		InitialMs   int64 `json:"initial_ms"`
		IncrementMs int64 `json:"increment_ms"`
	} `json:"time_control,omitempty"`
	Rated bool `json:"rated,omitempty"`
}

func handleMatchmakingWebSocket(
	matchmakingSvc *services.MatchmakingService,
	mmManager *realtime.MatchmakingConnectionManager,
	cfg *config.Config,
	upgrader websocket.Upgrader,
) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Query("token")
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "token required"})
			return
		}

		userID, err := middleware.ValidateJWT(token, cfg.JWTSecret, cfg.JWTAlgorithm)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}
		defer ws.Close()

		ws.SetReadLimit(4 * 1024)

		mmManager.Register(userID, ws)
		defer func() {
			mmManager.Unregister(userID)
			// Auto-remove from queue on disconnect
			if err := matchmakingSvc.Leave(context.Background(), userID); err != nil {
				log.Printf("[Matchmaking WS] Failed to remove user %d from queue on disconnect: %v", userID, err)
			}
		}()

		for {
			_, rawMsg, err := ws.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure, websocket.CloseAbnormalClosure) {
					log.Printf("[Matchmaking WS] Unexpected close for user %d: %v", userID, err)
				}
				break
			}

			var msg wsMatchmakingMessage
			if err := json.Unmarshal(rawMsg, &msg); err != nil {
				sendWSError(ws, "invalid message format")
				continue
			}

			switch msg.Type {
			case "join":
				if msg.TimeControl == nil {
					sendWSError(ws, "time_control required")
					continue
				}

				tc := &models.TimeControl{
					InitialMs:   msg.TimeControl.InitialMs,
					IncrementMs: msg.TimeControl.IncrementMs,
					Type:        "STANDARD",
				}

				result, err := matchmakingSvc.Join(c.Request.Context(), userID, tc, msg.Rated)
				if err != nil {
					sendWSError(ws, err.Error())
					continue
				}

				sendWSJSON(ws, map[string]interface{}{
					"type":    result.Status,
					"game_id": result.GameID,
				})

			case "leave":
				if err := matchmakingSvc.Leave(c.Request.Context(), userID); err != nil {
					sendWSError(ws, err.Error())
					continue
				}
				sendWSJSON(ws, map[string]interface{}{
					"type": "left",
				})

			default:
				sendWSError(ws, "unknown message type: "+msg.Type)
			}
		}
	}
}

func sendWSJSON(ws *websocket.Conn, msg interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	ws.WriteMessage(websocket.TextMessage, data)
}

func sendWSError(ws *websocket.Conn, message string) {
	sendWSJSON(ws, map[string]interface{}{
		"type":    "error",
		"message": message,
	})
}
