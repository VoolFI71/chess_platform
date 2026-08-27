package models

import (
	"time"

	"github.com/google/uuid"

	shared "github.com/yourorg/go_shared/models"
)

// Type aliases — transparent re-exports, struct literals work unchanged
type GameStatus = shared.GameStatus

const (
	GameStatusCreated  = shared.GameStatusCreated
	GameStatusActive   = shared.GameStatusActive
	GameStatusPaused   = shared.GameStatusPaused
	GameStatusFinished = shared.GameStatusFinished
)

type SideToMove = shared.SideToMove

const (
	SideWhite = shared.SideWhite
	SideBlack = shared.SideBlack
)

type GameResult = shared.GameResult

const (
	ResultWhiteWin = shared.ResultWhiteWin
	ResultBlackWin = shared.ResultBlackWin
	ResultDraw     = shared.ResultDraw
)

type TerminationReason = shared.TerminationReason

const (
	TerminationCheckmate   = shared.TerminationCheckmate
	TerminationResignation = shared.TerminationResignation
	TerminationTimeout     = shared.TerminationTimeout
	TerminationStalemate   = shared.TerminationStalemate
	TerminationDraw        = shared.TerminationDraw
	TerminationAbandoned   = shared.TerminationAbandoned
)

type TimeControl = shared.TimeControl
type Metadata = shared.Metadata
type Game = shared.Game
type Move = shared.Move

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

type GameSnapshot struct {
	ID                int       `gorm:"primaryKey;autoIncrement" json:"id"`
	GameID            uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:uq_game_snapshots_game_move_index" json:"game_id"`
	SnapshotMoveIndex int       `gorm:"not null;uniqueIndex:uq_game_snapshots_game_move_index" json:"snapshot_move_index"`
	Fen               string    `gorm:"type:text;not null" json:"fen"`
	CreatedAt         time.Time `gorm:"default:CURRENT_TIMESTAMP" json:"created_at"`
}
