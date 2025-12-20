package realtime

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// Manager управляет WebSocket соединениями
type Manager struct {
	connections map[string]map[*websocket.Conn]bool
	mu          sync.RWMutex
}

// NewManager создает новый менеджер соединений
func NewManager() *Manager {
	return &Manager{
		connections: make(map[string]map[*websocket.Conn]bool),
	}
}

// Register регистрирует новое соединение для игры
func (m *Manager) Register(gameID string, conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.connections[gameID] == nil {
		m.connections[gameID] = make(map[*websocket.Conn]bool)
	}
	m.connections[gameID][conn] = true
}

// Unregister удаляет соединение
func (m *Manager) Unregister(gameID string, conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if connections, ok := m.connections[gameID]; ok {
		delete(connections, conn)
		if len(connections) == 0 {
			delete(m.connections, gameID)
		}
	}
}

// Broadcast отправляет сообщение всем подключенным клиентам игры
func (m *Manager) Broadcast(gameID string, message interface{}) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	connections, ok := m.connections[gameID]
	if !ok {
		return nil // Нет подключенных клиентов
	}

	data, err := json.Marshal(message)
	if err != nil {
		return err
	}

	for conn := range connections {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("[WebSocket] Failed to send message: %v", err)
			// Удаляем проблемное соединение
			delete(connections, conn)
		}
	}

	return nil
}

