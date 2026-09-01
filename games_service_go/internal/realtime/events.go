package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const realtimeEventsChannel = "games:realtime-events"

type realtimeEvent struct {
	Type        string          `json:"type"`
	Source      string          `json:"source,omitempty"`
	GameID      uuid.UUID       `json:"game_id,omitempty"`
	UserID      int             `json:"user_id,omitempty"`
	ViewerCount int             `json:"viewer_count,omitempty"`
	Payload     json.RawMessage `json:"payload,omitempty"`
}

// RedisEventBus synchronizes game and matchmaking notifications between
// service replicas. Game events published locally are not replayed locally.
type RedisEventBus struct {
	rdb        *redis.Client
	instanceID string
}

func NewRedisEventBus(rdb *redis.Client) *RedisEventBus {
	return &RedisEventBus{rdb: rdb, instanceID: uuid.NewString()}
}

func (b *RedisEventBus) PublishGame(ctx context.Context, gameID uuid.UUID, payload []byte) error {
	data, err := json.Marshal(realtimeEvent{
		Type:    "game",
		Source:  b.instanceID,
		GameID:  gameID,
		Payload: payload,
	})
	if err != nil {
		return err
	}
	return b.rdb.Publish(ctx, realtimeEventsChannel, data).Err()
}

func (b *RedisEventBus) PublishViewerCount(ctx context.Context, gameID uuid.UUID, count int) error {
	data, err := json.Marshal(realtimeEvent{
		Type:        "viewers",
		Source:      b.instanceID,
		GameID:      gameID,
		ViewerCount: count,
	})
	if err != nil {
		return err
	}
	return b.rdb.Publish(ctx, realtimeEventsChannel, data).Err()
}

// NotifyMatch implements services.MatchNotifier without importing services.
func (b *RedisEventBus) NotifyMatch(userID int, gameID uuid.UUID) {
	data, err := json.Marshal(realtimeEvent{Type: "match", UserID: userID, GameID: gameID})
	if err != nil {
		log.Printf("[Realtime] failed to marshal match event: %v", err)
		return
	}
	if err := b.rdb.Publish(context.Background(), realtimeEventsChannel, data).Err(); err != nil {
		log.Printf("[Realtime] failed to publish match event: %v", err)
	}
}

func (b *RedisEventBus) Subscribe(
	ctx context.Context,
	onGame func(uuid.UUID, []byte),
	onMatch func(int, uuid.UUID),
	onViewers func(uuid.UUID, string, int),
) error {
	pubsub := b.rdb.Subscribe(ctx, realtimeEventsChannel)
	defer pubsub.Close()
	if _, err := pubsub.Receive(ctx); err != nil {
		return fmt.Errorf("subscribe realtime events: %w", err)
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case message, ok := <-pubsub.Channel():
			if !ok {
				return fmt.Errorf("realtime event subscription closed")
			}
			var event realtimeEvent
			if err := json.Unmarshal([]byte(message.Payload), &event); err != nil {
				log.Printf("[Realtime] failed to decode event: %v", err)
				continue
			}
			switch event.Type {
			case "game":
				if event.Source != b.instanceID && event.GameID != uuid.Nil {
					onGame(event.GameID, event.Payload)
				}
			case "match":
				if event.UserID > 0 && event.GameID != uuid.Nil {
					onMatch(event.UserID, event.GameID)
				}
			case "viewers":
				if event.Source != b.instanceID && event.GameID != uuid.Nil {
					onViewers(event.GameID, event.Source, event.ViewerCount)
				}
			}
		}
	}
}
