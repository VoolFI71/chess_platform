package services

import (
	"github.com/yourorg/computer_games_service/internal/ai"
)

// AIService обертка над AI движком
type AIService struct {
	engine ai.Engine
}

func NewAIService(engine ai.Engine) *AIService {
	return &AIService{
		engine: engine,
	}
}

// GetBestMove получает лучший ход от AI
func (s *AIService) GetBestMove(fen string, options AIOptions) (string, error) {
	return s.engine.GetBestMove(fen, ai.EngineOptions{
		SkillLevel:  options.SkillLevel,
		TimeLimitMs: options.TimeLimitMs,
		Depth:       options.Depth,
	})
}

// SetSkillLevel устанавливает уровень сложности
func (s *AIService) SetSkillLevel(level int) error {
	return s.engine.SetSkillLevel(level)
}

// Close закрывает AI движок
func (s *AIService) Close() error {
	return s.engine.Close()
}
