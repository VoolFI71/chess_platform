package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
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

// Game представляет шахматную партию
//
// Constraint chk_games_has_creator должен проверять:
// - white_id IS NOT NULL OR black_id IS NOT NULL (для авторизованных пользователей)
// ИЛИ
// - metadata->>'white_session_id' IS NOT NULL OR metadata->>'black_session_id' IS NOT NULL (для анонимных пользователей)
//
// Этот constraint создается/обновляется функцией fixCreatorConstraint в main.go при старте сервиса
type Game struct {
	ID                uuid.UUID          `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	WhiteID           *int               `gorm:"index" json:"white_id"` // ID авторизованного игрока за белых (NULL для анонимных)
	BlackID           *int               `gorm:"index" json:"black_id"` // ID авторизованного игрока за черных (NULL для анонимных)
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
	// Metadata содержит дополнительную информацию, включая:
	// - white_session_id: session_id анонимного игрока за белых (если white_id == NULL)
	// - black_session_id: session_id анонимного игрока за черных (если black_id == NULL)
	// - rated: true/false - является ли партия рейтинговой
	// - variant: тип шахмат (обычно "standard")
	Metadata   datatypes.JSON `gorm:"type:jsonb" json:"metadata"`
	CreatedAt  time.Time      `gorm:"default:CURRENT_TIMESTAMP" json:"created_at"`
	StartedAt  *time.Time     `json:"started_at"`
	FinishedAt *time.Time     `json:"finished_at"`
	// Связи
	Moves     []Move         `gorm:"foreignKey:GameID;constraint:OnDelete:CASCADE" json:"moves,omitempty"`
	Snapshots []GameSnapshot `gorm:"foreignKey:GameID;constraint:OnDelete:CASCADE" json:"snapshots,omitempty"`
}

// AfterMigrate создает constraint для поддержки анонимных игр через session_id
// Этот метод вызывается автоматически GORM после миграции таблицы (если используется AutoMigrate)
// В текущей реализации constraint обновляется функцией fixCreatorConstraint в main.go при старте сервиса
func (Game) AfterMigrate(tx *gorm.DB) error {
	// Проверяем, существует ли constraint
	var count int64
	if err := tx.Raw(`
		SELECT COUNT(*) 
		FROM pg_constraint 
		WHERE conname = 'chk_games_has_creator'
	`).Scan(&count).Error; err != nil {
		return fmt.Errorf("failed to check constraint: %w", err)
	}

	if count > 0 {
		// Удаляем старый constraint
		if err := tx.Exec(`ALTER TABLE games DROP CONSTRAINT IF EXISTS chk_games_has_creator`).Error; err != nil {
			return fmt.Errorf("failed to drop old constraint: %w", err)
		}
	}

	// Создаем новый constraint, который учитывает session_id в metadata
	// Используем IF NOT EXISTS для безопасности
	if err := tx.Exec(`
		DO $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM pg_constraint WHERE conname = 'chk_games_has_creator'
			) THEN
				ALTER TABLE games ADD CONSTRAINT chk_games_has_creator 
				CHECK (
					(white_id IS NOT NULL OR black_id IS NOT NULL) OR
					(
						(metadata->>'white_session_id' IS NOT NULL AND metadata->>'white_session_id' != '') OR
						(metadata->>'black_session_id' IS NOT NULL AND metadata->>'black_session_id' != '')
					)
				);
			END IF;
		END $$;
	`).Error; err != nil {
		return fmt.Errorf("failed to create constraint: %w", err)
	}

	return nil
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
