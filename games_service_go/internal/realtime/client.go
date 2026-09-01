package realtime

import (
	"errors"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait       = 10 * time.Second
	pongWait        = 60 * time.Second
	pingPeriod      = 50 * time.Second
	defaultQueueCap = 64
)

var ErrClientUnavailable = errors.New("websocket client is unavailable")

// Client owns all writes to one WebSocket connection. Handlers keep reading
// from WS directly, while every outbound message goes through Send.
type Client struct {
	WS   *websocket.Conn
	send chan []byte
	done chan struct{}

	startOnce sync.Once
	closeOnce sync.Once
}

func NewClient(ws *websocket.Conn) *Client {
	return &Client{
		WS:   ws,
		send: make(chan []byte, defaultQueueCap),
		done: make(chan struct{}),
	}
}

func (c *Client) Start() {
	c.startOnce.Do(func() { go c.writePump() })
}

func (c *Client) SetReadDeadline() {
	_ = c.WS.SetReadDeadline(time.Now().Add(pongWait))
	c.WS.SetPongHandler(func(string) error {
		return c.WS.SetReadDeadline(time.Now().Add(pongWait))
	})
}

// Send never blocks a request or another client. A full queue identifies a
// slow connection, which the caller should remove.
func (c *Client) Send(data []byte) bool {
	select {
	case <-c.done:
		return false
	default:
	}

	select {
	case <-c.done:
		return false
	case c.send <- data:
		return true
	default:
		return false
	}
}

func (c *Client) Close() {
	c.closeOnce.Do(func() {
		close(c.done)
		_ = c.WS.Close()
	})
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-c.done:
			return
		case data := <-c.send:
			_ = c.WS.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.WS.WriteMessage(websocket.TextMessage, data); err != nil {
				c.Close()
				return
			}
		case <-ticker.C:
			_ = c.WS.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.WS.WriteMessage(websocket.PingMessage, nil); err != nil {
				c.Close()
				return
			}
		}
	}
}
