package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type GameStatus string

const (
	GameStatusCreated  GameStatus = "CREATED"
	GameStatusActive   GameStatus = "ACTIVE"
	GameStatusPaused   GameStatus = "PAUSED"
	GameStatusFinished GameStatus = "FINISHED"
)

type SideToMove string

const (
	SideWhite SideToMove = "w"
	SideBlack SideToMove = "b"
)

type GameResult string

const (
	ResultWhiteWin GameResult = "1-0"
	ResultBlackWin GameResult = "0-1"
	ResultDraw     GameResult = "1/2-1/2"
)

type TerminationReason string

const (
	TerminationCheckmate   TerminationReason = "CHECKMATE"
	TerminationResignation TerminationReason = "RESIGNATION"
	TerminationTimeout     TerminationReason = "TIMEOUT"
)

type TimeControl struct {
	InitialMs     int64  `json:"initial_ms"`
	IncrementMs   int64  `json:"increment_ms"`
	Type          string `json:"type"`
	WhiteFinishMs int64  `json:"white_finish_ms"`
	BlackFinishMs int64  `json:"black_finish_ms"`
}

func (tc *TimeControl) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to unmarshal TimeControl value: %v", value)
	}
	return json.Unmarshal(bytes, tc)
}

func (tc TimeControl) Value() (driver.Value, error) {
	return json.Marshal(tc)
}

type Metadata map[string]interface{}

func (m *Metadata) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to unmarshal Metadata value: %v", value)
	}
	return json.Unmarshal(bytes, m)
}

func (m Metadata) Value() (driver.Value, error) {
	return json.Marshal(m)
}

type Game struct {
	ID                uuid.UUID          `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WhiteID           *int               `gorm:"index" json:"white_id"`
	BlackID           *int               `gorm:"index" json:"black_id"`
	InitialPos        string             `gorm:"type:text;not null" json:"initial_pos"`
	CurrentPos        string             `gorm:"type:text;not null" json:"current_pos"`
	NextTurn          SideToMove         `gorm:"type:varchar(1);not null;default:'w'" json:"next_turn"`
	TimeControl       datatypes.JSON     `gorm:"type:jsonb" json:"time_control"`
	MoveCount         int                `gorm:"not null;default:0" json:"move_count"`
	Status            GameStatus         `gorm:"type:varchar(20);not null;default:'CREATED';index" json:"status"`
	WhiteClockMs      int64              `gorm:"not null;default:0;check:white_clock_ms >= 0" json:"white_clock_ms"`
	BlackClockMs      int64              `gorm:"not null;default:0;check:black_clock_ms >= 0" json:"black_clock_ms"`
	Result            *GameResult        `gorm:"type:varchar(10)" json:"result"`
	TerminationReason *TerminationReason `gorm:"type:varchar(50)" json:"termination_reason"`
	EndedBy           *int               `json:"ended_by"`
	PGN               *string            `gorm:"type:text" json:"pgn"`
	Metadata          datatypes.JSON     `gorm:"type:jsonb" json:"metadata"`
	CreatedAt         time.Time          `gorm:"default:CURRENT_TIMESTAMP" json:"created_at"`
	StartedAt         *time.Time         `json:"started_at"`
	FinishedAt        *time.Time         `json:"finished_at"`

	// Связи
	Moves     []Move         `gorm:"foreignKey:GameID;constraint:OnDelete:CASCADE" json:"moves,omitempty"`
	Snapshots []GameSnapshot `gorm:"foreignKey:GameID;constraint:OnDelete:CASCADE" json:"snapshots,omitempty"`
}

type GameDetail struct {
	Game
	WhiteFinishMs *int64 `json:"white_finish_ms"`
	BlackFinishMs *int64 `json:"black_finish_ms"`
	Moves         []Move `json:"moves"`
}

type GameFormatStats struct {
	Format      string  `json:"format"`
	GamesPlayed int     `json:"games_played"`
	Wins        int     `json:"wins"`
	Losses      int     `json:"losses"`
	Draws       int     `json:"draws"`
	WinRate     float64 `json:"win_rate"`
}

type UserGameStats struct {
	TotalGames     int               `json:"total_games"`
	TotalWins      int               `json:"total_wins"`
	TotalLosses    int               `json:"total_losses"`
	TotalDraws     int               `json:"total_draws"`
	OverallWinRate float64           `json:"overall_win_rate"`
	BlitzRating    int               `json:"blitz_rating"`
	BulletRating   int               `json:"bullet_rating"`
	RapidRating    int               `json:"rapid_rating"`
	PuzzleRating   int               `json:"puzzle_rating"`
	ByFormat       []GameFormatStats `json:"by_format"`
}
