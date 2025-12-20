package ai

// Engine представляет интерфейс для шахматного AI движка
type Engine interface {
	// GetBestMove возвращает лучший ход в формате UCI для заданной позиции
	GetBestMove(fen string, options EngineOptions) (string, error)

	// SetSkillLevel устанавливает уровень сложности (0-20)
	SetSkillLevel(level int) error

	// Close закрывает соединение с движком
	Close() error
}

// EngineOptions содержит параметры для получения хода
type EngineOptions struct {
	SkillLevel  int // 0-20 (0 = слабый, 20 = очень сильный)
	TimeLimitMs int // Максимальное время на ход в миллисекундах
	Depth       int // Глубина поиска (опционально, если 0 - используется время)
}
