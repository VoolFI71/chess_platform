(() => {
  const TasksState = window.TasksState;
  
  if (!TasksState) {
    throw new Error('TasksState module is not loaded. Ensure tasks/state.js is included first.');
  }

  window.TasksHistory = {
    navigateHistory(direction) {
      if (TasksState.movesHistory.length === 0) return;
      
      TasksState.currentHistoryIndex += direction;
      TasksState.currentHistoryIndex = Math.max(-1, Math.min(TasksState.movesHistory.length - 1, TasksState.currentHistoryIndex));
      
      // Очищаем выбор при навигации по истории
      TasksState.selectedSquare = null;
      TasksState.availableTargets = new Set();
      
      if (TasksState.currentHistoryIndex === -1) {
        // Возвращаемся к начальной позиции (до первого хода противника)
        if (TasksState.initialFEN && window.TasksBoard) {
          TasksState.currentFEN = TasksState.initialFEN;
          if (typeof window.TasksBoard.parseFEN === 'function') {
            TasksState.board = window.TasksBoard.parseFEN(TasksState.currentFEN);
          }
          if (typeof window.TasksBoard.renderBoard === 'function') {
            window.TasksBoard.renderBoard();
          }
        }
      } else {
        const historyItem = TasksState.movesHistory[TasksState.currentHistoryIndex];
        if (historyItem && historyItem.fen && window.TasksBoard) {
          TasksState.currentFEN = historyItem.fen;
          if (typeof window.TasksBoard.parseFEN === 'function') {
            TasksState.board = window.TasksBoard.parseFEN(TasksState.currentFEN);
          }
          if (typeof window.TasksBoard.renderBoard === 'function') {
            window.TasksBoard.renderBoard();
          }
        }
      }
      
      if (window.TasksHistory && typeof window.TasksHistory.updateHistoryNavigation === 'function') {
        window.TasksHistory.updateHistoryNavigation();
      }
    },

    updateHistoryNavigation() {
      const prevBtn = document.getElementById('prevMoveBtn');
      const nextBtn = document.getElementById('nextMoveBtn');
      
      if (prevBtn) {
        prevBtn.disabled = TasksState.currentHistoryIndex <= -1;
      }
      if (nextBtn) {
        nextBtn.disabled = TasksState.currentHistoryIndex >= TasksState.movesHistory.length - 1;
      }
    },

    updateMovesHistory() {
      const historyEl = document.getElementById('movesHistory');
      const navEl = document.getElementById('movesNavigation');
      
      if (!historyEl) return;
      
      // Ограничиваем размер истории для предотвращения утечек памяти
      const maxSize = TasksState.maxHistorySize || 100;
      if (TasksState.movesHistory.length > maxSize) {
        // Удаляем старые записи, сохраняя последние maxSize
        const itemsToRemove = TasksState.movesHistory.length - maxSize;
        TasksState.movesHistory.splice(0, itemsToRemove);
        // Корректируем индекс, если он вышел за границы
        if (TasksState.currentHistoryIndex >= TasksState.movesHistory.length) {
          TasksState.currentHistoryIndex = TasksState.movesHistory.length - 1;
        }
      }
      
      if (TasksState.movesHistory.length === 0) {
        historyEl.innerHTML = '<div class="moves-empty">Ходы появятся здесь</div>';
        if (navEl) navEl.classList.add('hidden');
        return;
      }
      
      if (navEl) navEl.classList.remove('hidden');
      
      // Очищаем старые обработчики событий перед перерисовкой
      // innerHTML = '' автоматически удалит все обработчики, но мы удаляем их явно для безопасности
      const oldMoveElements = historyEl.querySelectorAll('.move-item');
      oldMoveElements.forEach(el => {
        // Удаляем обработчики из TasksState.eventListeners
        if (TasksState.eventListeners && TasksState.eventListeners.has(el)) {
          const handlers = TasksState.eventListeners.get(el);
          handlers.forEach(({ type, handler }) => {
            el.removeEventListener(type, handler);
          });
          TasksState.eventListeners.delete(el);
        }
      });
      
      historyEl.innerHTML = '';
      
      TasksState.movesHistory.forEach((item, index) => {
        const moveEl = document.createElement('div');
        moveEl.className = `move-item ${index === TasksState.currentHistoryIndex ? 'active' : ''}`;
        moveEl.dataset.moveNum = `${index + 1}.`;
        moveEl.textContent = item.move;
        moveEl.title = item.isPlayer ? 'Ваш ход' : 'Ход противника';
        if (item.isCorrect !== undefined) {
          if (item.isCorrect) {
            moveEl.classList.add('move-correct');
          } else {
            moveEl.classList.add('move-incorrect');
          }
        }
        
        // Сохраняем обработчик для последующей очистки
        const clickHandler = () => {
          TasksState.currentHistoryIndex = index;
          if (item && item.fen && window.TasksBoard) {
            TasksState.currentFEN = item.fen;
            if (typeof window.TasksBoard.parseFEN === 'function') {
              TasksState.board = window.TasksBoard.parseFEN(TasksState.currentFEN);
            }
          }
          // Очищаем выбор при клике на элемент истории
          TasksState.selectedSquare = null;
          TasksState.availableTargets = new Set();
          if (window.TasksBoard && typeof window.TasksBoard.renderBoard === 'function') {
            window.TasksBoard.renderBoard();
          }
          if (window.TasksHistory) {
            if (typeof window.TasksHistory.updateHistoryNavigation === 'function') {
              window.TasksHistory.updateHistoryNavigation();
            }
            if (typeof window.TasksHistory.updateMovesHistory === 'function') {
              window.TasksHistory.updateMovesHistory();
            }
          }
        };
        
        moveEl.addEventListener('click', clickHandler);
        
        // Сохраняем ссылку на обработчик для возможной очистки
        if (!TasksState.eventListeners.has(moveEl)) {
          TasksState.eventListeners.set(moveEl, new Set());
        }
        TasksState.eventListeners.get(moveEl).add({ type: 'click', handler: clickHandler });
        
        historyEl.appendChild(moveEl);
      });
      
      if (TasksState.isPuzzleSolved && TasksState.currentPuzzle && TasksState.currentPuzzle.moves) {
        window.TasksHistory.showCorrectMovesInHistory();
      }
    },

    showCorrectMovesInHistory() {
      if (!TasksState.currentPuzzle || !TasksState.currentPuzzle.moves) return;
      
      const historyEl = document.getElementById('movesHistory');
      if (!historyEl) return;
      
      const correctMoves = TasksState.currentPuzzle.moves;
      const separator = document.createElement('div');
      separator.className = 'moves-separator';
      separator.innerHTML = '<div class="separator-line"></div><span class="separator-text">Правильное решение</span><div class="separator-line"></div>';
      historyEl.appendChild(separator);
      
      // Массив moves начинается с хода противника (индекс 0)
      // Ходы противника: 0, 2, 4, 6, ...
      // Ходы игрока: 1, 3, 5, 7, ...
      for (let i = 0; i < correctMoves.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const opponentMove = correctMoves[i];
        const playerMove = correctMoves[i + 1] || '';
        
        const movePair = document.createElement('div');
        movePair.className = 'move-item move-correct';
        movePair.dataset.moveNum = `${moveNum}.`;
        // Отображаем в правильном порядке: сначала противник, потом игрок
        movePair.textContent = opponentMove + (playerMove ? ' ' + playerMove : '');
        movePair.title = 'Правильное решение';
        movePair.style.opacity = '0.7';
        historyEl.appendChild(movePair);
      }
    },
  };
})();

