(() => {
  const TasksConstants = window.TasksConstants;
  if (!TasksConstants) {
    throw new Error('TasksConstants module is not loaded. Ensure tasks/constants.js is included first.');
  }

  window.TasksState = {
    selectedMode: TasksConstants.MODES[0],
    currentUser: null,
    puzzleStats: null,
    currentPuzzle: null,
    board: [],
    isPuzzleLoading: false,
    puzzleStartTime: null,
    isSubmittingAttempt: false,

    // Состояние для интерактивной доски
    currentFEN: null,
    initialFEN: null, // Начальный FEN пазла (для определения активного цвета)
    initialActiveColor: 'w', // Активный цвет в начальной позиции ('w' или 'b')
    // playerColor вычисляется из initialActiveColor: если initialActiveColor = 'w', то playerColor = 'b' и наоборот
    // Начальное значение 'b' соответствует initialActiveColor = 'w'
    playerColor: 'b', // Цвет игрока (противоположный начальному активному цвету)
    boardOrientation: 'white', // Фиксированная ориентация доски (не меняется при ходах)
    userMoves: [],
    selectedSquare: null,
    availableTargets: new Set(),
    isPuzzleSolved: false,
    isPuzzleFailed: false,
    currentMoveIndex: 0, // Индекс текущего хода игрока в последовательности

    // Флаги и таймеры для оптимизации
    renderBoardScheduled: false,
    activeTimers: new Set(), // Для отслеживания и отмены активных таймеров
    audioContext: null, // Общий Web Audio контекст (ленивая инициализация)
    boardClickHandler: null, // Обработчик делегирования событий
    eventListeners: new Map(), // Для отслеживания обработчиков событий (для очистки)

    // Состояние для статистики и управления
    sessionStats: {
      solved: 0,
      total: 0,
      streak: 0,
      bestStreak: 0
    },
    movesHistory: [],
    currentHistoryIndex: -1,
    maxHistorySize: 100, // Максимальный размер истории ходов для предотвращения утечек памяти
    timeInterval: null,
    lastMoveSquares: [], // Клетки последнего хода для подсветки
    
    // Кеширование позиций (Map с ограничением размера для предотвращения утечек памяти)
    positionCache: new Map(), // Кеш для позиций (ключ - строка "FEN|color", значение - Map с ходами)
  };
})();

