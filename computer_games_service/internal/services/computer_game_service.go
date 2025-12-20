package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/notnil/chess"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/yourorg/computer_games_service/internal/database"
	"github.com/yourorg/computer_games_service/internal/models"
)

// GameDetail для совместимости
type GameDetail = models.GameDetail

type ComputerGameService struct {
	db        *database.DB
	aiEngine  AIEngine
	wsManager WSManager // Для отправки обновлений через WebSocket
}

type WSManager interface {
	Broadcast(gameID string, message interface{}) error
}

type AIEngine interface {
	GetBestMove(fen string, options AIOptions) (string, error)
}

type AIOptions struct {
	SkillLevel  int
	TimeLimitMs int
	Depth       int
}

func NewComputerGameService(db *database.DB, aiEngine AIEngine, wsManager WSManager) *ComputerGameService {
	return &ComputerGameService{
		db:        db,
		aiEngine:  aiEngine,
		wsManager: wsManager,
	}
}

type CreateComputerGameRequest struct {
	CreatorColor string                 `json:"creator_color"`  // "white", "black", "random"
	AISkillLevel int                    `json:"ai_skill_level"` // 0-20
	TimeControl  *models.TimeControl    `json:"time_control"`
	Metadata     map[string]interface{} `json:"metadata"`
}

// CreateComputerGame создает новую игру с компьютером
func (s *ComputerGameService) CreateComputerGame(ctx context.Context, creatorID *int, creatorSessionID *string, req *CreateComputerGameRequest) (*models.GameDetail, error) {
	gameID := uuid.New()

	// Определяем цвет игрока
	playerColor := req.CreatorColor
	if playerColor == "random" {
		if time.Now().Unix()%2 == 0 {
			playerColor = "white"
		} else {
			playerColor = "black"
		}
	}

	// Определяем цвета игрока и AI
	var whiteID, blackID *int
	var whiteSessionID, blackSessionID *string
	var aiColor string

	if playerColor == "white" {
		whiteID = creatorID
		whiteSessionID = creatorSessionID
		blackID = nil // Компьютер
		aiColor = "black"
	} else {
		blackID = creatorID
		blackSessionID = creatorSessionID
		whiteID = nil // Компьютер
		aiColor = "white"
	}

	// Начальная позиция
	currentPos := "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

	// Time control
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

	// Metadata
	metadata := make(map[string]interface{})
	if req.Metadata != nil {
		for k, v := range req.Metadata {
			metadata[k] = v
		}
	}
	metadata["game_type"] = "computer"
	metadata["ai_level"] = req.AISkillLevel
	metadata["ai_color"] = aiColor

	if whiteSessionID != nil {
		metadata["white_session_id"] = *whiteSessionID
	}
	if blackSessionID != nil {
		metadata["black_session_id"] = *blackSessionID
	}

	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal metadata: %w", err)
	}

	// Определяем кто ходит первым
	nextTurn := models.SideWhite
	if aiColor == "white" {
		// Если AI играет белыми, он ходит первым
		nextTurn = models.SideWhite
	}

	game := models.Game{
		ID:           gameID,
		WhiteID:      whiteID,
		BlackID:      blackID,
		InitialPos:   "startpos",
		CurrentPos:   currentPos,
		NextTurn:     nextTurn,
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

	// Если AI ходит первым, делаем его ход сразу
	if aiColor == "white" && nextTurn == models.SideWhite {
		go func() {
			// Небольшая задержка для инициализации игры
			time.Sleep(500 * time.Millisecond)
			if err := s.MakeComputerMove(context.Background(), gameID); err != nil {
				log.Printf("[ComputerGameService] Failed to make initial AI move: %v", err)
			}
		}()
	}

	return detail, nil
}

// GetGame получает игру по ID
func (s *ComputerGameService) GetGame(ctx context.Context, gameID uuid.UUID) (*models.GameDetail, error) {
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

	// Парсим TimeControl
	if len(game.TimeControl) > 0 {
		var tc models.TimeControl
		if err := json.Unmarshal(game.TimeControl, &tc); err != nil {
			log.Printf("[ComputerGameService] Failed to unmarshal TimeControl: %v", err)
		} else {
			detail.WhiteFinishMs = &tc.WhiteFinishMs
			detail.BlackFinishMs = &tc.BlackFinishMs
		}
	}

	return detail, nil
}

// GetMoves получает ходы игры
func (s *ComputerGameService) GetMoves(ctx context.Context, gameID uuid.UUID, limit int) ([]models.Move, error) {
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

// MakePlayerMove делает ход игрока
func (s *ComputerGameService) MakePlayerMove(ctx context.Context, gameID uuid.UUID, uciMove string, playerID *int, playerSessionID *string) error {
	// Применяем ход игрока
	if err := s.applyMove(ctx, gameID, uciMove, playerID, playerSessionID); err != nil {
		return err
	}

	// Отправляем обновление через WebSocket
	if s.wsManager != nil {
		updatedGame, err := s.GetGame(ctx, gameID)
		if err == nil {
			updateMsg := map[string]interface{}{
				"type": "game_update",
				"game": updatedGame,
			}
			s.wsManager.Broadcast(gameID.String(), updateMsg)
		}
	}

	// После хода игрока проверяем, нужен ли ход AI
	game, err := s.GetGame(ctx, gameID)
	if err != nil {
		return err
	}

	// Если игра завершена - не делаем ход AI
	if game.Status == models.GameStatusFinished {
		return nil
	}

	// Парсим metadata
	var metadata map[string]interface{}
	if err := json.Unmarshal(game.Metadata, &metadata); err != nil {
		return nil // Не критично
	}

	aiColor, ok := metadata["ai_color"].(string)
	if !ok {
		return nil
	}

	// Проверяем, нужен ли ход AI
	isComputerTurn := (aiColor == "white" && game.NextTurn == models.SideWhite) ||
		(aiColor == "black" && game.NextTurn == models.SideBlack)

	if isComputerTurn {
		// Делаем ход AI в горутине, чтобы не блокировать ответ
		go func() {
			// Небольшая задержка для лучшего UX
			time.Sleep(500 * time.Millisecond)
			if err := s.MakeComputerMove(context.Background(), gameID); err != nil {
				log.Printf("[ComputerGameService] Failed to make AI move after player move: %v", err)
			}
		}()
	}

	return nil
}

// MakeComputerMove делает ход компьютера
func (s *ComputerGameService) MakeComputerMove(ctx context.Context, gameID uuid.UUID) error {
	game, err := s.GetGame(ctx, gameID)
	if err != nil {
		return err
	}

	// Проверяем, что игра активна
	if game.Status != models.GameStatusActive && game.Status != models.GameStatusCreated {
		return fmt.Errorf("game is not active")
	}

	// Парсим metadata
	var metadata map[string]interface{}
	if err := json.Unmarshal(game.Metadata, &metadata); err != nil {
		return fmt.Errorf("failed to parse metadata: %w", err)
	}

	aiColor, ok := metadata["ai_color"].(string)
	if !ok {
		return fmt.Errorf("ai_color not found in metadata")
	}

	aiLevel, ok := metadata["ai_level"].(float64)
	if !ok {
		aiLevel = 5 // По умолчанию
	}

	// Проверяем, что сейчас ход компьютера
	isComputerTurn := (aiColor == "white" && game.NextTurn == models.SideWhite) ||
		(aiColor == "black" && game.NextTurn == models.SideBlack)

	if !isComputerTurn {
		return fmt.Errorf("not computer's turn")
	}

	// Получаем лучший ход от AI
	move, err := s.aiEngine.GetBestMove(game.CurrentPos, AIOptions{
		SkillLevel:  int(aiLevel),
		TimeLimitMs: 2000, // 2 секунды на ход
	})

	if err != nil {
		return fmt.Errorf("failed to get AI move: %w", err)
	}

	// Применяем ход
	if err := s.applyMove(ctx, gameID, move, nil, nil); err != nil {
		return err
	}

	// Отправляем обновление через WebSocket
	if s.wsManager != nil {
		updatedGame, err := s.GetGame(ctx, gameID)
		if err == nil {
			updateMsg := map[string]interface{}{
				"type": "game_update",
				"game": updatedGame,
			}
			s.wsManager.Broadcast(gameID.String(), updateMsg)
		}
	}

	return nil
}

// applyMove применяет ход
func (s *ComputerGameService) applyMove(ctx context.Context, gameID uuid.UUID, uciMove string, playerID *int, playerSessionID *string) error {
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

		// Активируем игру если она еще не начата
		if game.Status == models.GameStatusCreated {
			now := time.Now().UTC()
			game.StartedAt = &now
			game.Status = models.GameStatusActive
		}

		// Создаем доску из текущей позиции
		board, err := boardFromFEN(game.CurrentPos)
		if err != nil {
			return err
		}

		// Парсим ход в UCI нотации
		chessMove, err := chess.UCINotation{}.Decode(board.Position(), uciMove)
		if err != nil {
			return fmt.Errorf("invalid UCI move format: %w", err)
		}

		// Проверяем, что ход легальный
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

		// Получаем информацию о ходе
		pos := board.Position()
		isCapture := pos.Board().Piece(validMove.S2()) != chess.NoPiece || validMove.HasTag(chess.Capture)
		san := validMove.String()
		newFEN := pos.String()

		// Проверяем шах и мат
		outcome := board.Outcome()

		// Создаем запись хода
		moveIndex := game.MoveCount + 1
		move := models.Move{
			GameID:    gameID,
			MoveIndex: moveIndex,
			UCI:       uciMove,
			SAN:       &san,
			FenAfter:  newFEN,
			IsCapture: isCapture,
			CreatedAt: time.Now().UTC(),
		}

		if err := tx.Create(&move).Error; err != nil {
			return fmt.Errorf("failed to insert move: %w", err)
		}

		// Обновляем игру
		newNextTurn := models.SideBlack
		if game.NextTurn == models.SideWhite {
			newNextTurn = models.SideBlack
		} else {
			newNextTurn = models.SideWhite
		}

		game.CurrentPos = newFEN
		game.MoveCount = moveIndex
		game.NextTurn = newNextTurn

		// Проверка окончания игры (outcome уже определен выше)
		if outcome == chess.WhiteWon {
			result := models.ResultWhiteWin
			reason := models.TerminationCheckmate
			game.Status = models.GameStatusFinished
			game.Result = &result
			game.TerminationReason = &reason
			now := time.Now().UTC()
			game.FinishedAt = &now
		} else if outcome == chess.BlackWon {
			result := models.ResultBlackWin
			reason := models.TerminationCheckmate
			game.Status = models.GameStatusFinished
			game.Result = &result
			game.TerminationReason = &reason
			now := time.Now().UTC()
			game.FinishedAt = &now
		} else if outcome == chess.Draw {
			result := models.ResultDraw
			var reason models.TerminationReason = models.TerminationDraw
			if pos.Status() == chess.Stalemate {
				reason = models.TerminationStalemate
			}
			game.Status = models.GameStatusFinished
			game.Result = &result
			game.TerminationReason = &reason
			now := time.Now().UTC()
			game.FinishedAt = &now
		}

		// Сохраняем игру
		if err := tx.Save(&game).Error; err != nil {
			return fmt.Errorf("failed to update game: %w", err)
		}

		return nil
	})

	return err
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
