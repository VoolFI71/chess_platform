package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type ClocksAfter struct {
	WhitePastMs   int64 `json:"white_past_ms"`
	BlackPastMs   int64 `json:"black_past_ms"`
	WhiteFinishMs int64 `json:"white_finish_ms"`
	BlackFinishMs int64 `json:"black_finish_ms"`
}

func (ca *ClocksAfter) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to unmarshal ClocksAfter value: %v", value)
	}
	return json.Unmarshal(bytes, ca)
}

func (ca ClocksAfter) Value() (driver.Value, error) {
	return json.Marshal(ca)
}

type Move struct {
	ID          int       `gorm:"primaryKey;autoIncrement" json:"id"`
	GameID      uuid.UUID `gorm:"type:uuid;not null;index" json:"game_id"`
	MoveIndex   int       `gorm:"not null" json:"move_index"`
	UCI         string    `gorm:"type:varchar(10);not null" json:"uci"`
	SAN         *string   `gorm:"type:varchar(20)" json:"san"`
	FenAfter    string    `gorm:"type:text;not null" json:"fen_after"`
	PlayerID    *int      `gorm:"index" json:"player_id"`
	ClocksAfter []byte    `gorm:"type:jsonb" json:"clocks_after"`
	IsCapture   bool      `gorm:"not null;default:false" json:"is_capture"`
	Promotion   *string   `gorm:"type:varchar(1)" json:"promotion"`
	CreatedAt   time.Time `gorm:"default:CURRENT_TIMESTAMP" json:"created_at"`

	// Связи
	Game Game `gorm:"foreignKey:GameID" json:"game,omitempty"`
}

type GameSnapshot struct {
	ID                int       `gorm:"primaryKey;autoIncrement" json:"id"`
	GameID            uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:uq_game_snapshots_game_move_index" json:"game_id"`
	SnapshotMoveIndex int       `gorm:"not null;uniqueIndex:uq_game_snapshots_game_move_index" json:"snapshot_move_index"`
	Fen               string    `gorm:"type:text;not null" json:"fen"`
	CreatedAt         time.Time `gorm:"default:CURRENT_TIMESTAMP" json:"created_at"`

	// Связи
	Game Game `gorm:"foreignKey:GameID" json:"game,omitempty"`
}
