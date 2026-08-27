package models

import (
	shared "github.com/yourorg/go_shared/models"
)

// Type aliases — transparent re-exports
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
	Moves         []Move `json:"moves"`
	WhiteFinishMs *int64 `json:"white_finish_ms,omitempty"`
	BlackFinishMs *int64 `json:"black_finish_ms,omitempty"`
}
