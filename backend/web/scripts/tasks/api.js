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

    buildPuzzleRequestUrl(excludePuzzleId = null) {
      const params = new URLSearchParams();
      
      // Добавляем случайный параметр для предотвращения кеширования
      params.set('_t', Date.now().toString());
      params.set('_r', Math.random().toString(36).substring(7));
      
      if (TasksState.selectedMode.id === 'rated') {
        const rating = window.TasksUtils.getCurrentPuzzleRating();
        // Округляем рейтинг до кратного 50 для стабильности ключей кеша
        // Это предотвращает создание новых кешей при каждом изменении рейтинга
        const roundedRating = Math.round(rating / 50) * 50;
        const spread = 150;
        params.set('rating_min', Math.max(400, roundedRating - spread));
        params.set('rating_max', Math.min(3500, roundedRating + spread));
      } else if (TasksState.selectedMode.id === 'marathon') {
        // Для режима марафон используем текущий рейтинг марафона
        const marathonRating = TasksState.marathonRating || 1000;
        // Округляем рейтинг до кратного 50
        const roundedRating = Math.round(marathonRating / 50) * 50;
        const spread = 150;
        params.set('rating_min', Math.max(400, roundedRating - spread));
        params.set('rating_max', Math.min(3500, roundedRating + spread));
      }
      
      // Если нужно исключить задачу, добавляем параметр (если API поддерживает)
      if (excludePuzzleId) {
        params.set('exclude', excludePuzzleId);
      }
      
      return `${TasksConstants.API_ENDPOINTS.randomPuzzle}?${params.toString()}`;
    },

    async loadPuzzleForCurrentMode() {
      if (TasksState.isPuzzleLoading) {
        return;
      }
      
      // Проверяем авторизацию только для режимов, требующих авторизации
      const selectedMode = TasksConstants.MODES.find(m => m.id === TasksState.selectedMode.id);
      if (selectedMode && selectedMode.requiresAuth && !TasksState.currentUser) {
        window.location.href = '/login';
        return;
      }

      const section = document.getElementById('puzzleSection');
      if (section) section.classList.remove('hidden');

      TasksState.isPuzzleLoading = true;
      window.TasksUI.setPuzzleStatus('Загружаем задачу...', false);

      window.TasksUtils.clearAllTimers();
      window.TasksUI.stopTimeTracking();
      
      // Сохраняем puzzle_id текущей задачи для исключения (если есть)
      const previousPuzzleId = TasksState.currentPuzzle?.puzzle_id || null;
      
      // Очистка памяти: удаляем старые обработчики событий
      if (TasksState.eventListeners) {
        TasksState.eventListeners.forEach((handlers, element) => {
          if (element && element.parentNode) {
            handlers.forEach(({ type, handler }) => {
              element.removeEventListener(type, handler);
            });
          }
        });
        TasksState.eventListeners.clear();
      }
      
      // Очищаем текущую задачу перед загрузкой новой (но puzzle_id уже сохранен выше)
      TasksState.currentPuzzle = null;
      TasksState.currentFEN = null;
      TasksState.initialFEN = null;
      TasksState.board = [];
      
      // Очищаем кеш позиций при загрузке новой задачи
      if (TasksState.positionCache) {
        TasksState.positionCache.clear();
      }
      
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
      
      // Очистка кеша позиций (WeakMap очистится автоматически, но можно явно очистить ссылки)
      // WeakMap не требует явной очистки, но мы можем очистить другие кеши
      
      if (window.TasksHistory && typeof window.TasksHistory.updateMovesHistory === 'function') {
        window.TasksHistory.updateMovesHistory();
      }

      // Показываем скелетон доски и скрываем реальную доску
      const skeleton = document.getElementById('boardSkeleton');
      const boardWrapper = document.getElementById('boardWrapper');
      if (skeleton) {
        skeleton.classList.remove('hidden');
        // Создаем клетки скелетона если их еще нет
        const skeletonGrid = skeleton.querySelector('.skeleton-board-grid');
        if (skeletonGrid && skeletonGrid.children.length === 0) {
          for (let i = 0; i < 64; i++) {
            const square = document.createElement('div');
            square.className = 'skeleton-square';
            skeletonGrid.appendChild(square);
          }
        }
      }
      if (boardWrapper) {
        boardWrapper.classList.add('hidden');
      }

      // Показываем секцию с задачей и базовую информацию сразу с плавным переходом
      const puzzleSection = document.getElementById('puzzleSection');
      if (puzzleSection) {
        puzzleSection.classList.remove('hidden');
        // Добавляем класс для плавного появления
        puzzleSection.classList.add('puzzle-transition-in');
        window.TasksUtils.createTimer(() => {
          puzzleSection.classList.remove('puzzle-transition-in');
        }, 500);
      }
      
      // Показываем скелетоны для боковых панелей
      const headerSkeleton = document.getElementById('headerSkeleton');
      const infoSkeleton = document.getElementById('infoSkeleton');
      if (headerSkeleton) {
        headerSkeleton.classList.remove('hidden');
      }
      if (infoSkeleton) {
        infoSkeleton.classList.remove('hidden');
      }
      
      // Показываем заголовок с режимом сразу (базовая информация)
      const headerCard = document.getElementById('puzzleHeaderCard');
      if (headerCard) {
        headerCard.classList.remove('hidden');
        const modeLabel = document.getElementById('currentModeLabel');
        if (modeLabel) {
          modeLabel.innerHTML = `
            <i class="fas fa-layer-group"></i>
            Режим: ${TasksState.selectedMode.name}
          `;
        }
      }

      try {
        // Загружаем новую задачу с параметрами для предотвращения кеширования
        let puzzle = null;
        let attempts = 0;
        const maxAttempts = 3; // Максимум попыток получить другую задачу
        
        while (attempts < maxAttempts) {
          const url = window.TasksAPI.buildPuzzleRequestUrl(previousPuzzleId);
          // Для режима марафон используем обычный fetch (не требуется авторизация)
          const fetchFn = TasksState.selectedMode.id === 'marathon' 
            ? fetch 
            : window.TasksAPI.authorizedFetch;
          const res = await fetchFn(url, {
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          
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
          
          puzzle = await res.json();
          
          // Если это та же задача, что была раньше - пробуем еще раз
          if (previousPuzzleId && puzzle.puzzle_id === previousPuzzleId) {
            attempts++;
            // Увеличиваем задержку с каждой попыткой
            await new Promise(resolve => setTimeout(resolve, 200 * attempts));
            continue;
          }
          
          // Получили другую задачу - выходим из цикла
          break;
        }
        
        if (!puzzle) {
          throw new Error('Не удалось получить новую задачу');
        }
        
        TasksState.currentPuzzle = puzzle;
        TasksState.currentFEN = puzzle.fen || '';
        TasksState.initialFEN = puzzle.fen || '';
        
        // Безопасный парсинг FEN
        if (window.TasksBoard && typeof window.TasksBoard.parseFEN === 'function') {
          TasksState.board = window.TasksBoard.parseFEN(TasksState.currentFEN);
        } else {
          console.error('TasksBoard.parseFEN not available');
          throw new Error('Модули доски не загружены');
        }
        
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
        if (correctMoves.length > 0 && window.TasksMoves) {
          const firstOpponentMove = correctMoves[0];
          // Применяем ход напрямую без увеличения индекса
          if (window.TasksMoves.applyMoveToBoard(firstOpponentMove, true)) {
            TasksState.movesHistory.push({
              move: firstOpponentMove,
              fen: TasksState.currentFEN,
              isPlayer: false
            });
            TasksState.currentHistoryIndex = TasksState.movesHistory.length - 1;
            if (window.TasksHistory) {
              window.TasksHistory.updateMovesHistory();
            }
            // Устанавливаем индекс в 0 (первый ход игрока будет в moves[0*2+1] = moves[1])
            TasksState.currentMoveIndex = 0;
          } else {
            console.warn('Failed to apply first opponent move');
          }
        }
        
        // Убеждаемся, что модули доски загружены перед рендерингом
        if (!window.TasksBoard) {
          console.error('TasksBoard module not loaded');
          throw new Error('Модули доски не загружены');
        }
        
        // Плавный переход: сначала скрываем старую доску, затем показываем новую
        const boardWrapper = document.getElementById('boardWrapper');
        
        if (boardWrapper && boardWrapper.classList.contains('hidden')) {
          // Первая загрузка - рендерим и показываем с анимацией
          if (window.TasksBoard && typeof window.TasksBoard.renderBoard === 'function') {
            window.TasksBoard.renderBoard();
          }
          boardWrapper.classList.remove('hidden');
          boardWrapper.classList.add('board-fade-in');
          if (window.TasksUtils && typeof window.TasksUtils.createTimer === 'function') {
            window.TasksUtils.createTimer(() => {
              boardWrapper.classList.remove('board-fade-in');
            }, 400);
          }
        } else if (boardWrapper) {
          // Переход между задачами - плавное исчезновение и появление
          boardWrapper.classList.add('board-fade-out');
          if (window.TasksUtils && typeof window.TasksUtils.createTimer === 'function') {
            window.TasksUtils.createTimer(() => {
              if (window.TasksBoard && typeof window.TasksBoard.renderBoard === 'function') {
                window.TasksBoard.renderBoard();
              }
              boardWrapper.classList.remove('board-fade-out');
              boardWrapper.classList.add('board-fade-in');
              if (window.TasksUtils && typeof window.TasksUtils.createTimer === 'function') {
                window.TasksUtils.createTimer(() => {
                  boardWrapper.classList.remove('board-fade-in');
                }, 400);
              }
            }, 200);
          }
        } else {
          if (window.TasksBoard && typeof window.TasksBoard.renderBoard === 'function') {
            window.TasksBoard.renderBoard();
          }
        }
        
        window.TasksUI.updatePuzzleHeader(puzzle);
        
        // Скрываем все скелетоны
        const skeleton = document.getElementById('boardSkeleton');
        const headerSkeleton = document.getElementById('headerSkeleton');
        const infoSkeleton = document.getElementById('infoSkeleton');
        
        if (skeleton) {
          skeleton.classList.add('hidden');
        }
        if (headerSkeleton) {
          headerSkeleton.classList.add('hidden');
        }
        if (infoSkeleton) {
          infoSkeleton.classList.add('hidden');
        }
        
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
        
        // Очистка памяти: удаляем обработчики событий
        if (window.TasksUtils && window.TasksUtils.clearAllEventListeners) {
          window.TasksUtils.clearAllEventListeners();
        }
        
        // Скрываем скелетон при ошибке
        const skeleton = document.getElementById('boardSkeleton');
        const boardWrapper = document.getElementById('boardWrapper');
        if (skeleton) {
          skeleton.classList.add('hidden');
        }
        if (boardWrapper) {
          boardWrapper.classList.add('hidden');
        }
        
        // Безопасный вызов renderBoard и updateMovesHistory
        if (window.TasksBoard && typeof window.TasksBoard.renderBoard === 'function') {
          window.TasksBoard.renderBoard();
        }
        if (window.TasksHistory && typeof window.TasksHistory.updateMovesHistory === 'function') {
          window.TasksHistory.updateMovesHistory();
        }
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
      // Проверяем авторизацию перед отправкой попытки
      if (!TasksState.currentUser) {
        window.location.href = '/login';
        return Promise.resolve();
      }
      
      if (!TasksState.currentPuzzle || TasksState.isSubmittingAttempt) {
        return Promise.resolve();
      }
      
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
        
        // Сохраняем puzzle_id до использования, так как currentPuzzle может быть очищен
        const puzzleId = TasksState.currentPuzzle?.puzzle_id;
        if (!puzzleId) {
          throw new Error('Текущая задача не найдена');
        }
        
        const payload = {
          puzzle_id: puzzleId,
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
        
        // Автоматически загружаем следующую задачу после успешного решения
        // (только для режимов, требующих авторизации)
        // Для режима марафон загрузка следующей задачи происходит в handlePuzzleSolved
        if (success && TasksState.selectedMode.id !== 'marathon') {
          await new Promise(resolve => {
            window.TasksUtils.createTimer(resolve, 1500);
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

