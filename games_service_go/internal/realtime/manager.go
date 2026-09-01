package realtime

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Role string

const (
	RoleWhite  Role = "white"
	RoleBlack  Role = "black"
	RoleViewer Role = "viewer"
)

type ConnectionInfo struct {
	Client *Client
	UserID *int
	Role   Role
}

type ConnectionManager struct {
	connections  map[uuid.UUID]map[*Client]*ConnectionInfo
	gameByClient map[*Client]uuid.UUID
	publisher    interface {
		PublishGame(context.Context, uuid.UUID, []byte) error
	}
	viewerPublisher interface {
		PublishViewerCount(context.Context, uuid.UUID, int) error
	}
	remoteViewerCounts map[uuid.UUID]map[string]viewerPresence
	mu                 sync.RWMutex
}

type viewerPresence struct {
	count     int
	updatedAt time.Time
}

const (
	viewerPresenceRefreshInterval = 30 * time.Second
	viewerPresenceTTL             = 90 * time.Second
)

var statsBroadcaster func(onlinePlayers int, activeGames int) error

func SetStatsBroadcaster(broadcaster func(onlinePlayers int, activeGames int) error) {
	statsBroadcaster = broadcaster
}

func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		connections:        make(map[uuid.UUID]map[*Client]*ConnectionInfo),
		gameByClient:       make(map[*Client]uuid.UUID),
		remoteViewerCounts: make(map[uuid.UUID]map[string]viewerPresence),
	}
}

func (cm *ConnectionManager) SetViewerPublisher(publisher interface {
	PublishViewerCount(context.Context, uuid.UUID, int) error
}) {
	cm.mu.Lock()
	cm.viewerPublisher = publisher
	cm.mu.Unlock()
}

func (cm *ConnectionManager) SetPublisher(publisher interface {
	PublishGame(context.Context, uuid.UUID, []byte) error
}) {
	cm.mu.Lock()
	cm.publisher = publisher
	cm.mu.Unlock()
}

func (cm *ConnectionManager) notifyStatsChange() {
	if statsBroadcaster == nil {
		return
	}
	onlinePlayers, activeGames := cm.GetOnlineStats()
	if err := statsBroadcaster(onlinePlayers, activeGames); err != nil {
		log.Printf("[WS Stats] failed to broadcast stats: %v", err)
	}
}

func (cm *ConnectionManager) Connect(gameID uuid.UUID, conn *ConnectionInfo) {
	conn.Client.Start()
	cm.mu.Lock()
	if cm.connections[gameID] == nil {
		cm.connections[gameID] = make(map[*Client]*ConnectionInfo)
	}
	cm.connections[gameID][conn.Client] = conn
	cm.gameByClient[conn.Client] = gameID
	cm.mu.Unlock()

	log.Printf("[WS] client connected to game %s, role: %s", gameID, conn.Role)
	cm.notifyStatsChange()
	_ = cm.BroadcastViewersCount(gameID)
}

func (cm *ConnectionManager) Disconnect(client *Client) {
	cm.mu.Lock()
	gameID, exists := cm.gameByClient[client]
	if exists {
		delete(cm.gameByClient, client)
		conns := cm.connections[gameID]
		delete(conns, client)
		if len(conns) == 0 {
			delete(cm.connections, gameID)
		}
	}
	cm.mu.Unlock()

	client.Close()
	if !exists {
		return
	}
	log.Printf("[WS] client disconnected from game %s", gameID)
	cm.notifyStatsChange()
	_ = cm.BroadcastViewersCount(gameID)
}

func (cm *ConnectionManager) Broadcast(gameID uuid.UUID, message interface{}) error {
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}
	cm.broadcastData(gameID, data)
	cm.mu.RLock()
	publisher := cm.publisher
	cm.mu.RUnlock()
	if publisher != nil {
		if err := publisher.PublishGame(context.Background(), gameID, data); err != nil {
			return err
		}
	}
	return nil
}

func (cm *ConnectionManager) BroadcastRemote(gameID uuid.UUID, data []byte) {
	cm.broadcastData(gameID, data)
}

func (cm *ConnectionManager) broadcastData(gameID uuid.UUID, data []byte) {
	cm.mu.RLock()
	clients := make([]*Client, 0, len(cm.connections[gameID]))
	for client := range cm.connections[gameID] {
		clients = append(clients, client)
	}
	cm.mu.RUnlock()

	for _, client := range clients {
		if !client.Send(data) {
			cm.Disconnect(client)
		}
	}
}

func (cm *ConnectionManager) SendPersonal(client *Client, message interface{}) error {
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}
	if !client.Send(data) {
		cm.Disconnect(client)
		return ErrClientUnavailable
	}
	return nil
}

func (cm *ConnectionManager) GetOnlineStats() (onlinePlayers int, activeGames int) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	uniqueUsers := make(map[int]struct{})
	activeGames = len(cm.connections)
	for _, conns := range cm.connections {
		for _, conn := range conns {
			if conn.UserID != nil {
				uniqueUsers[*conn.UserID] = struct{}{}
			}
		}
	}
	return len(uniqueUsers), activeGames
}

func (cm *ConnectionManager) GetViewersCount(gameID uuid.UUID) int {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	viewersCount := 0
	for _, conn := range cm.connections[gameID] {
		if conn.Role == RoleViewer {
			viewersCount++
		}
	}
	return viewersCount
}

func (cm *ConnectionManager) BroadcastViewersCount(gameID uuid.UUID) error {
	localCount := cm.GetViewersCount(gameID)
	cm.publishViewerCount(gameID, localCount)
	return cm.broadcastViewerCount(gameID)
}

func (cm *ConnectionManager) publishViewerCount(gameID uuid.UUID, count int) {
	cm.mu.RLock()
	publisher := cm.viewerPublisher
	cm.mu.RUnlock()
	if publisher == nil {
		return
	}
	if err := publisher.PublishViewerCount(context.Background(), gameID, count); err != nil {
		log.Printf("[WS] failed to publish viewers count for game %s: %v", gameID, err)
	}
}

func (cm *ConnectionManager) broadcastViewerCount(gameID uuid.UUID) error {
	cm.mu.RLock()
	viewersCount := cm.localViewersCountLocked(gameID)
	for _, presence := range cm.remoteViewerCounts[gameID] {
		viewersCount += presence.count
	}
	cm.mu.RUnlock()

	data, err := json.Marshal(map[string]interface{}{
		"type":          "viewers_count",
		"viewers_count": viewersCount,
	})
	if err != nil {
		return err
	}
	cm.broadcastData(gameID, data)
	return nil
}

func (cm *ConnectionManager) UpdateRemoteViewerCount(gameID uuid.UUID, source string, count int) {
	if source == "" {
		return
	}
	cm.mu.Lock()
	if count <= 0 {
		delete(cm.remoteViewerCounts[gameID], source)
		if len(cm.remoteViewerCounts[gameID]) == 0 {
			delete(cm.remoteViewerCounts, gameID)
		}
	} else {
		if cm.remoteViewerCounts[gameID] == nil {
			cm.remoteViewerCounts[gameID] = make(map[string]viewerPresence)
		}
		cm.remoteViewerCounts[gameID][source] = viewerPresence{count: count, updatedAt: time.Now()}
	}
	cm.mu.Unlock()
	_ = cm.broadcastViewerCount(gameID)
}

func (cm *ConnectionManager) StartViewerPresence(ctx context.Context) {
	ticker := time.NewTicker(viewerPresenceRefreshInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cm.refreshViewerPresence()
		}
	}
}

func (cm *ConnectionManager) refreshViewerPresence() {
	now := time.Now()
	cm.mu.RLock()
	localGames := make([]uuid.UUID, 0, len(cm.connections))
	for gameID := range cm.connections {
		localGames = append(localGames, gameID)
	}
	cm.mu.RUnlock()

	for _, gameID := range localGames {
		cm.publishViewerCount(gameID, cm.GetViewersCount(gameID))
	}

	cm.mu.Lock()
	affectedGames := make([]uuid.UUID, 0)
	for gameID, presences := range cm.remoteViewerCounts {
		changed := false
		for source, presence := range presences {
			if now.Sub(presence.updatedAt) > viewerPresenceTTL {
				delete(presences, source)
				changed = true
			}
		}
		if len(presences) == 0 {
			delete(cm.remoteViewerCounts, gameID)
		}
		if changed {
			affectedGames = append(affectedGames, gameID)
		}
	}
	cm.mu.Unlock()

	for _, gameID := range affectedGames {
		_ = cm.broadcastViewerCount(gameID)
	}
}

func (cm *ConnectionManager) localViewersCountLocked(gameID uuid.UUID) int {
	viewersCount := 0
	for _, conn := range cm.connections[gameID] {
		if conn.Role == RoleViewer {
			viewersCount++
		}
	}
	return viewersCount
}
