package realtime

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type MatchmakingConnectionManager struct {
	mu    sync.RWMutex
	conns map[int]*websocket.Conn // userID -> ws connection
}

func NewMatchmakingConnectionManager() *MatchmakingConnectionManager {
	return &MatchmakingConnectionManager{
		conns: make(map[int]*websocket.Conn),
	}
}

func (m *MatchmakingConnectionManager) Register(userID int, ws *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if old, ok := m.conns[userID]; ok && old != ws {
		old.Close()
	}
	m.conns[userID] = ws
	log.Printf("[Matchmaking WS] User %d connected", userID)
}

func (m *MatchmakingConnectionManager) Unregister(userID int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.conns, userID)
	log.Printf("[Matchmaking WS] User %d disconnected", userID)
}

func (m *MatchmakingConnectionManager) SendToUser(userID int, message interface{}) error {
	m.mu.RLock()
	ws, ok := m.conns[userID]
	m.mu.RUnlock()

	if !ok || ws == nil {
		return nil
	}

	data, err := json.Marshal(message)
	if err != nil {
		return err
	}

	if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
		log.Printf("[Matchmaking WS] Failed to send to user %d: %v", userID, err)
		return err
	}
	return nil
}

func (m *MatchmakingConnectionManager) IsConnected(userID int) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.conns[userID]
	return ok
}

// NotifyMatch реализует интерфейс services.MatchNotifier — отправляет пользователю уведомление о найденной паре.
func (m *MatchmakingConnectionManager) NotifyMatch(userID int, gameID uuid.UUID) {
	m.SendToUser(userID, map[string]interface{}{
		"type":    "matched",
		"game_id": gameID,
	})
}
