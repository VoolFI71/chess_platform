package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
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
	// Мьютексы для предотвращения параллельных ходов AI для одной игры
	aiMoveMutexes sync.Map // map[uuid.UUID]*sync.Mutex
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
			// Используем контекст с таймаутом для фоновой задачи
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if err := s.MakeComputerMove(ctx, gameID); err != nil {
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
			// Используем контекст с таймаутом для фоновой задачи
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if err := s.MakeComputerMove(ctx, gameID); err != nil {
				log.Printf("[ComputerGameService] Failed to make AI move after player move: %v", err)
			}
		}()
	}

	return nil
}

// MakeComputerMove делает ход компьютера
func (s *ComputerGameService) MakeComputerMove(ctx context.Context, gameID uuid.UUID) error {
	// Получаем или создаем мьютекс для этой игры
	mutexInterface, _ := s.aiMoveMutexes.LoadOrStore(gameID, &sync.Mutex{})
	mutex := mutexInterface.(*sync.Mutex)

	// Блокируем, чтобы только одна горутина могла делать ход AI для этой игры
	mutex.Lock()
	defer mutex.Unlock()

	// Проверяем условия и получаем позицию в транзакции с блокировкой БД
	var game models.Game
	var currentPos string
	var aiLevel float64
	var moveCount int

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Блокируем игру для чтения
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&game, "id = ?", gameID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return fmt.Errorf("game not found")
			}
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

		level, ok := metadata["ai_level"].(float64)
		if !ok {
			level = 5 // По умолчанию
		}
		aiLevel = level

		// Проверяем, что сейчас ход компьютера (внутри транзакции с блокировкой)
		isComputerTurn := (aiColor == "white" && game.NextTurn == models.SideWhite) ||
			(aiColor == "black" && game.NextTurn == models.SideBlack)

		if !isComputerTurn {
			return fmt.Errorf("not computer's turn")
		}

		// Сохраняем текущую позицию и количество ходов для проверки после получения хода от AI
		currentPos = game.CurrentPos
		moveCount = game.MoveCount

		return nil
	})

	if err != nil {
		return err
	}

	// Выходим из транзакции, получаем ход от AI (это занимает время)
	move, err := s.aiEngine.GetBestMove(currentPos, AIOptions{
		SkillLevel:  int(aiLevel),
		TimeLimitMs: 2000, // 2 секунды на ход
	})

	if err != nil {
		return fmt.Errorf("failed to get AI move: %w", err)
	}

	// Снова проверяем в транзакции, что состояние не изменилось
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Блокируем игру снова
		var currentGame models.Game
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&currentGame, "id = ?", gameID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return fmt.Errorf("game not found")
			}
			return err
		}

		// Проверяем, что игра все еще активна
		if currentGame.Status != models.GameStatusActive && currentGame.Status != models.GameStatusCreated {
			return fmt.Errorf("game is not active")
		}

		// Проверяем, что позиция не изменилась (MoveCount должен быть таким же)
		if currentGame.MoveCount != moveCount {
			return fmt.Errorf("game state changed while AI was thinking")
		}

		// Проверяем, что это все еще ход компьютера
		var metadata map[string]interface{}
		if err := json.Unmarshal(currentGame.Metadata, &metadata); err != nil {
			return fmt.Errorf("failed to parse metadata: %w", err)
		}

		aiColor, ok := metadata["ai_color"].(string)
		if !ok {
			return fmt.Errorf("ai_color not found in metadata")
		}

		isComputerTurn := (aiColor == "white" && currentGame.NextTurn == models.SideWhite) ||
			(aiColor == "black" && currentGame.NextTurn == models.SideBlack)

		if !isComputerTurn {
			return fmt.Errorf("not computer's turn (state changed)")
		}

		// Применяем ход в той же транзакции
		return s.applyMoveInTransaction(tx, &currentGame, gameID, move, nil, nil)
	})

	if err != nil {
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

		return s.applyMoveInTransaction(tx, &game, gameID, uciMove, playerID, playerSessionID)
	})

	return err
}

// applyMoveInTransaction применяет ход внутри уже открытой транзакции
func (s *ComputerGameService) applyMoveInTransaction(tx *gorm.DB, game *models.Game, gameID uuid.UUID, uciMove string, playerID *int, playerSessionID *string) error {
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
