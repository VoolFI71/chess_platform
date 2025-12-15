package watchdog

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/yourorg/games_service_go/internal/database"
	"github.com/yourorg/games_service_go/internal/models"
	"github.com/yourorg/games_service_go/internal/realtime"
	"github.com/yourorg/games_service_go/internal/services"
)

const (
	watchdogIntervalSeconds     = 15
	abandonedGameTimeoutMinutes = 60
	recentMovesLimit            = 120
)

type Watchdog struct {
	db        *database.DB
	wsManager *realtime.ConnectionManager
	stopChan  chan struct{}
	service   *services.GameService
}

func New(db *database.DB, wsManager *realtime.ConnectionManager) *Watchdog {
	return &Watchdog{
		db:        db,
		wsManager: wsManager,
		stopChan:  make(chan struct{}),
		service:   services.NewGameService(db),
	}
}

func (w *Watchdog) Start() {
	ticker := time.NewTicker(watchdogIntervalSeconds * time.Second)
	defer ticker.Stop()

	log.Println("[Watchdog] Started")

	for {
		select {
		case <-ticker.C:
			w.tick()
		case <-w.stopChan:
			log.Println("[Watchdog] Stopped")
			return
		}
	}
}

func (w *Watchdog) Stop() {
	close(w.stopChan)
}

func (w *Watchdog) tick() {
	// Используем контекст с таймаутом для всех операций watchdog
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 1. Проверка активных игр на таймаут
	w.checkTimeouts(ctx)

	// 2. Очистка заброшенных игр
	w.cleanupAbandonedGames(ctx)
}

func (w *Watchdog) checkTimeouts(ctx context.Context) {
	var games []models.Game
	if err := w.db.WithContext(ctx).
		Where("status = ?", models.GameStatusActive).
		Find(&games).Error; err != nil {
		log.Printf("[Watchdog] Failed to query active games: %v", err)
		return
	}

	for i := range games {
		w.checkGameTimeout(ctx, &games[i])
	}
}

func (w *Watchdog) checkGameTimeout(ctx context.Context, game *models.Game) {
	// Получаем последний ход
	lastMove, err := w.service.GetMoves(ctx, game.ID, 1)
	if err != nil {
		log.Printf("[Watchdog] Failed to get last move for game %s: %v", game.ID, err)
		return
	}

	var lastMovePtr *models.Move
	if len(lastMove) > 0 {
		lastMovePtr = &lastMove[0]
	}

	// Вычисляем эффективные часы
	whitePast, blackPast, err := w.service.ComputeEffectiveClocks(ctx, game, lastMovePtr)
	if err != nil {
		log.Printf("[Watchdog] Failed to compute effective clocks for game %s: %v", game.ID, err)
		return
	}

	// Получаем finish_time из TimeControl JSON
	whiteFinish := int64(0)
	blackFinish := int64(0)
	if len(game.TimeControl) > 0 {
		var tc models.TimeControl
		if err := json.Unmarshal(game.TimeControl, &tc); err != nil {
			log.Printf("[Watchdog] Failed to unmarshal TimeControl for game %s: %v", game.ID, err)
		} else {
			whiteFinish = tc.WhiteFinishMs
			blackFinish = tc.BlackFinishMs
			if whiteFinish == 0 {
				whiteFinish = tc.InitialMs
			}
			if blackFinish == 0 {
				blackFinish = tc.InitialMs
			}
		}
	}

	// Проверяем, достиг ли past_time finish_time
	var loser models.SideToMove
	if whiteFinish > 0 && whitePast >= whiteFinish && blackPast < blackFinish {
		loser = models.SideWhite
	} else if blackFinish > 0 && blackPast >= blackFinish && whitePast < whiteFinish {
		loser = models.SideBlack
	} else if whiteFinish > 0 && blackFinish > 0 && whitePast >= whiteFinish && blackPast >= blackFinish {
		// Оба игрока закончили время - проигрывает тот, чей ход
		if game.NextTurn == models.SideWhite {
			loser = models.SideWhite
		} else {
			loser = models.SideBlack
		}
	} else {
		return // Время не истекло
	}

	// Определяем, кто запрашивает таймаут
	var requestedBy int
	if loser == models.SideWhite {
		if game.BlackID == nil {
			return
		}
		requestedBy = *game.BlackID
	} else {
		if game.WhiteID == nil {
			return
		}
		requestedBy = *game.WhiteID
	}

	loserColor := "white"
	if loser == models.SideBlack {
		loserColor = "black"
	}

	// Завершаем игру по таймауту
	_, err = w.service.Timeout(ctx, game.ID, requestedBy, loserColor)
	if err != nil {
		log.Printf("[Watchdog] Failed to timeout game %s: %v", game.ID, err)
		return
	}

	log.Printf("[Watchdog] Game %s finished by timeout, loser: %s", game.ID, loserColor)

	// Broadcast через WebSocket
	gameDetail, err := w.service.GetGame(ctx, game.ID)
	if err != nil {
		log.Printf("[Watchdog] Failed to get game detail for broadcast: %v", err)
		return
	}

	w.wsManager.Broadcast(game.ID, map[string]interface{}{
		"type": "game_finished",
		"game": gameDetail,
	})
}

func (w *Watchdog) cleanupAbandonedGames(ctx context.Context) {
	cutoffTime := time.Now().UTC().Add(-abandonedGameTimeoutMinutes * time.Minute)

	// Игра считается заброшенной, если:
	// 1. Статус = CREATED
	// 2. Создана более N минут назад (abandonedGameTimeoutMinutes)
	// 3. Не заполнены оба игрока (проверяем и user_id и session_id в metadata)
	//
	// Игра считается заполненной, если:
	// - (white_id IS NOT NULL OR metadata->>'white_session_id' IS NOT NULL) AND
	// - (black_id IS NOT NULL OR metadata->>'black_session_id' IS NOT NULL)
	//
	// Значит, игра заброшена, если:
	// - NOT (имеется white И имеется black)
	// = (white_id IS NULL AND COALESCE(metadata->>'white_session_id', '') = '') OR
	//   (black_id IS NULL AND COALESCE(metadata->>'black_session_id', '') = '')

	whereClause := `status = ? AND created_at < ? AND (
		(white_id IS NULL AND COALESCE(metadata->>'white_session_id', '') = '') OR
		(black_id IS NULL AND COALESCE(metadata->>'black_session_id', '') = '')
	)`

	var abandonedGames []models.Game
	if err := w.db.WithContext(ctx).
		Where(whereClause,
			models.GameStatusCreated, cutoffTime).
		Find(&abandonedGames).Error; err != nil {
		log.Printf("[Watchdog] Failed to query abandoned games: %v", err)
		return
	}

	if len(abandonedGames) == 0 {
		return
	}

	// Удаляем заброшенные игры
	result := w.db.WithContext(ctx).
		Where(whereClause,
			models.GameStatusCreated, cutoffTime).
		Delete(&models.Game{})

	if result.Error != nil {
		log.Printf("[Watchdog] Failed to delete abandoned games: %v", result.Error)
		return
	}

	deletedCount := int(result.RowsAffected)
	log.Printf("[Watchdog] Deleted %d abandoned game(s)", deletedCount)

	// Broadcast отмены для каждой игры
	for _, game := range abandonedGames {
		w.wsManager.Broadcast(game.ID, map[string]interface{}{
			"type":    "game_cancelled",
			"game_id": game.ID.String(),
		})
	}
}
