package ai

import (
	"fmt"
	"sync"
	"time"
)

// StockfishPool управляет пулом процессов Stockfish для параллельной обработки запросов
type StockfishPool struct {
	pool     chan *StockfishEngine
	mu       sync.Mutex
	engines  []*StockfishEngine
	poolSize int
	closed   bool
}

// NewStockfishPool создает пул процессов Stockfish
// poolSize - количество процессов в пуле (рекомендуется: количество ядер CPU или немного больше)
func NewStockfishPool(path string, poolSize int) (*StockfishPool, error) {
	if poolSize < 1 {
		poolSize = 4 // По умолчанию 4 процесса (для серверов с 3-4 ядрами)
	}

	pool := &StockfishPool{
		pool:     make(chan *StockfishEngine, poolSize),
		engines:  make([]*StockfishEngine, 0, poolSize),
		poolSize: poolSize,
		closed:   false,
	}

	// Создаем процессы и заполняем пул
	// Добавляем небольшую задержку между созданием процессов для стабильности
	for i := 0; i < poolSize; i++ {
		engine, err := NewStockfishEngine(path)
		if err != nil {
			// Если не удалось создать все процессы, закрываем уже созданные
			pool.Close()
			return nil, fmt.Errorf("failed to create stockfish engine %d/%d: %w", i+1, poolSize, err)
		}
		pool.engines = append(pool.engines, engine)
		pool.pool <- engine

		// Задержка между созданием процессов для стабильности
		// Увеличена для серверов с ограниченными ресурсами
		if i < poolSize-1 {
			time.Sleep(200 * time.Millisecond)
		}
	}

	return pool, nil
}

// GetBestMove получает лучший ход, используя свободный процесс из пула
func (p *StockfishPool) GetBestMove(fen string, options EngineOptions) (string, error) {
	// Получаем свободный процесс из пула
	engine := <-p.pool
	defer func() {
		// Возвращаем процесс обратно в пул
		if !p.closed {
			p.pool <- engine
		}
	}()

	// Используем процесс для получения хода
	return engine.GetBestMove(fen, options)
}

// SetSkillLevel устанавливает уровень сложности для всех процессов в пуле
func (p *StockfishPool) SetSkillLevel(level int) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, engine := range p.engines {
		if err := engine.SetSkillLevel(level); err != nil {
			return fmt.Errorf("failed to set skill level: %w", err)
		}
	}
	return nil
}

// Close закрывает все процессы в пуле
func (p *StockfishPool) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		return nil
	}

	p.closed = true

	// Очищаем канал от процессов (до закрытия канала)
	for len(p.pool) > 0 {
		<-p.pool
	}

	// Закрываем канал
	close(p.pool)

	// Закрываем все процессы
	var lastErr error
	for _, engine := range p.engines {
		if err := engine.Close(); err != nil {
			lastErr = err
		}
	}

	return lastErr
}

// GetPoolSize возвращает размер пула
func (p *StockfishPool) GetPoolSize() int {
	return p.poolSize
}
