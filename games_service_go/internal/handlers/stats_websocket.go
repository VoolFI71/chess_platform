package handlers

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"github.com/yourorg/games_service_go/internal/realtime"
)

// handleStatsWebSocket обрабатывает WebSocket соединения для статистики онлайн
func handleStatsWebSocket(statsManager *realtime.StatsConnectionManager, gameManager *realtime.ConnectionManager, wsUpgrader websocket.Upgrader) gin.HandlerFunc {
	return func(c *gin.Context) {
		ws, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("[WS Stats] Failed to upgrade connection: %v", err)
			return
		}
		defer ws.Close()

		// Устанавливаем лимит чтения для защиты от больших сообщений
		ws.SetReadLimit(1024)

		// Регистрируем соединение
		statsManager.Connect(ws)
		defer statsManager.Disconnect(ws)

		// Отправляем начальную статистику
		onlinePlayers, activeGames := gameManager.GetOnlineStats()
		initialMsg := map[string]interface{}{
			"type":           "online_stats",
			"online_players": onlinePlayers,
			"active_games":   activeGames,
		}
		if err := ws.WriteJSON(initialMsg); err != nil {
			log.Printf("[WS Stats] Failed to send initial stats: %v", err)
			return
		}

		// Основной цикл - просто читаем сообщения (ping/pong) и обрабатываем закрытие
		for {
			_, _, err := ws.ReadMessage()
			if err != nil {
				// Проверяем, не является ли это закрытием соединения
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("[WS Stats] Unexpected close error: %v", err)
				}
				break
			}
			// Можно добавить обработку ping/pong сообщений здесь
		}
	}
}
