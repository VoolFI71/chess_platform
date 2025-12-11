package realtime

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type Role string

const (
	RoleWhite  Role = "white"
	RoleBlack  Role = "black"
	RoleViewer Role = "viewer"
)

type ConnectionInfo struct {
	Websocket *websocket.Conn
	UserID    *int
	Role      Role
}

type ConnectionManager struct {
	connections map[uuid.UUID]map[*websocket.Conn]*ConnectionInfo
	mu          sync.RWMutex
}

// statsBroadcaster - глобальная функция для отправки статистики
// Это позволяет ConnectionManager уведомлять StatsConnectionManager об изменениях
var statsBroadcaster func(onlinePlayers int, activeGames int) error

// SetStatsBroadcaster устанавливает функцию для broadcast статистики
func SetStatsBroadcaster(broadcaster func(onlinePlayers int, activeGames int) error) {
	statsBroadcaster = broadcaster
}

func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		connections: make(map[uuid.UUID]map[*websocket.Conn]*ConnectionInfo),
	}
}

// notifyStatsChange отправляет обновление статистики при изменении
func (cm *ConnectionManager) notifyStatsChange() {
	if statsBroadcaster != nil {
		onlinePlayers, activeGames := cm.GetOnlineStats()
		if err := statsBroadcaster(onlinePlayers, activeGames); err != nil {
			log.Printf("[WS Stats] Failed to broadcast stats: %v", err)
		}
	}
}

func (cm *ConnectionManager) Connect(gameID uuid.UUID, conn *ConnectionInfo) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if cm.connections[gameID] == nil {
		cm.connections[gameID] = make(map[*websocket.Conn]*ConnectionInfo)
	}
	cm.connections[gameID][conn.Websocket] = conn
	log.Printf("[WS] Client connected to game %s, role: %s", gameID, conn.Role)
	// Уведомляем об изменении статистики после разблокировки
	cm.mu.Unlock()
	cm.notifyStatsChange()
	// Отправляем обновление количества зрителей всем подключенным к игре
	cm.BroadcastViewersCount(gameID)
	cm.mu.Lock()
}

func (cm *ConnectionManager) Disconnect(ws *websocket.Conn) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	for gameID, conns := range cm.connections {
		if _, exists := conns[ws]; exists {
			delete(conns, ws)
			log.Printf("[WS] Client disconnected from game %s", gameID)
			if len(conns) == 0 {
				delete(cm.connections, gameID)
			}
			// Уведомляем об изменении статистики после разблокировки
			cm.mu.Unlock()
			cm.notifyStatsChange()
			// Отправляем обновление количества зрителей всем подключенным к игре
			cm.BroadcastViewersCount(gameID)
			cm.mu.Lock()
			break
		}
	}
}

func (cm *ConnectionManager) Broadcast(gameID uuid.UUID, message interface{}) error {
	// Создаем снимок соединений под блокировкой для избежания race conditions
	cm.mu.RLock()
	conns := cm.connections[gameID]
	if len(conns) == 0 {
		cm.mu.RUnlock()
		return nil
	}

	// Создаем копию списка соединений для безопасной итерации без блокировки
	connsSnapshot := make([]*websocket.Conn, 0, len(conns))
	for ws := range conns {
		connsSnapshot = append(connsSnapshot, ws)
	}
	cm.mu.RUnlock()

	data, err := json.Marshal(message)
	if err != nil {
		return err
	}

	// Отправляем сообщения без блокировки, но обрабатываем ошибки синхронно
	for _, ws := range connsSnapshot {
		if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("[WS] Failed to send message: %v", err)
			// Синхронное отключение вместо goroutine для избежания утечек
			cm.Disconnect(ws)
		}
	}

	return nil
}

func (cm *ConnectionManager) SendPersonal(ws *websocket.Conn, message interface{}) error {
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}

	if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
		// Синхронное отключение вместо goroutine для избежания утечек
		cm.Disconnect(ws)
		return err
	}

	return nil
}

// GetOnlineStats возвращает статистику онлайн пользователей и активных игр
func (cm *ConnectionManager) GetOnlineStats() (onlinePlayers int, activeGames int) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	uniqueUsers := make(map[int]bool)
	activeGames = len(cm.connections)

	// Подсчитываем уникальных пользователей среди всех активных соединений
	for _, conns := range cm.connections {
		for _, conn := range conns {
			if conn.UserID != nil {
				uniqueUsers[*conn.UserID] = true
			}
		}
	}

	onlinePlayers = len(uniqueUsers)
	return onlinePlayers, activeGames
}

// GetViewersCount возвращает количество зрителей для конкретной игры
func (cm *ConnectionManager) GetViewersCount(gameID uuid.UUID) int {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	conns := cm.connections[gameID]
	if conns == nil {
		return 0
	}

	viewersCount := 0
	for _, conn := range conns {
		if conn.Role == RoleViewer {
			viewersCount++
		}
	}

	return viewersCount
}

// BroadcastViewersCount отправляет обновление количества зрителей всем подключенным к игре
// ВАЖНО: этот метод должен вызываться БЕЗ блокировки мьютекса, так как GetViewersCount и Broadcast уже работают с блокировками
func (cm *ConnectionManager) BroadcastViewersCount(gameID uuid.UUID) error {
	viewersCount := cm.GetViewersCount(gameID)
	message := map[string]interface{}{
		"type":          "viewers_count",
		"viewers_count": viewersCount,
	}
	return cm.Broadcast(gameID, message)
}
