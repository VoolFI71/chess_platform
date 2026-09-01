package realtime

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/google/uuid"
)

type MatchmakingConnectionManager struct {
	mu    sync.RWMutex
	conns map[int]*Client
}

func NewMatchmakingConnectionManager() *MatchmakingConnectionManager {
	return &MatchmakingConnectionManager{conns: make(map[int]*Client)}
}

func (m *MatchmakingConnectionManager) Register(userID int, client *Client) {
	client.Start()
	m.mu.Lock()
	old := m.conns[userID]
	m.conns[userID] = client
	m.mu.Unlock()

	if old != nil && old != client {
		old.Close()
	}
	log.Printf("[Matchmaking WS] user %d connected", userID)
}

func (m *MatchmakingConnectionManager) Unregister(userID int, client *Client) bool {
	m.mu.Lock()
	if m.conns[userID] != client {
		m.mu.Unlock()
		return false
	}
	delete(m.conns, userID)
	m.mu.Unlock()
	client.Close()
	log.Printf("[Matchmaking WS] user %d disconnected", userID)
	return true
}

func (m *MatchmakingConnectionManager) SendToUser(userID int, message interface{}) error {
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}
	m.mu.RLock()
	client := m.conns[userID]
	m.mu.RUnlock()
	if client == nil {
		return nil
	}
	if !client.Send(data) {
		m.Unregister(userID, client)
		return ErrClientUnavailable
	}
	return nil
}

func (m *MatchmakingConnectionManager) IsConnected(userID int) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.conns[userID] != nil
}

func (m *MatchmakingConnectionManager) NotifyMatch(userID int, gameID uuid.UUID) {
	if err := m.SendToUser(userID, map[string]interface{}{
		"type":    "matched",
		"game_id": gameID,
	}); err != nil {
		log.Printf("[Matchmaking WS] failed to notify user %d: %v", userID, err)
	}
}
