package realtime

import (
	"encoding/json"
	"log"
	"sync"
)

type StatsConnectionManager struct {
	connections map[*Client]struct{}
	mu          sync.RWMutex
}

func NewStatsConnectionManager() *StatsConnectionManager {
	return &StatsConnectionManager{connections: make(map[*Client]struct{})}
}

func (scm *StatsConnectionManager) Connect(client *Client) {
	client.Start()
	scm.mu.Lock()
	scm.connections[client] = struct{}{}
	count := len(scm.connections)
	scm.mu.Unlock()
	log.Printf("[WS Stats] client connected, total connections: %d", count)
}

func (scm *StatsConnectionManager) Disconnect(client *Client) {
	scm.mu.Lock()
	_, existed := scm.connections[client]
	delete(scm.connections, client)
	count := len(scm.connections)
	scm.mu.Unlock()
	client.Close()
	if existed {
		log.Printf("[WS Stats] client disconnected, total connections: %d", count)
	}
}

func (scm *StatsConnectionManager) SendPersonal(client *Client, message interface{}) error {
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}
	if !client.Send(data) {
		scm.Disconnect(client)
		return ErrClientUnavailable
	}
	return nil
}

func (scm *StatsConnectionManager) BroadcastStats(onlinePlayers int, activeGames int) error {
	data, err := json.Marshal(map[string]interface{}{
		"type":           "online_stats",
		"online_players": onlinePlayers,
		"active_games":   activeGames,
	})
	if err != nil {
		return err
	}

	scm.mu.RLock()
	clients := make([]*Client, 0, len(scm.connections))
	for client := range scm.connections {
		clients = append(clients, client)
	}
	scm.mu.RUnlock()

	for _, client := range clients {
		if !client.Send(data) {
			scm.Disconnect(client)
		}
	}
	return nil
}

func (scm *StatsConnectionManager) GetConnectionCount() int {
	scm.mu.RLock()
	defer scm.mu.RUnlock()
	return len(scm.connections)
}
