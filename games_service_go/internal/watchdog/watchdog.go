package watchdog

import (
	"context"
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
	// Время ожидания первого хода для активных игр (в минутах)
	activeGameNoMoveTimeoutMinutes = 5
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

	for {
		select {
		case <-ticker.C:
			w.tick()
		case <-w.stopChan:
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

	// 2. Очистка заброшенных игр (CREATED без игроков)
	w.cleanupAbandonedGames(ctx)

	// 3. Очистка активных игр без ходов
	w.cleanupActiveGamesWithoutMoves(ctx)
}

func (w *Watchdog) checkTimeouts(ctx context.Context) {
	// turn_deadline_at is updated in the same transaction as a move, so the
	// watchdog can use an indexed query instead of scanning every active game.
	var games []models.Game
	now := time.Now().UTC()
	if err := w.db.WithContext(ctx).
		Where("status = ? AND turn_deadline_at IS NOT NULL AND turn_deadline_at <= ?", models.GameStatusActive, now).
		Order("turn_deadline_at ASC").
		Limit(100).
		Find(&games).Error; err != nil {
		log.Printf("[Watchdog] failed to query expired games: %v", err)
		return
	}

	for i := range games {
		loserColor := "white"
		if games[i].NextTurn == models.SideBlack {
			loserColor = "black"
		}
		if err := w.service.TimeoutAuto(ctx, games[i].ID, loserColor); err != nil {
			// Another request or replica can legitimately finish the game first.
			log.Printf("[Watchdog] failed to timeout game %s: %v", games[i].ID, err)
			continue
		}

		gameDetail, err := w.service.GetGame(ctx, games[i].ID)
		if err != nil {
			log.Printf("[Watchdog] failed to get game detail for %s: %v", games[i].ID, err)
			continue
		}
		_ = w.wsManager.Broadcast(games[i].ID, map[string]interface{}{
			"type":     "game_finished",
			"revision": gameDetail.MoveCount,
			"game":     gameDetail.Game,
		})
	}
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
	if err := w.db.WithContext(ctx).Raw(
		"DELETE FROM games WHERE "+whereClause+" RETURNING id",
		models.GameStatusCreated, cutoffTime,
	).Scan(&abandonedGames).Error; err != nil {
		log.Printf("[Watchdog] failed to delete abandoned games: %v", err)
		return
	}

	// Broadcast отмены для каждой игры
	for _, game := range abandonedGames {
		w.wsManager.Broadcast(game.ID, map[string]interface{}{
			"type":    "game_cancelled",
			"game_id": game.ID.String(),
		})
	}
}

// cleanupActiveGamesWithoutMoves удаляет активные игры, где оба игрока присоединились,
// но никто не сделал первый ход в течение заданного времени
func (w *Watchdog) cleanupActiveGamesWithoutMoves(ctx context.Context) {
	cutoffTime := time.Now().UTC().Add(-activeGameNoMoveTimeoutMinutes * time.Minute)

	// Игра должна быть удалена, если:
	// 1. Статус = ACTIVE
	// 2. move_count = 0 (нет ходов)
	// 3. started_at < cutoffTime (прошло достаточно времени с момента старта)
	// 4. Оба игрока присоединились (проверяем через white_id/black_id или session_id)

	whereClause := `status = ? AND move_count = 0 AND started_at IS NOT NULL AND started_at < ? AND (
		(white_id IS NOT NULL OR COALESCE(metadata->>'white_session_id', '') != '') AND
		(black_id IS NOT NULL OR COALESCE(metadata->>'black_session_id', '') != '')
	)`

	var gamesToDelete []models.Game
	if err := w.db.WithContext(ctx).Raw(
		"DELETE FROM games WHERE "+whereClause+" RETURNING id",
		models.GameStatusActive, cutoffTime,
	).Scan(&gamesToDelete).Error; err != nil {
		log.Printf("[Watchdog] failed to delete active games without moves: %v", err)
		return
	}

	if len(gamesToDelete) > 0 {
		log.Printf("[Watchdog] deleted %d active games without moves", len(gamesToDelete))
	}

	// Broadcast отмены для каждой удаленной игры
	for _, game := range gamesToDelete {
		w.wsManager.Broadcast(game.ID, map[string]interface{}{
			"type":    "game_cancelled",
			"game_id": game.ID.String(),
			"reason":  "no_moves_timeout",
		})
	}
}
