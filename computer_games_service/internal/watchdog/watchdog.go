package watchdog

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/yourorg/computer_games_service/internal/database"
	"github.com/yourorg/computer_games_service/internal/models"
	"github.com/yourorg/computer_games_service/internal/realtime"
	"github.com/yourorg/computer_games_service/internal/services"
)

const (
	watchdogIntervalMinutes     = 10
	abandonedAIGameTimeoutHours = 24
)

// Watchdog завершает заброшенные партии с компьютером (нет активности > N часов)
type Watchdog struct {
	db        *database.DB
	wsManager *realtime.Manager
	service   *services.ComputerGameService
	stopChan  chan struct{}
}

// New создаёт watchdog
func New(db *database.DB, wsManager *realtime.Manager, service *services.ComputerGameService) *Watchdog {
	return &Watchdog{
		db:        db,
		wsManager: wsManager,
		service:   service,
		stopChan:  make(chan struct{}),
	}
}

// Start запускает фоновую проверку
func (w *Watchdog) Start() {
	ticker := time.NewTicker(watchdogIntervalMinutes * time.Minute)
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

// Stop останавливает watchdog
func (w *Watchdog) Stop() {
	close(w.stopChan)
}

func (w *Watchdog) tick() {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	w.cleanupAbandonedAIGames(ctx)
}

// cleanupAbandonedAIGames завершает компьютерные игры без активности
// Игра считается заброшенной, если последняя активность (ход) была > abandonedAIGameTimeoutHours назад
// Победитель — компьютер (игрок считается сдавшимся)
func (w *Watchdog) cleanupAbandonedAIGames(ctx context.Context) {
	cutoff := time.Now().UTC().Add(-abandonedAIGameTimeoutHours * time.Hour)

	// Находим ACTIVE игры с game_type=computer, у которых последний ход старше cutoff
	// Подзапрос: берём игры, у которых (MAX(moves.created_at) < cutoff OR (move_count=0 AND started_at < cutoff))
	var games []models.Game
	err := w.db.WithContext(ctx).
		Where(`status = ? AND metadata->>'game_type' = ?`,
			models.GameStatusActive, "computer").
		Find(&games).Error
	if err != nil {
		log.Printf("[Watchdog] Failed to query AI games: %v", err)
		return
	}

	for i := range games {
		lastActivity, err := w.getLastActivity(ctx, &games[i])
		if err != nil {
			log.Printf("[Watchdog] Failed to get last activity for game %s: %v", games[i].ID, err)
			continue
		}
		if lastActivity.Before(cutoff) {
			w.finishAbandonedGame(ctx, &games[i])
		}
	}
}

func (w *Watchdog) getLastActivity(ctx context.Context, game *models.Game) (time.Time, error) {
	// Если есть ходы — берём время последнего хода
	var lastMove models.Move
	err := w.db.WithContext(ctx).
		Where("game_id = ?", game.ID).
		Order("created_at DESC").
		Limit(1).
		First(&lastMove).Error
	if err == nil {
		return lastMove.CreatedAt, nil
	}

	// Нет ходов — берём started_at или created_at
	if game.StartedAt != nil {
		return *game.StartedAt, nil
	}
	return game.CreatedAt, nil
}

func (w *Watchdog) finishAbandonedGame(ctx context.Context, game *models.Game) {
	// Определяем цвет игрока (человека) — он проиграл по неактивности
	var metadata map[string]interface{}
	if err := json.Unmarshal(game.Metadata, &metadata); err != nil {
		log.Printf("[Watchdog] Failed to parse metadata for game %s: %v", game.ID, err)
		return
	}

	aiColor, _ := metadata["ai_color"].(string)
	var playerSide models.SideToMove
	if aiColor == "white" {
		playerSide = models.SideBlack // игрок чёрные
	} else {
		playerSide = models.SideWhite // игрок белые
	}

	// Игрок проиграл (покинул) — побеждает AI
	var winner models.SideToMove
	if playerSide == models.SideWhite {
		winner = models.SideBlack
	} else {
		winner = models.SideWhite
	}

	reason := models.TerminationAbandoned
	now := time.Now().UTC()

	var result models.GameResult
	if winner == models.SideWhite {
		result = models.ResultWhiteWin
	} else {
		result = models.ResultBlackWin
	}

	updates := map[string]interface{}{
		"status":             models.GameStatusFinished,
		"result":             string(result),
		"termination_reason": string(reason),
		"finished_at":        now,
	}

	if err := w.db.WithContext(ctx).Model(&models.Game{}).
		Where("id = ? AND status = ?", game.ID, models.GameStatusActive).
		Updates(updates).Error; err != nil {
		log.Printf("[Watchdog] Failed to finish abandoned game %s: %v", game.ID, err)
		return
	}

	log.Printf("[Watchdog] Finished abandoned AI game %s (no activity for %d hours)", game.ID, abandonedAIGameTimeoutHours)

	// Broadcast
	updatedGame, err := w.service.GetGame(ctx, game.ID)
	if err != nil {
		log.Printf("[Watchdog] Failed to get game detail for %s: %v", game.ID, err)
		return
	}

	w.wsManager.Broadcast(game.ID.String(), map[string]interface{}{
		"type": "game_update",
		"game": updatedGame,
	})
}
