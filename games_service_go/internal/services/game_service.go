package services

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/notnil/chess"
	"github.com/VoolFI71/go-arena"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/yourorg/games_service_go/internal/database"
	"github.com/yourorg/games_service_go/internal/models"
)

type GameService struct {
	db        *database.DB
	arenaPool *arena.ArenaPool
}

func NewGameService(db *database.DB) *GameService {
	return &GameService{
		db: db,
		// Инициализируем пул арены: чанк 16КБ, без лимита на удержание (0)
		arenaPool: arena.NewArenaPool(16*1024, 0),
	}
}

type CreateGameRequest struct {
	InitialFen   string                 `json:"initial_fen"`
	CreatorColor string                 `json:"creator_color"`
	Metadata     map[string]interface{} `json:"metadata"`
	TimeControl  *models.TimeControl    `json:"time_control"`
}

func (s *GameService) CreateGame(ctx context.Context, creatorID *int, creatorSessionID *string, req *CreateGameRequest) (*models.GameDetail, error) {
	gameID := uuid.New()

	var whiteID, blackID *int
	var whiteSessionID, blackSessionID *string
	if req.CreatorColor == "white" {
		whiteID = creatorID
		whiteSessionID = creatorSessionID
	} else {
		blackID = creatorID
		blackSessionID = creatorSessionID
	}

	initialPos := "startpos"
	if req.InitialFen != "" {
		initialPos = req.InitialFen
	}

	currentPos := "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

	var timeControlJSON []byte
	if req.TimeControl != nil {
		tc := &models.TimeControl{
			InitialMs:     req.TimeControl.InitialMs,
			IncrementMs:   req.TimeControl.IncrementMs,
			Type:          req.TimeControl.Type,
			WhiteFinishMs: req.TimeControl.InitialMs,
			BlackFinishMs: req.TimeControl.InitialMs,
		}
		var err error
		timeControlJSON, err = json.Marshal(tc)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal time control: %w", err)
		}
	}

	// Подготавливаем metadata
	metadata := make(map[string]interface{})
	if req.Metadata != nil {
		for k, v := range req.Metadata {
			metadata[k] = v
		}
	}
	// Добавляем session_id в metadata, если он есть
	if whiteSessionID != nil {
		metadata["white_session_id"] = *whiteSessionID
	}
	if blackSessionID != nil {
		metadata["black_session_id"] = *blackSessionID
	}

	var metadataJSON []byte
	if len(metadata) > 0 {
		var err error
		metadataJSON, err = json.Marshal(metadata)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal metadata: %w", err)
		}
	}

	game := models.Game{
		ID:           gameID,
		WhiteID:      whiteID,
		BlackID:      blackID,
		InitialPos:   initialPos,
		CurrentPos:   currentPos,
		NextTurn:     models.SideWhite,
		TimeControl:  timeControlJSON,
		MoveCount:    0,
		Status:       models.GameStatusCreated,
		WhiteClockMs: 0,
		BlackClockMs: 0,
		Metadata:     metadataJSON,
	}

	if err := s.db.WithContext(ctx).Create(&game).Error; err != nil {
		return nil, fmt.Errorf("failed to create game: %w", err)
	}

	detail := &models.GameDetail{
		Game:  game,
		Moves: []models.Move{},
	}

	if req.TimeControl != nil {
		whiteFinish := req.TimeControl.InitialMs
		blackFinish := req.TimeControl.InitialMs
		detail.WhiteFinishMs = &whiteFinish
		detail.BlackFinishMs = &blackFinish
	}

	return detail, nil
}

func (s *GameService) GetGame(ctx context.Context, gameID uuid.UUID) (*models.GameDetail, error) {
	var game models.Game
	if err := s.db.WithContext(ctx).First(&game, "id = ?", gameID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("game not found")
		}
		return nil, fmt.Errorf("failed to get game: %w", err)
	}

	// Загружаем ходы
	moves, err := s.GetMoves(ctx, gameID, 200)
	if err != nil {
		moves = []models.Move{}
	}

	detail := &models.GameDetail{
		Game:  game,
		Moves: moves,
	}

	// Парсим TimeControl из JSON
	if len(game.TimeControl) > 0 {
		var tc models.TimeControl
		if err := json.Unmarshal(game.TimeControl, &tc); err != nil {
			// Failed to unmarshal TimeControl
		} else {
			detail.WhiteFinishMs = &tc.WhiteFinishMs
			detail.BlackFinishMs = &tc.BlackFinishMs
		}
	}

	return detail, nil
}

func (s *GameService) GetMoves(ctx context.Context, gameID uuid.UUID, limit int) ([]models.Move, error) {
	var moves []models.Move
	if err := s.db.WithContext(ctx).
		Where("game_id = ?", gameID).
		Order("move_index ASC").
		Limit(limit).
		Find(&moves).Error; err != nil {
		return nil, fmt.Errorf("failed to query moves: %w", err)
	}

	return moves, nil
}

// Вспомогательные функции для работы со временем

func (s *GameService) getLastMove(ctx context.Context, gameID uuid.UUID) (*models.Move, error) {
	var move models.Move
	if err := s.db.WithContext(ctx).
		Where("game_id = ?", gameID).
		Order("move_index DESC").
		First(&move).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}

	return &move, nil
}

func (s *GameService) getLastActivityTimestamp(game *models.Game, lastMove *models.Move) *time.Time {
	if lastMove != nil {
		return &lastMove.CreatedAt
	}
	if game.StartedAt != nil {
		return game.StartedAt
	}
	return &game.CreatedAt
}

func (s *GameService) computeElapsedMs(ctx context.Context, game *models.Game, lastMove *models.Move) int64 {
	if game.MoveCount > 0 {
		lastActivity := s.getLastActivityTimestamp(game, lastMove)
		if lastActivity != nil {
			elapsed := time.Since(*lastActivity).Milliseconds()
			if elapsed < 0 {
				return 0
			}
			return elapsed
		}
	}

	// Для первого хода считаем время от started_at
	if game.StartedAt != nil {
		elapsed := time.Since(*game.StartedAt).Milliseconds()
		if elapsed < 0 {
			return 0
		}
		return elapsed
	}

	return 0
}

func (s *GameService) computeClocksForMove(game *models.Game, currentTurn models.SideToMove, elapsedMs, incrementMs int64) (int64, int64, int64, int64) {
	whitePast := game.WhiteClockMs
	blackPast := game.BlackClockMs

	whiteFinish := int64(0)
	blackFinish := int64(0)
	// Парсим TimeControl из JSON
	if len(game.TimeControl) > 0 {
		var tc models.TimeControl
		if err := json.Unmarshal(game.TimeControl, &tc); err == nil {
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

	if currentTurn == models.SideWhite {
		whitePast += elapsedMs
		whiteFinish += incrementMs
	} else {
		blackPast += elapsedMs
		blackFinish += incrementMs
	}

	return whitePast, blackPast, whiteFinish, blackFinish
}

// ComputeEffectiveClocks вычисляет эффективные часы с учетом прошедшего времени
func (s *GameService) ComputeEffectiveClocks(ctx context.Context, game *models.Game, lastMove *models.Move) (int64, int64, error) {
	whitePast := game.WhiteClockMs
	blackPast := game.BlackClockMs

	if game.Status == models.GameStatusFinished {
		return whitePast, blackPast, nil
	}

	// Время начинает тикать только после первого хода
	if game.MoveCount == 0 {
		return whitePast, blackPast, nil
	}

	lastActivity := s.getLastActivityTimestamp(game, lastMove)
	if lastActivity == nil {
		return whitePast, blackPast, nil
	}

	elapsedMs := time.Since(*lastActivity).Milliseconds()
	if elapsedMs <= 0 {
		return whitePast, blackPast, nil
	}

	// Добавляем прошедшее время к past_time текущего игрока
	if game.NextTurn == models.SideWhite {
		whitePast += elapsedMs
	} else {
		blackPast += elapsedMs
	}

	return whitePast, blackPast, nil
}

// lockGame блокирует игру для транзакции
func (s *GameService) lockGame(ctx context.Context, tx *gorm.DB, gameID uuid.UUID) (*models.Game, error) {
	var game models.Game
	if err := tx.WithContext(ctx).Clauses(clause.Locking{Strength: "UPDATE"}).First(&game, "id = ?", gameID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("game not found")
		}
		return nil, fmt.Errorf("failed to lock game: %w", err)
	}

	return &game, nil
}

func (s *GameService) JoinGame(ctx context.Context, gameID uuid.UUID, playerID *int, playerSessionID *string) (*models.GameDetail, error) {
	var game models.Game

	// Проверяем, что передан хотя бы один идентификатор
	if playerID == nil && playerSessionID == nil {
		return nil, fmt.Errorf("either player_id or player_session_id must be provided")
	}

	// Сначала проверяем, не участвует ли уже игрок (без транзакции)
	if err := s.db.WithContext(ctx).First(&game, "id = ?", gameID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("game not found")
		}
		return nil, err
	}

	// Парсим metadata для проверки session_id
	var metadata map[string]interface{}
	if len(game.Metadata) > 0 {
		if err := json.Unmarshal(game.Metadata, &metadata); err != nil {
			// Failed to unmarshal metadata
			metadata = make(map[string]interface{})
		}
	} else {
		metadata = make(map[string]interface{})
	}

	// Проверяем, не участвует ли уже игрок
	if playerID != nil {
		if (game.WhiteID != nil && *game.WhiteID == *playerID) ||
			(game.BlackID != nil && *game.BlackID == *playerID) {
			return s.buildGameDetail(ctx, &game)
		}
	}
	if playerSessionID != nil {
		whiteSessionID, _ := metadata["white_session_id"].(string)
		blackSessionID, _ := metadata["black_session_id"].(string)
		if *playerSessionID == whiteSessionID || *playerSessionID == blackSessionID {
			return s.buildGameDetail(ctx, &game)
		}
	}

	// Игрок еще не в игре, нужно добавить его
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Блокируем игру для обновления
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&game, "id = ?", gameID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return fmt.Errorf("game not found")
			}
			return err
		}

		// Перепарсиваем metadata после блокировки
		if len(game.Metadata) > 0 {
			if err := json.Unmarshal(game.Metadata, &metadata); err != nil {
				metadata = make(map[string]interface{})
			}
		}

		// Двойная проверка (race condition protection)
		if playerID != nil {
			if (game.WhiteID != nil && *game.WhiteID == *playerID) ||
				(game.BlackID != nil && *game.BlackID == *playerID) {
				return nil // Игрок уже добавлен
			}
		}
		if playerSessionID != nil {
			whiteSessionID, _ := metadata["white_session_id"].(string)
			blackSessionID, _ := metadata["black_session_id"].(string)
			if *playerSessionID == whiteSessionID || *playerSessionID == blackSessionID {
				return nil // Игрок уже добавлен
			}
		}

		// Проверяем, что игра открыта для присоединения
		if game.Status != models.GameStatusCreated {
			return fmt.Errorf("game is not open for joining")
		}

		// Проверяем, не заполнена ли игра (учитываем и user_id и session_id)
		hasWhite := game.WhiteID != nil || metadata["white_session_id"] != nil
		hasBlack := game.BlackID != nil || metadata["black_session_id"] != nil
		if hasWhite && hasBlack {
			return fmt.Errorf("game is full")
		}

		// Присваиваем игрока на свободную сторону
		if !hasWhite {
			if playerID != nil {
				game.WhiteID = playerID
			}
			if playerSessionID != nil {
				metadata["white_session_id"] = *playerSessionID
			}
		} else if !hasBlack {
			if playerID != nil {
				game.BlackID = playerID
			}
			if playerSessionID != nil {
				metadata["black_session_id"] = *playerSessionID
			}
		}

		// Сохраняем обновленный metadata
		if len(metadata) > 0 {
			metadataJSON, err := json.Marshal(metadata)
			if err != nil {
				return fmt.Errorf("failed to marshal metadata: %w", err)
			}
			game.Metadata = metadataJSON
		}

		// Проверяем, присоединились ли оба игрока (учитываем и user_id и session_id)
		hasWhite = game.WhiteID != nil || metadata["white_session_id"] != nil
		hasBlack = game.BlackID != nil || metadata["black_session_id"] != nil
		if hasWhite && hasBlack {
			game.Status = models.GameStatusActive
			now := time.Now().UTC()
			game.StartedAt = &now
		}

		return tx.Save(&game).Error
	})

	if err != nil {
		return nil, err
	}

	return s.buildGameDetail(ctx, &game)
}

// buildGameDetail создает GameDetail из Game
func (s *GameService) buildGameDetail(ctx context.Context, game *models.Game) (*models.GameDetail, error) {
	// Загружаем ходы
	moves, err := s.GetMoves(ctx, game.ID, 200)
	if err != nil {
		moves = []models.Move{}
	}

	detail := &models.GameDetail{
		Game:  *game,
		Moves: moves,
	}

	// Парсим TimeControl
	if len(game.TimeControl) > 0 {
		var tc models.TimeControl
		if err := json.Unmarshal(game.TimeControl, &tc); err != nil {
			// Failed to unmarshal TimeControl
		} else {
			detail.WhiteFinishMs = &tc.WhiteFinishMs
			detail.BlackFinishMs = &tc.BlackFinishMs
		}
	}

	return detail, nil
}

func (s *GameService) Resign(ctx context.Context, gameID uuid.UUID, playerID *int, playerSessionID *string) (*models.GameDetail, error) {
	// Проверяем, что передан хотя бы один идентификатор
	if playerID == nil && playerSessionID == nil {
		return nil, fmt.Errorf("either player_id or player_session_id must be provided")
	}

	var game models.Game
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Блокируем игру
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&game, "id = ?", gameID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return fmt.Errorf("game not found")
			}
			return err
		}

		if game.Status == models.GameStatusFinished {
			return fmt.Errorf("game already finished")
		}

		// Парсим metadata для проверки анонимных игроков
		var metadata map[string]interface{}
		if len(game.Metadata) > 0 {
			if err := json.Unmarshal(game.Metadata, &metadata); err != nil {
				metadata = make(map[string]interface{})
			}
		} else {
			metadata = make(map[string]interface{})
		}

		// Проверяем, что игрок участвует в партии
		var isPlayerInGame bool
		var playerSide models.SideToMove

		if playerID != nil {
			// Проверка для авторизованного игрока
			if game.WhiteID != nil && *game.WhiteID == *playerID {
				isPlayerInGame = true
				playerSide = models.SideWhite
			} else if game.BlackID != nil && *game.BlackID == *playerID {
				isPlayerInGame = true
				playerSide = models.SideBlack
			}
		}

		if !isPlayerInGame && playerSessionID != nil {
			// Проверка для анонимного игрока через session_id
			whiteSessionID, _ := metadata["white_session_id"].(string)
			blackSessionID, _ := metadata["black_session_id"].(string)

			if *playerSessionID == whiteSessionID {
				isPlayerInGame = true
				playerSide = models.SideWhite
			} else if *playerSessionID == blackSessionID {
				isPlayerInGame = true
				playerSide = models.SideBlack
			}
		}

		if !isPlayerInGame {
			return fmt.Errorf("player not in game")
		}

		// Определяем победителя (противоположный игрок)
		var winner models.SideToMove
		if playerSide == models.SideWhite {
			winner = models.SideBlack
		} else {
			winner = models.SideWhite
		}

		reason := string(models.TerminationResignation)
		var endedBy *int
		if playerID != nil {
			endedBy = playerID
		}
		return s.finishGame(ctx, tx, &game, &winner, reason, endedBy)
	})

	if err != nil {
		return nil, err
	}

	// Перезагружаем игру
	return s.GetGame(ctx, gameID)
}

func (s *GameService) Timeout(ctx context.Context, gameID uuid.UUID, playerID int, loserColor string) (*models.GameDetail, error) {
	var game models.Game
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Блокируем игру
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&game, "id = ?", gameID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return fmt.Errorf("game not found")
			}
			return err
		}

		if game.Status == models.GameStatusFinished {
			return fmt.Errorf("game already finished")
		}

		if (game.WhiteID == nil || *game.WhiteID != playerID) &&
			(game.BlackID == nil || *game.BlackID != playerID) {
			return fmt.Errorf("player not in game")
		}

		// Вычисляем эффективные часы
		lastMove, err := s.getLastMove(ctx, gameID)
		if err != nil {
			return fmt.Errorf("failed to get last move: %w", err)
		}

		effectiveWhitePast, effectiveBlackPast, err := s.ComputeEffectiveClocks(ctx, &game, lastMove)
		if err != nil {
			return err
		}

		// Получаем finish_time из TimeControl JSON
		whiteFinish := int64(0)
		blackFinish := int64(0)
		if len(game.TimeControl) > 0 {
			var tc models.TimeControl
			if err := json.Unmarshal(game.TimeControl, &tc); err == nil {
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

		// Определяем проигравшего
		var loser models.SideToMove
		if loserColor == "white" {
			loser = models.SideWhite
			if whiteFinish == 0 || effectiveWhitePast < whiteFinish {
				return fmt.Errorf("white clock has not expired")
			}
		} else {
			loser = models.SideBlack
			if blackFinish == 0 || effectiveBlackPast < blackFinish {
				return fmt.Errorf("black clock has not expired")
			}
		}

		// Обновляем past_time до эффективных значений
		game.WhiteClockMs = effectiveWhitePast
		game.BlackClockMs = effectiveBlackPast

		// Устанавливаем past_time проигравшего равным finish_time
		if loser == models.SideWhite {
			game.WhiteClockMs = whiteFinish
		} else {
			game.BlackClockMs = blackFinish
		}

		// Определяем победителя
		winner := models.SideBlack
		if loser == models.SideWhite {
			winner = models.SideBlack
		} else {
			winner = models.SideWhite
		}

		reason := string(models.TerminationTimeout)
		return s.finishGame(ctx, tx, &game, &winner, reason, &playerID)
	})

	if err != nil {
		return nil, err
	}

	// Перезагружаем игру
	return s.GetGame(ctx, gameID)
}

// TimeoutAuto автоматически завершает игру по таймауту (используется watchdog)
// Не требует playerID и не проверяет участие игрока
func (s *GameService) TimeoutAuto(ctx context.Context, gameID uuid.UUID, loserColor string) error {
	var game models.Game
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Блокируем игру
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&game, "id = ?", gameID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return fmt.Errorf("game not found")
			}
			return err
		}

		if game.Status == models.GameStatusFinished {
			return fmt.Errorf("game already finished")
		}

		// Вычисляем эффективные часы
		lastMove, err := s.getLastMove(ctx, gameID)
		if err != nil {
			return fmt.Errorf("failed to get last move: %w", err)
		}

		effectiveWhitePast, effectiveBlackPast, err := s.ComputeEffectiveClocks(ctx, &game, lastMove)
		if err != nil {
			return err
		}

		// Получаем finish_time из TimeControl JSON
		whiteFinish := int64(0)
		blackFinish := int64(0)
		if len(game.TimeControl) > 0 {
			var tc models.TimeControl
			if err := json.Unmarshal(game.TimeControl, &tc); err == nil {
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

		// Определяем проигравшего
		var loser models.SideToMove
		if loserColor == "white" {
			loser = models.SideWhite
			if whiteFinish == 0 || effectiveWhitePast < whiteFinish {
				return fmt.Errorf("white clock has not expired")
			}
		} else {
			loser = models.SideBlack
			if blackFinish == 0 || effectiveBlackPast < blackFinish {
				return fmt.Errorf("black clock has not expired")
			}
		}

		// Обновляем past_time до эффективных значений
		game.WhiteClockMs = effectiveWhitePast
		game.BlackClockMs = effectiveBlackPast

		// Устанавливаем past_time проигравшего равным finish_time
		if loser == models.SideWhite {
			game.WhiteClockMs = whiteFinish
		} else {
			game.BlackClockMs = blackFinish
		}

		// Определяем победителя
		winner := models.SideBlack
		if loser == models.SideWhite {
			winner = models.SideBlack
		} else {
			winner = models.SideWhite
		}

		reason := string(models.TerminationTimeout)
		// endedBy = nil для автоматического завершения
		return s.finishGame(ctx, tx, &game, &winner, reason, nil)
	})

	return err
}

func (s *GameService) ListGames(ctx context.Context, limit, offset int, status *models.GameStatus) ([]models.Game, error) {
	query := s.db.WithContext(ctx)

	// Фильтрация по статусу, если указан
	if status != nil {
		query = query.Where("status = ?", *status)
	}

	var games []models.Game
	if err := query.
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&games).Error; err != nil {
		return nil, fmt.Errorf("failed to query games: %w", err)
	}

	return games, nil
}

type MakeMovePayload struct {
	Type         string  `json:"type"`
	UCI          string  `json:"uci" binding:"required"`
	Promotion    *string `json:"promotion"`
	ClientMoveID *string `json:"client_move_id"`
}

// finishGame завершает игру и обновляет рейтинги
func (s *GameService) finishGame(ctx context.Context, tx *gorm.DB, game *models.Game, winner *models.SideToMove, reason string, endedBy *int) error {
	now := time.Now().UTC()
	game.Status = models.GameStatusFinished
	game.FinishedAt = &now
	terminationReason := models.TerminationReason(reason)
	game.TerminationReason = &terminationReason
	game.EndedBy = endedBy

	var result models.GameResult
	if winner == nil {
		result = models.ResultDraw
	} else if *winner == models.SideWhite {
		result = models.ResultWhiteWin
	} else {
		result = models.ResultBlackWin
	}
	game.Result = &result

	// Обновляем игру в БД
	if err := tx.WithContext(ctx).Save(game).Error; err != nil {
		return fmt.Errorf("failed to update game: %w", err)
	}

	// Обновляем счетчик сыгранных партий
	if game.WhiteID != nil {
		if err := tx.WithContext(ctx).Exec("UPDATE users SET games_played = games_played + 1 WHERE id = ?", *game.WhiteID).Error; err != nil {
			// Warning: failed to update games_played
		}
	}
	if game.BlackID != nil {
		if err := tx.WithContext(ctx).Exec("UPDATE users SET games_played = games_played + 1 WHERE id = ?", *game.BlackID).Error; err != nil {
			// Warning: failed to update games_played
		}
	}

	// Обновляем рейтинги если игра завершена с двумя игроками
	if game.WhiteID != nil && game.BlackID != nil {
		if err := s.updateRatings(ctx, tx, game); err != nil {
			// Warning: failed to update ratings
			// Не прерываем транзакцию из-за ошибки обновления рейтингов
		}
	}

	return nil
}

// updateRatings обновляет рейтинги игроков после завершения игры
func (s *GameService) updateRatings(ctx context.Context, tx *gorm.DB, game *models.Game) error {
	// Парсим TimeControl из JSON
	var tc *models.TimeControl
	if len(game.TimeControl) > 0 {
		var parsedTC models.TimeControl
		if err := json.Unmarshal(game.TimeControl, &parsedTC); err == nil {
			tc = &parsedTC
		}
	}

	formatType := s.getGameFormat(tc)

	// Whitelist для валидации formatType и получения имени колонки (защита от SQL injection)
	ratingColumns := map[string]string{
		"bullet":    "bullet_rating",
		"blitz":     "blitz_rating",
		"rapid":     "rapid_rating",
		"classical": "classical_rating",
	}

	ratingColumn, ok := ratingColumns[formatType]
	if !ok {
		// Если formatType невалидный, используем rapid по умолчанию
		// Warning: invalid formatType, using 'rapid' as default
		ratingColumn = "rapid_rating"
	}

	// Получаем текущие рейтинги (используем валидированное имя колонки)
	var whiteRating, blackRating int
	whiteQuery := fmt.Sprintf("SELECT %s FROM users WHERE id = ?", ratingColumn)
	blackQuery := fmt.Sprintf("SELECT %s FROM users WHERE id = ?", ratingColumn)

	if err := tx.WithContext(ctx).Raw(whiteQuery, *game.WhiteID).Scan(&whiteRating).Error; err != nil {
		return fmt.Errorf("failed to get white rating: %w", err)
	}
	if whiteRating == 0 {
		whiteRating = 1200
	}

	if err := tx.WithContext(ctx).Raw(blackQuery, *game.BlackID).Scan(&blackRating).Error; err != nil {
		return fmt.Errorf("failed to get black rating: %w", err)
	}
	if blackRating == 0 {
		blackRating = 1200
	}

	// Определяем результат
	var whiteScore, blackScore float64
	var whiteResult, blackResult string
	if game.Result != nil && *game.Result == models.ResultDraw {
		whiteScore = 0.5
		blackScore = 0.5
		whiteResult = "draw"
		blackResult = "draw"
	} else if game.Result != nil && *game.Result == models.ResultWhiteWin {
		whiteScore = 1.0
		blackScore = 0.0
		whiteResult = "win"
		blackResult = "loss"
	} else {
		whiteScore = 0.0
		blackScore = 1.0
		whiteResult = "loss"
		blackResult = "win"
	}

	// Рассчитываем новые рейтинги (Elo)
	whiteRatingAfter := calculateEloRating(whiteRating, blackRating, whiteScore)
	blackRatingAfter := calculateEloRating(blackRating, whiteRating, blackScore)

	// Рассчитываем изменение рейтинга
	whiteRatingChange := whiteRatingAfter - whiteRating
	blackRatingChange := blackRatingAfter - blackRating

	// Обновляем рейтинги (используем уже валидированное имя колонки из whitelist)
	// ratingColumn уже получен выше через whitelist map, поэтому безопасно использовать
	if err := tx.WithContext(ctx).Exec(fmt.Sprintf("UPDATE users SET %s = ? WHERE id = ?", ratingColumn), whiteRatingAfter, *game.WhiteID).Error; err != nil {
		return fmt.Errorf("failed to update white rating: %w", err)
	}

	if err := tx.WithContext(ctx).Exec(fmt.Sprintf("UPDATE users SET %s = ? WHERE id = ?", ratingColumn), blackRatingAfter, *game.BlackID).Error; err != nil {
		return fmt.Errorf("failed to update black rating: %w", err)
	}

	// Сохраняем изменение рейтинга в metadata игры (только для рейтинговых игр)
	var metadata map[string]interface{}
	if len(game.Metadata) > 0 {
		if err := json.Unmarshal(game.Metadata, &metadata); err != nil {
			// Warning: failed to unmarshal metadata
			metadata = make(map[string]interface{})
		}
	} else {
		metadata = make(map[string]interface{})
	}

	// Проверяем, является ли игра рейтинговой (метод вызывается только для рейтинговых игр, но для безопасности проверяем)
	isRated := false
	if rated, ok := metadata["rated"].(bool); ok {
		isRated = rated
	}

	// Добавляем изменение рейтинга в metadata только для рейтинговых игр
	if isRated {
		metadata["white_rating_change"] = whiteRatingChange
		metadata["black_rating_change"] = blackRatingChange

		metadataJSON, err := json.Marshal(metadata)
		if err != nil {
			// Warning: failed to marshal metadata
		} else {
			game.Metadata = metadataJSON
			if err := tx.WithContext(ctx).Model(game).Update("metadata", metadataJSON).Error; err != nil {
				// Warning: failed to update game metadata
			}
		}
	}

	// Сохраняем историю рейтингов (если таблица существует)
	if err := s.saveRatingHistory(ctx, tx, game, formatType,
		*game.WhiteID, whiteRating, whiteRatingAfter, whiteResult, *game.BlackID,
		*game.BlackID, blackRating, blackRatingAfter, blackResult, *game.WhiteID,
	); err != nil {
		// Warning: failed to save rating history
	}

	return nil
}

func (s *GameService) getGameFormat(timeControl *models.TimeControl) string {
	if timeControl == nil {
		return "rapid"
	}

	totalMinutes := float64(timeControl.InitialMs) / 60000.0
	if totalMinutes <= 3 {
		return "bullet"
	} else if totalMinutes <= 10 {
		return "blitz"
	} else {
		return "rapid"
	}
}

func calculateEloRating(playerRating, opponentRating int, score float64) int {
	kFactor := 32.0
	expectedScore := 1.0 / (1.0 + pow10(float64(opponentRating-playerRating)/400.0))
	newRating := float64(playerRating) + kFactor*(score-expectedScore)
	result := int(newRating)
	if result < 400 {
		return 400
	}
	return result
}

func pow10(x float64) float64 {
	result := 1.0
	for i := 0; i < int(x); i++ {
		result *= 10
	}
	// Простое приближение для дробных степеней
	if x > 0 && x-float64(int(x)) > 0 {
		result *= 1 + (x-float64(int(x)))*9
	}
	return result
}

func (s *GameService) saveRatingHistory(ctx context.Context, tx *gorm.DB, game *models.Game, formatType string,
	whiteUserID, whiteRatingBefore, whiteRatingAfter int, whiteResult string, whiteOpponentID int,
	blackUserID, blackRatingBefore, blackRatingAfter int, blackResult string, blackOpponentID int) error {

	// Проверяем существование таблицы
	var exists bool
	if err := tx.WithContext(ctx).Raw(`
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_schema = 'public' 
			AND table_name = 'rating_history'
		)
	`).Scan(&exists).Error; err != nil || !exists {
		return nil // Таблица не существует, это нормально
	}

	// Сохраняем историю для белых
	if err := tx.WithContext(ctx).Exec(`
		INSERT INTO rating_history 
		(user_id, format_type, rating_before, rating_after, rating_change, game_id, result, opponent_id, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
	`, whiteUserID, formatType, whiteRatingBefore, whiteRatingAfter, whiteRatingAfter-whiteRatingBefore, game.ID, whiteResult, whiteOpponentID).Error; err != nil {
		return err
	}

	// Сохраняем историю для черных
	if err := tx.WithContext(ctx).Exec(`
		INSERT INTO rating_history 
		(user_id, format_type, rating_before, rating_after, rating_change, game_id, result, opponent_id, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
	`, blackUserID, formatType, blackRatingBefore, blackRatingAfter, blackRatingAfter-blackRatingBefore, game.ID, blackResult, blackOpponentID).Error; err != nil {
		return err
	}

	return nil
}

// boardFromFEN создает chess.Game из FEN строки
func boardFromFEN(fen string) (*chess.Game, error) {
	if fen == "" || fen == "startpos" {
		return chess.NewGame(), nil
	}

	fenOption, err := chess.FEN(fen)
	if err != nil {
		return nil, fmt.Errorf("invalid FEN format: %w", err)
	}

	return chess.NewGame(fenOption), nil
}

func (s *GameService) MakeMove(ctx context.Context, gameID uuid.UUID, playerID *int, playerSessionID *string, payload *MakeMovePayload) (*models.Game, *models.Move, error) {
	// Получаем арену из пула для работы в рамках этого запроса
	mem := s.arenaPool.Get()
	defer s.arenaPool.Put(mem)

	var game models.Game
	var dbMove *models.Move

	// Проверяем, что передан хотя бы один идентификатор
	if playerID == nil && playerSessionID == nil {
		return nil, nil, fmt.Errorf("either player_id or player_session_id must be provided")
	}

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Блокируем игру
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&game, "id = ?", gameID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return fmt.Errorf("game not found")
			}
			return err
		}

		if game.Status == models.GameStatusFinished {
			return fmt.Errorf("game already finished")
		}

		// Парсим metadata для проверки анонимных игроков в арене
		var metadata map[string]interface{}
		if len(game.Metadata) > 0 {
			// Используем арену для временного маппинга если нужно (хотя json.Unmarshal аллоцирует сам, 
			// мы можем оптимизировать последующую работу если бы у нас был арена-совместимый парсер)
			if err := json.Unmarshal(game.Metadata, &metadata); err != nil {
				metadata = make(map[string]interface{})
			}
		} else {
			metadata = make(map[string]interface{})
		}

		// Проверяем, присоединились ли оба игрока (учитывая user_id и session_id)
		hasWhite := game.WhiteID != nil || metadata["white_session_id"] != nil
		hasBlack := game.BlackID != nil || metadata["black_session_id"] != nil
		if !hasWhite || !hasBlack {
			return fmt.Errorf("cannot start game until second player joins")
		}

		// Проверяем, чей ход и что это правильный игрок
		whiteSessionID, _ := metadata["white_session_id"].(string)
		blackSessionID, _ := metadata["black_session_id"].(string)

		if game.NextTurn == models.SideWhite {
			// Проверяем, что ход делает белый игрок
			if game.WhiteID != nil {
				if playerID == nil || *playerID != *game.WhiteID {
					return fmt.Errorf("not your turn")
				}
			} else if whiteSessionID != "" {
				if playerSessionID == nil || *playerSessionID != whiteSessionID {
					return fmt.Errorf("not your turn")
				}
			} else {
				return fmt.Errorf("white player not found")
			}
		} else {
			// Проверяем, что ход делает черный игрок
			if game.BlackID != nil {
				if playerID == nil || *playerID != *game.BlackID {
					return fmt.Errorf("not your turn")
				}
			} else if blackSessionID != "" {
				if playerSessionID == nil || *playerSessionID != blackSessionID {
					return fmt.Errorf("not your turn")
				}
			} else {
				return fmt.Errorf("black player not found")
			}
		}

		// Создаем доску из текущей позиции
		board, err := boardFromFEN(game.CurrentPos)
		if err != nil {
			return err
		}

		// Парсим ход в UCI нотации
		chessMove, err := chess.UCINotation{}.Decode(board.Position(), payload.UCI)
		if err != nil {
			return fmt.Errorf("invalid UCI move format: %w", err)
		}

		// Проверяем, что ход легальный
		// notnil/chess уже валидирует ход при декодировании UCI
		validMoves := board.ValidMoves()
		var validMove *chess.Move
		for _, m := range validMoves {
			if m.S1() == chessMove.S1() && m.S2() == chessMove.S2() {
				validMove = m
				break
			}
		}

		if validMove == nil {
			return fmt.Errorf("illegal move")
		}

		// Делаем ход
		board.Move(validMove)

		// Проверяем, был ли это взятие
		pos := board.Position()
		isCapture := pos.Board().Piece(validMove.S2()) != chess.NoPiece || validMove.HasTag(chess.Capture)

		// Получаем SAN нотацию
		san := validMove.String()

		// Получаем новую FEN позицию
		newFEN := pos.String()

		currentTurn := game.NextTurn

		// Загружаем последний ход
		var lastMove *models.Move
		lastMove, err = s.getLastMove(ctx, gameID)
		if err != nil {
			return fmt.Errorf("failed to get last move: %w", err)
		}

		// Проверка таймаута
		effectiveWhitePast, effectiveBlackPast, err := s.ComputeEffectiveClocks(ctx, &game, lastMove)
		if err != nil {
			return err
		}

		// Парсим TimeControl из JSON
		var tc *models.TimeControl
		if len(game.TimeControl) > 0 {
			var parsedTC models.TimeControl
			if err := json.Unmarshal(game.TimeControl, &parsedTC); err == nil {
				tc = &parsedTC
			}
		}

		whiteFinish := int64(0)
		blackFinish := int64(0)
		if tc != nil {
			whiteFinish = tc.WhiteFinishMs
			blackFinish = tc.BlackFinishMs
			if whiteFinish == 0 {
				whiteFinish = tc.InitialMs
			}
			if blackFinish == 0 {
				blackFinish = tc.InitialMs
			}
		}

		if currentTurn == models.SideWhite {
			if whiteFinish > 0 && effectiveWhitePast >= whiteFinish {
				// Move rejected: timeout
				return fmt.Errorf("white clock expired")
			}
		} else {
			if blackFinish > 0 && effectiveBlackPast >= blackFinish {
				// Move rejected: timeout
				return fmt.Errorf("black clock expired")
			}
		}

		// Вычисляем прошедшее время
		incrementMs := int64(0)
		if tc != nil {
			incrementMs = tc.IncrementMs
		}

		elapsedMs := s.computeElapsedMs(ctx, &game, lastMove)

		// Вычисляем новые значения времени
		whitePast, blackPast, whiteFinishNew, blackFinishNew := s.computeClocksForMove(&game, currentTurn, elapsedMs, incrementMs)

		moveIndex := game.MoveCount + 1
		moveCreatedAt := time.Now().UTC()

		// Создаем запись хода с ClocksAfter в JSON
		clocksAfter := models.ClocksAfter{
			WhitePastMs:   whitePast,
			BlackPastMs:   blackPast,
			WhiteFinishMs: whiteFinishNew,
			BlackFinishMs: blackFinishNew,
		}
		clocksAfterJSON, err := json.Marshal(clocksAfter)
		if err != nil {
			return fmt.Errorf("failed to marshal clocks_after: %w", err)
		}

		// Создаем запись хода в арене
		move := arena.New[models.Move](mem)
		move.GameID = gameID
		move.MoveIndex = moveIndex
		move.UCI = payload.UCI
		move.SAN = &san
		move.FenAfter = newFEN
		move.PlayerID = playerID
		move.ClocksAfter = clocksAfterJSON
		move.IsCapture = isCapture
		move.Promotion = payload.Promotion
		move.CreatedAt = moveCreatedAt

		if err := tx.Create(move).Error; err != nil {
			return fmt.Errorf("failed to insert move: %w", err)
		}

		dbMove = move

		// Обновляем игру
		newNextTurn := models.SideBlack
		if game.NextTurn == models.SideWhite {
			newNextTurn = models.SideBlack
		} else {
			newNextTurn = models.SideWhite
		}

		// Обновляем TimeControl JSON
		if tc == nil {
			tc = &models.TimeControl{}
		}
		tc.WhiteFinishMs = whiteFinishNew
		tc.BlackFinishMs = blackFinishNew
		timeControlJSON, err := json.Marshal(tc)
		if err != nil {
			return fmt.Errorf("failed to marshal time_control: %w", err)
		}
		game.TimeControl = timeControlJSON

		game.CurrentPos = newFEN
		game.MoveCount = moveIndex
		game.WhiteClockMs = whitePast
		game.BlackClockMs = blackPast
		game.NextTurn = newNextTurn

		// Проверка окончания игры
		outcome := board.Outcome()
		if outcome == chess.WhiteWon {
			winner := models.SideWhite
			reason := string(models.TerminationCheckmate)
			if err := s.finishGame(ctx, tx, &game, &winner, reason, playerID); err != nil {
				return err
			}
		} else if outcome == chess.BlackWon {
			winner := models.SideBlack
			reason := string(models.TerminationCheckmate)
			if err := s.finishGame(ctx, tx, &game, &winner, reason, playerID); err != nil {
				return err
			}
		} else if outcome == chess.Draw {
			// Определяем причину ничьей
			var reason string = "STALEMATE"
			if pos.Status() == chess.Stalemate {
				reason = "STALEMATE"
			} else {
				reason = "DRAW"
			}
			if err := s.finishGame(ctx, tx, &game, nil, reason, playerID); err != nil {
				return err
			}
		} else {
			// Обновляем игру если игра не завершена
			if err := tx.Save(&game).Error; err != nil {
				return fmt.Errorf("failed to update game: %w", err)
			}
		}

		return nil
	})

	if err != nil {
		return nil, nil, err
	}

	return &game, dbMove, nil
}

func (s *GameService) GetUserGameStats(ctx context.Context, userID int) (*models.UserGameStats, error) {
	// Получаем все завершенные партии пользователя
	var games []models.Game
	err := s.db.WithContext(ctx).Where(
		"(white_id = ? OR black_id = ?) AND status = ?",
		userID, userID, models.GameStatusFinished,
	).Find(&games).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get games: %w", err)
	}

	// Функция для определения формата игры
	getGameFormat := func(timeControlJSON datatypes.JSON) string {
		if len(timeControlJSON) == 0 {
			return "classical"
		}
		var tc models.TimeControl
		if err := json.Unmarshal(timeControlJSON, &tc); err != nil {
			return "classical"
		}
		initialMinutes := float64(tc.InitialMs) / 60000.0

		if initialMinutes < 3 {
			return "bullet"
		} else if initialMinutes < 10 {
			return "blitz"
		} else if initialMinutes < 30 {
			return "rapid"
		}
		return "classical"
	}

	// Подсчет статистики
	type formatStat struct {
		Games  int
		Wins   int
		Losses int
		Draws  int
	}
	formatStats := map[string]*formatStat{
		"blitz":     {},
		"bullet":    {},
		"rapid":     {},
		"classical": {},
	}

	totalWins := 0
	totalLosses := 0
	totalDraws := 0

	for _, game := range games {
		formatType := getGameFormat(game.TimeControl)
		formatStats[formatType].Games++

		if game.Result != nil {
			isWhite := game.WhiteID != nil && *game.WhiteID == userID

			if *game.Result == models.ResultDraw {
				formatStats[formatType].Draws++
				totalDraws++
			} else {
				isWinner := (*game.Result == models.ResultWhiteWin && isWhite) ||
					(*game.Result == models.ResultBlackWin && !isWhite)

				if isWinner {
					formatStats[formatType].Wins++
					totalWins++
				} else {
					formatStats[formatType].Losses++
					totalLosses++
				}
			}
		}
	}

	// Получаем рейтинги пользователя из таблицы users
	type UserRatings struct {
		BlitzRating  *int `gorm:"column:blitz_rating"`
		BulletRating *int `gorm:"column:bullet_rating"`
		RapidRating  *int `gorm:"column:rapid_rating"`
		PuzzleRating *int `gorm:"column:puzzle_rating"`
	}
	var ratings UserRatings
	err = s.db.WithContext(ctx).Table("users").
		Select("blitz_rating, bullet_rating, rapid_rating, puzzle_rating").
		Where("id = ?", userID).
		First(&ratings).Error

	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	blitzRating := 1200
	bulletRating := 1200
	rapidRating := 1200
	puzzleRating := 1200
	if ratings.BlitzRating != nil {
		blitzRating = *ratings.BlitzRating
	}
	if ratings.BulletRating != nil {
		bulletRating = *ratings.BulletRating
	}
	if ratings.RapidRating != nil {
		rapidRating = *ratings.RapidRating
	}
	if ratings.PuzzleRating != nil {
		puzzleRating = *ratings.PuzzleRating
	}

	totalGames := totalWins + totalLosses + totalDraws
	overallWinRate := 0.0
	if totalGames > 0 {
		overallWinRate = float64(totalWins) / float64(totalGames) * 100.0
	}

	// Формируем список статистики по форматам
	byFormat := []models.GameFormatStats{}
	for fmt, stats := range formatStats {
		if stats.Games > 0 {
			winRate := 0.0
			if stats.Games > 0 {
				winRate = float64(stats.Wins) / float64(stats.Games) * 100.0
			}
			byFormat = append(byFormat, models.GameFormatStats{
				Format:      fmt,
				GamesPlayed: stats.Games,
				Wins:        stats.Wins,
				Losses:      stats.Losses,
				Draws:       stats.Draws,
				WinRate:     math.Trunc(winRate*10+0.5) / 10, // Округление до 1 знака
			})
		}
	}

	return &models.UserGameStats{
		TotalGames:     totalGames,
		TotalWins:      totalWins,
		TotalLosses:    totalLosses,
		TotalDraws:     totalDraws,
		OverallWinRate: math.Trunc(overallWinRate*10+0.5) / 10, // Округление до 1 знака
		BlitzRating:    blitzRating,
		BulletRating:   bulletRating,
		RapidRating:    rapidRating,
		PuzzleRating:   puzzleRating,
		ByFormat:       byFormat,
	}, nil
}
