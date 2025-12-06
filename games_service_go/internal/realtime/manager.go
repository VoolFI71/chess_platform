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

func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		connections: make(map[uuid.UUID]map[*websocket.Conn]*ConnectionInfo),
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
			break
		}
	}
}

func (cm *ConnectionManager) Broadcast(gameID uuid.UUID, message interface{}) error {
	// Создаем снимок соединений под блокировкой для избежания race conditions
	cm.mu.RLock()
	conns := cm.connections[gameID]
	if conns == nil || len(conns) == 0 {
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
