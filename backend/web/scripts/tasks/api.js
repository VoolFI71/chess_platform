(() => {
  const TasksConstants = window.TasksConstants;
  const TasksState = window.TasksState;
  
  if (!TasksConstants || !TasksState) {
    throw new Error('Required modules not loaded. Ensure tasks/constants.js and tasks/state.js are included first.');
  }

  window.TasksAPI = {
    async authorizedFetch(path, options = {}) {
      if (typeof window.apiFetch === 'function') {
        return window.apiFetch(path, options);
      }
      return fetch(path, options);
    },

    buildPuzzleRequestUrl() {
      if (TasksState.selectedMode.id !== 'rated') {
        return TasksConstants.API_ENDPOINTS.randomPuzzle;
      }
      const rating = window.TasksUtils.getCurrentPuzzleRating();
      const spread = 150;
      const params = new URLSearchParams();
      params.set('rating_min', Math.max(400, rating - spread));
      params.set('rating_max', Math.min(3500, rating + spread));
      return `${TasksConstants.API_ENDPOINTS.randomPuzzle}?${params.toString()}`;
    },

    async loadPuzzleForCurrentMode() {
      if (TasksState.isPuzzleLoading) return;

      const section = document.getElementById('puzzleSection');
      if (section) section.style.display = 'block';

      TasksState.isPuzzleLoading = true;
      window.TasksUI.setPuzzleStatus('Загружаем задачу...', false);

      window.TasksUtils.clearAllTimers();
      window.TasksUI.stopTimeTracking();
      
      TasksState.userMoves = [];
      TasksState.selectedSquare = null;
      TasksState.availableTargets = new Set();
      TasksState.isPuzzleSolved = false;
      TasksState.isPuzzleFailed = false;
      TasksState.currentMoveIndex = 0;
      TasksState.movesHistory = [];
      TasksState.currentHistoryIndex = -1;
      TasksState.renderBoardScheduled = false;
      TasksState.lastMoveSquares = [];
      
      window.TasksHistory.updateMovesHistory();

      try {
        const url = window.TasksAPI.buildPuzzleRequestUrl();
        const res = await window.TasksAPI.authorizedFetch(url);
        
        if (!res.ok) {
          let errorMessage = 'Не удалось получить задачу. Попробуйте позже.';
          
          if (res.status === 403) {
            errorMessage = 'Доступ запрещён. Возможно, требуется авторизация.';
          } else if (res.status === 502 || res.status === 503) {
            errorMessage = 'Сервис временно недоступен. Попробуйте позже.';
          } else if (res.status === 500) {
            errorMessage = 'Ошибка сервера. Попробуйте позже.';
          }
          
          throw new Error(errorMessage);
        }
        
        const puzzle = await res.json();
        TasksState.currentPuzzle = puzzle;
        TasksState.currentFEN = puzzle.fen || '';
        TasksState.initialFEN = puzzle.fen || '';
        TasksState.board = window.TasksBoard.parseFEN(TasksState.currentFEN);
        
        // Определяем и сохраняем ориентацию доски из начальной позиции
        const fenParts = TasksState.currentFEN.split(' ');
        const initialActiveColor = fenParts[1] || 'w';
        TasksState.initialActiveColor = initialActiveColor;
        // Игрок играет за противоположный цвет (если в FEN активный цвет 'w', игрок играет за 'b')
        const playerColor = initialActiveColor === 'w' ? 'b' : 'w';
        TasksState.playerColor = playerColor;
        TasksState.boardOrientation = playerColor === 'b' ? 'black' : 'white';
        
        // Применяем первый ход противника (moves[0]) вручную и устанавливаем индекс игрока в 0
        const correctMoves = puzzle.moves || [];
        if (correctMoves.length > 0) {
          const firstOpponentMove = correctMoves[0];
          // Применяем ход напрямую без увеличения индекса
          if (window.TasksMoves.applyMoveToBoard(firstOpponentMove, true)) {
            TasksState.movesHistory.push({
              move: firstOpponentMove,
              fen: TasksState.currentFEN,
              isPlayer: false
            });
            TasksState.currentHistoryIndex = TasksState.movesHistory.length - 1;
            window.TasksHistory.updateMovesHistory();
            // Устанавливаем индекс в 0 (первый ход игрока будет в moves[0*2+1] = moves[1])
            TasksState.currentMoveIndex = 0;
          }
        }
        
        window.TasksBoard.renderBoard();
        window.TasksUI.updatePuzzleHeader(puzzle);
        
        TasksState.puzzleStartTime = Date.now();
        window.TasksUI.startTimeTracking();
        
        window.TasksUI.updateStats();
      } catch (err) {
        console.error('Puzzle load failed', err);
        const errorMessage = err.message || 'Не удалось загрузить задачу.';
        window.TasksUI.setPuzzleStatus(errorMessage, true);
        
        // Очищаем состояние при ошибке
        TasksState.currentPuzzle = null;
        TasksState.currentFEN = null;
        TasksState.initialFEN = null;
        TasksState.board = [];
        TasksState.selectedSquare = null;
        TasksState.availableTargets = new Set();
        TasksState.userMoves = [];
        TasksState.movesHistory = [];
        TasksState.currentHistoryIndex = -1;
        TasksState.currentMoveIndex = 0;
        TasksState.initialActiveColor = 'w';
        TasksState.playerColor = 'b';
        TasksState.boardOrientation = 'white';
        TasksState.lastMoveSquares = [];
        window.TasksBoard.renderBoard();
        window.TasksHistory.updateMovesHistory();
      } finally {
        TasksState.isPuzzleLoading = false;
      }
    },

    async loadPuzzleStats() {
      try {
        const res = await window.TasksAPI.authorizedFetch(TasksConstants.API_ENDPOINTS.stats);
        if (!res.ok) {
          // Для 403 и 502 не логируем ошибку, просто не загружаем статистику
          if (res.status === 403 || res.status === 502 || res.status === 503) {
            TasksState.puzzleStats = null;
            return;
          }
          throw new Error('no stats');
        }
        TasksState.puzzleStats = await res.json();
        
        // Обновляем серию из БД для режима выживания
        if (TasksState.puzzleStats) {
          TasksState.sessionStats.streak = TasksState.puzzleStats.current_streak || 0;
          TasksState.sessionStats.bestStreak = TasksState.puzzleStats.best_streak || 0;
        }
      } catch (err) {
        // Тихо игнорируем ошибки загрузки статистики
        console.debug('Failed to load puzzle stats', err);
        TasksState.puzzleStats = null;
      } finally {
        window.TasksUI.renderModes();
        window.TasksUI.updateStats();
      }
    },

    async submitAttempt(success) {
      if (!TasksState.currentPuzzle || TasksState.isSubmittingAttempt) return;
      
      TasksState.isSubmittingAttempt = true;
      
      try {
        const timeSpentMs = TasksState.puzzleStartTime ? Math.max(100, Date.now() - TasksState.puzzleStartTime) : null;
        
        // Если задача решена успешно, отправляем все ходы из puzzle.moves до момента решения
        // Логика: если success = true, значит последний ход был правильным, 
        // и все предыдущие тоже были правильными (иначе задача завершилась бы раньше)
        // 
        // puzzle.moves = [opponent0, player0, opponent1, player1, ...]
        // currentMoveIndex увеличивается после каждого корректного хода игрока
        // После последнего хода игрока (когда задача решена):
        //   - currentMoveIndex указывает на количество выполненных ходов игрока
        //   - последний ход игрока имеет индекс = currentMoveIndex * 2 - 1
        //   - поэтому нужно взять ходы до индекса currentMoveIndex * 2 - 1 включительно
        let movesPlayed = [];
        if (success && TasksState.currentPuzzle && TasksState.currentPuzzle.moves) {
          const correctMoves = TasksState.currentPuzzle.moves;
          // Когда задача решена, последний ход игрока был правильным
          const completedPlayerMoves = TasksState.currentMoveIndex;
          const lastMoveIndex = completedPlayerMoves > 0 ? (completedPlayerMoves * 2) - 1 : -1;
          if (lastMoveIndex >= 0) {
            movesPlayed = correctMoves.slice(0, lastMoveIndex + 1);
          }
        }
        
        const payload = {
          puzzle_id: TasksState.currentPuzzle.puzzle_id,
          mode: TasksState.selectedMode.id,
          success: success,
          time_spent_ms: timeSpentMs,
          mistake_count: success ? 0 : 1,
          moves_played: movesPlayed,
        };
        
        const res = await window.TasksAPI.authorizedFetch(TasksConstants.API_ENDPOINTS.attempts, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Не удалось отправить результат.');
        }
        
        await window.TasksAPI.loadPuzzleStats();
        
        // Обновляем серию из обновленной статистики
        if (TasksState.puzzleStats) {
          TasksState.sessionStats.streak = TasksState.puzzleStats.current_streak || 0;
          TasksState.sessionStats.bestStreak = TasksState.puzzleStats.best_streak || 0;
        }
        
        if (success) {
          await new Promise(resolve => {
            window.TasksUtils.createTimer(resolve, 2000);
          });
          window.TasksUI.setPuzzleStatus('Загружаем следующую задачу...', false);
          await window.TasksAPI.loadPuzzleForCurrentMode();
        }
      } catch (err) {
        console.error('Failed to submit attempt', err);
        window.TasksUI.setPuzzleStatus(err.message || 'Не удалось отправить результат.', true);
      } finally {
        TasksState.isSubmittingAttempt = false;
      }
    },
  };
})();

