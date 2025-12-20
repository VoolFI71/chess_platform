package ai

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// StockfishEngine реализует Engine интерфейс через Stockfish
// ВАЖНО: Каждый экземпляр должен использоваться только одной горутиной.
// Для параллельной обработки используйте StockfishPool.
type StockfishEngine struct {
	cmd        *exec.Cmd
	stdin      *bufio.Writer
	stdout     *bufio.Scanner
	stderr     *bufio.Scanner
	skillLevel int
	path       string
	errMutex   sync.Mutex
	errLines   []string
}

// NewStockfishEngine создает новый экземпляр Stockfish движка
func NewStockfishEngine(path string) (*StockfishEngine, error) {
	// Проверяем существование файла
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil, fmt.Errorf("stockfish binary not found at path: %s", path)
	}

	cmd := exec.Command(path)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	engine := &StockfishEngine{
		cmd:        cmd,
		stdin:      bufio.NewWriter(stdin),
		stdout:     bufio.NewScanner(stdout),
		stderr:     bufio.NewScanner(stderr),
		skillLevel: 5, // По умолчанию средний уровень
		path:       path,
		errLines:   make([]string, 0),
	}

	// Запускаем чтение stderr в отдельной горутине для диагностики
	go engine.readStderr()

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start stockfish: %w", err)
	}

	// Увеличиваем задержку для запуска процесса (особенно важно при создании множества процессов)
	// Для серверов с ограниченными ресурсами нужна большая задержка
	time.Sleep(500 * time.Millisecond)

	// Проверяем, что процесс еще запущен
	if cmd.ProcessState != nil && cmd.ProcessState.Exited() {
		engine.errMutex.Lock()
		errMsg := strings.Join(engine.errLines, "; ")
		engine.errMutex.Unlock()
		return nil, fmt.Errorf("stockfish process exited immediately: %s", errMsg)
	}

	// Инициализация UCI протокола
	// Увеличиваем таймаут для серверов с ограниченными ресурсами
	if err := engine.initialize(); err != nil {
		engine.errMutex.Lock()
		errMsg := strings.Join(engine.errLines, "; ")
		engine.errMutex.Unlock()
		engine.Close()
		return nil, fmt.Errorf("failed to initialize stockfish: %w (stderr: %s)", err, errMsg)
	}

	return engine, nil
}

// readStderr читает stderr в отдельной горутине для диагностики
func (s *StockfishEngine) readStderr() {
	for s.stderr.Scan() {
		line := s.stderr.Text()
		s.errMutex.Lock()
		s.errLines = append(s.errLines, line)
		if len(s.errLines) > 10 {
			s.errLines = s.errLines[1:] // Оставляем только последние 10 строк
		}
		s.errMutex.Unlock()
	}
}

// initialize инициализирует UCI протокол
func (s *StockfishEngine) initialize() error {
	// Отправляем команду uci
	if err := s.sendCommand("uci"); err != nil {
		return err
	}

	// Ждем ответ "uciok"
	// Увеличиваем таймаут для серверов с ограниченными ресурсами (было 5s, стало 15s)
	if err := s.waitForResponse("uciok", 15*time.Second); err != nil {
		return fmt.Errorf("stockfish did not respond with uciok: %w", err)
	}

	// Отправляем isready
	if err := s.sendCommand("isready"); err != nil {
		return err
	}

	// Ждем ответ "readyok"
	// Увеличиваем таймаут для серверов с ограниченными ресурсами (было 5s, стало 15s)
	if err := s.waitForResponse("readyok", 15*time.Second); err != nil {
		return fmt.Errorf("stockfish did not respond with readyok: %w", err)
	}

	return nil
}

// GetBestMove возвращает лучший ход в формате UCI
// ВАЖНО: Этот метод должен вызываться только одной горутиной на экземпляр.
// Для параллельной обработки используйте StockfishPool.
func (s *StockfishEngine) GetBestMove(fen string, options EngineOptions) (string, error) {
	// Устанавливаем skill level
	if err := s.SetSkillLevel(options.SkillLevel); err != nil {
		return "", err
	}

	// Устанавливаем позицию
	if err := s.sendCommand(fmt.Sprintf("position fen %s", fen)); err != nil {
		return "", err
	}

	// Запускаем поиск
	// Плавная градация времени и глубины в зависимости от уровня
	var searchCmd string
	timeLimit := options.TimeLimitMs
	if timeLimit <= 0 {
		timeLimit = 2000
	}

	// Плавное уменьшение времени для слабых уровней
	if s.skillLevel <= 3 {
		timeLimit = timeLimit / 3 // Очень мало времени для очень слабых
	} else if s.skillLevel <= 7 {
		timeLimit = timeLimit * 2 / 3 // Меньше времени для слабых
	} else if s.skillLevel <= 12 {
		timeLimit = timeLimit * 5 / 6 // Немного меньше для средних
	}
	// Для уровней 13+ используем полное время

	if options.Depth > 0 {
		// Плавное ограничение глубины
		maxDepth := options.Depth
		if s.skillLevel <= 3 {
			maxDepth = 2 // Очень ограниченная глубина
		} else if s.skillLevel <= 7 {
			maxDepth = 3 // Ограниченная глубина
		} else if s.skillLevel <= 12 {
			maxDepth = 4 // Средняя глубина
		} else if s.skillLevel <= 17 {
			maxDepth = 6 // Хорошая глубина
		}
		// Для уровней 18+ используем полную глубину
		searchCmd = fmt.Sprintf("go depth %d", maxDepth)
	} else {
		searchCmd = fmt.Sprintf("go movetime %d", timeLimit)
	}

	if err := s.sendCommand(searchCmd); err != nil {
		return "", err
	}

	// Читаем ответ и ищем bestmove
	timeout := time.After(time.Duration(options.TimeLimitMs+500) * time.Millisecond)

	for {
		select {
		case <-timeout:
			return "", fmt.Errorf("timeout waiting for bestmove")
		default:
			if !s.stdout.Scan() {
				return "", fmt.Errorf("stdout closed")
			}

			line := strings.TrimSpace(s.stdout.Text())

			// Ищем строку "bestmove"
			if strings.HasPrefix(line, "bestmove") {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					move := parts[1]
					// Если move == "(none)" - значит нет легальных ходов (мат/пат)
					if move == "(none)" {
						return "", fmt.Errorf("no legal moves available")
					}
					return move, nil
				}
			}
		}
	}
}

// SetSkillLevel устанавливает уровень сложности (0-20)
// ВАЖНО: Stockfish не имеет официальной формулы конвертации ELO в Skill Level
// Используем эмпирические значения: Skill Level 0 ≈ 1320-1350 ELO, Skill Level 20 ≈ 2850-3190 ELO
func (s *StockfishEngine) SetSkillLevel(level int) error {
	if level < 0 {
		level = 0
	}
	if level > 20 {
		level = 20
	}

	s.skillLevel = level

	// Stockfish использует параметр Skill Level для ограничения силы
	if err := s.sendCommand(fmt.Sprintf("setoption name Skill Level value %d", level)); err != nil {
		return err
	}

	// Плавная градация ошибок в зависимости от уровня
	// Чем ниже уровень, тем больше максимальная ошибка
	if level <= 3 {
		// Очень слабые уровни (0-3, примерно 800-1000 ELO)
		if err := s.sendCommand("setoption name Skill Level Maximum Error value 250"); err != nil {
			return err
		}
		if err := s.sendCommand("setoption name Skill Level Minimum Error value 0"); err != nil {
			return err
		}
	} else if level <= 7 {
		// Слабые уровни (4-7, примерно 1000-1400 ELO)
		maxError := 200 - (level-4)*25 // Плавное уменьшение: 200, 175, 150, 125
		if err := s.sendCommand(fmt.Sprintf("setoption name Skill Level Maximum Error value %d", maxError)); err != nil {
			return err
		}
		if err := s.sendCommand("setoption name Skill Level Minimum Error value 0"); err != nil {
			return err
		}
	} else if level <= 12 {
		// Средние уровни (8-12, примерно 1400-2000 ELO)
		maxError := 100 - (level-8)*20 // Плавное уменьшение: 100, 80, 60, 40, 20
		if err := s.sendCommand(fmt.Sprintf("setoption name Skill Level Maximum Error value %d", maxError)); err != nil {
			return err
		}
	} else if level <= 17 {
		// Сильные уровни (13-17, примерно 2000-2500 ELO)
		maxError := 20 - (level-13)*4 // Плавное уменьшение: 20, 16, 12, 8, 4
		if err := s.sendCommand(fmt.Sprintf("setoption name Skill Level Maximum Error value %d", maxError)); err != nil {
			return err
		}
	} else {
		// Очень сильные уровни (18-20, примерно 2500-2800 ELO)
		// Минимальные ошибки или стандартные настройки
		if err := s.sendCommand("setoption name Skill Level Maximum Error value 0"); err != nil {
			return err
		}
	}

	return nil
}

// sendCommand отправляет команду в Stockfish
func (s *StockfishEngine) sendCommand(cmd string) error {
	_, err := s.stdin.WriteString(cmd + "\n")
	if err != nil {
		return fmt.Errorf("failed to write command: %w", err)
	}
	return s.stdin.Flush()
}

// waitForResponse ждет определенный ответ от Stockfish
func (s *StockfishEngine) waitForResponse(expected string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		// Проверяем, что процесс еще запущен
		if s.cmd.ProcessState != nil && s.cmd.ProcessState.Exited() {
			s.errMutex.Lock()
			errMsg := strings.Join(s.errLines, "; ")
			s.errMutex.Unlock()
			return fmt.Errorf("stockfish process exited (stderr: %s)", errMsg)
		}

		if !s.stdout.Scan() {
			if err := s.stdout.Err(); err != nil {
				return fmt.Errorf("stdout scan error: %w", err)
			}
			time.Sleep(50 * time.Millisecond)
			if s.cmd.ProcessState != nil && s.cmd.ProcessState.Exited() {
				s.errMutex.Lock()
				errMsg := strings.Join(s.errLines, "; ")
				s.errMutex.Unlock()
				return fmt.Errorf("stockfish process exited before response (stderr: %s)", errMsg)
			}
			s.errMutex.Lock()
			errMsg := strings.Join(s.errLines, "; ")
			s.errMutex.Unlock()
			return fmt.Errorf("stdout closed unexpectedly (stderr: %s)", errMsg)
		}

		line := strings.TrimSpace(s.stdout.Text())
		if strings.Contains(line, expected) {
			return nil
		}
	}

	return fmt.Errorf("timeout waiting for %s", expected)
}

// Close закрывает соединение с Stockfish
func (s *StockfishEngine) Close() error {
	if s.cmd == nil || s.cmd.Process == nil {
		return nil
	}

	// Отправляем quit (игнорируем ошибки при закрытии)
	s.sendCommand("quit")

	// Закрываем stdin (bufio.Writer не имеет метода Close, но его можно проигнорировать)

	// Ждем завершения процесса
	done := make(chan error, 1)
	go func() {
		done <- s.cmd.Wait()
	}()

	select {
	case err := <-done:
		return err
	case <-time.After(5 * time.Second):
		// Принудительно убиваем процесс если не завершился
		if s.cmd.Process != nil {
			s.cmd.Process.Kill()
		}
		return fmt.Errorf("timeout waiting for stockfish to quit")
	}
}
