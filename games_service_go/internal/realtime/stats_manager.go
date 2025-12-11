package realtime

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// StatsConnectionManager управляет WebSocket соединениями для статистики
type StatsConnectionManager struct {
	connections map[*websocket.Conn]bool
	mu          sync.RWMutex
}

// NewStatsConnectionManager создает новый менеджер соединений для статистики
func NewStatsConnectionManager() *StatsConnectionManager {
	return &StatsConnectionManager{
		connections: make(map[*websocket.Conn]bool),
	}
}

// Connect добавляет новое соединение для статистики
func (scm *StatsConnectionManager) Connect(ws *websocket.Conn) {
	scm.mu.Lock()
	defer scm.mu.Unlock()
	scm.connections[ws] = true
	log.Printf("[WS Stats] Client connected, total connections: %d", len(scm.connections))
}

// Disconnect удаляет соединение для статистики
func (scm *StatsConnectionManager) Disconnect(ws *websocket.Conn) {
	scm.mu.Lock()
	defer scm.mu.Unlock()
	delete(scm.connections, ws)
	log.Printf("[WS Stats] Client disconnected, total connections: %d", len(scm.connections))
}

// BroadcastStats отправляет статистику всем подключенным клиентам
func (scm *StatsConnectionManager) BroadcastStats(onlinePlayers int, activeGames int) error {
	scm.mu.RLock()
	conns := make([]*websocket.Conn, 0, len(scm.connections))
	for ws := range scm.connections {
		conns = append(conns, ws)
	}
	scm.mu.RUnlock()

	if len(conns) == 0 {
		return nil
	}

	message := map[string]interface{}{
		"type":           "online_stats",
		"online_players": onlinePlayers,
		"active_games":   activeGames,
	}

	data, err := json.Marshal(message)
	if err != nil {
		return err
	}

	// Отправляем сообщения всем подключенным клиентам
	for _, ws := range conns {
		if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("[WS Stats] Failed to send message: %v", err)
			// Удаляем соединение при ошибке
			scm.Disconnect(ws)
		}
	}

	return nil
}

// GetConnectionCount возвращает количество активных соединений
func (scm *StatsConnectionManager) GetConnectionCount() int {
	scm.mu.RLock()
	defer scm.mu.RUnlock()
	return len(scm.connections)
}
