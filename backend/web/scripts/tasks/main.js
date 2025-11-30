(() => {
  const TasksConstants = window.TasksConstants;
  const TasksState = window.TasksState;
  
  if (!TasksConstants || !TasksState) {
    throw new Error('Required modules not loaded. Ensure all task modules are included.');
  }

  window.TasksMain = {
    async bootstrapTasksPage() {
      try {
        if (typeof window.authMe === 'function') {
          TasksState.currentUser = await window.authMe();
        }
      } catch (err) {
        // Тихо игнорируем ошибки авторизации (403 и т.д.)
        console.debug('Auth check failed', err);
        TasksState.currentUser = null;
      }
      // Загружаем статистику (может не загрузиться, если пользователь не авторизован)
      await window.TasksAPI.loadPuzzleStats();
    },

    selectMode(id) {
      const next = TasksConstants.MODES.find((m) => m.id === id);
      if (!next) return;
      TasksState.selectedMode = next;
      window.TasksUI.renderModes();
      
      const modeGrid = document.getElementById('modeGrid');
      if (modeGrid) {
        modeGrid.style.display = 'none';
      }
      
      const tasksHeader = document.querySelector('.tasks-header');
      if (tasksHeader) {
        tasksHeader.style.display = 'none';
      }
      
      window.TasksAPI.loadPuzzleForCurrentMode();
    },

    handlePuzzleSolved() {
      TasksState.isPuzzleSolved = true;
      TasksState.selectedSquare = null;
      TasksState.availableTargets = new Set();
      window.TasksUI.stopTimeTracking();
      window.TasksUI.setPuzzleStatus('Отлично! Задача решена правильно!', false);
      
      TasksState.sessionStats.solved++;
      TasksState.sessionStats.total++;
      if (TasksState.selectedMode.id === 'survival') {
        TasksState.sessionStats.streak++;
        if (TasksState.sessionStats.streak > TasksState.sessionStats.bestStreak) {
          TasksState.sessionStats.bestStreak = TasksState.sessionStats.streak;
        }
      }
      window.TasksUI.updateStats();
      
      window.TasksHistory.showCorrectMovesInHistory();
      
      window.TasksAPI.submitAttempt(true);
    },

    handlePuzzleFailed(targetSquare) {
      TasksState.isPuzzleFailed = true;
      TasksState.selectedSquare = null;
      TasksState.availableTargets = new Set();
      window.TasksUI.stopTimeTracking();
      
      TasksState.sessionStats.total++;
      if (TasksState.selectedMode.id === 'survival') {
        TasksState.sessionStats.streak = 0;
      }
      window.TasksUI.updateStats();
      
      if (targetSquare) {
        const grid = document.getElementById('boardGrid');
        if (grid) {
          const square = grid.querySelector(`[data-square="${targetSquare.toLowerCase()}"]`);
          if (square) {
            square.classList.add('invalid-move');
            window.TasksUtils.createTimer(() => {
              if (square) {
                square.classList.remove('invalid-move');
              }
            }, 800);
          }
        }
      }
      
      if (TasksState.selectedMode.id === 'survival') {
        window.TasksUI.setPuzzleStatus('Неверный ход! Серия сброшена. Загружаем следующую задачу...', true);
      } else {
        window.TasksUI.setPuzzleStatus('Неверный ход! Загружаем следующую задачу...', true);
      }
      
      window.TasksAPI.submitAttempt(false).then(() => {
        window.TasksUtils.createTimer(() => {
          window.TasksAPI.loadPuzzleForCurrentMode();
        }, 1000);
      });
    },

    initBoardControls() {
      const prevMoveBtn = document.getElementById('prevMoveBtn');
      const nextMoveBtn = document.getElementById('nextMoveBtn');

      if (prevMoveBtn) {
        prevMoveBtn.addEventListener('click', () => {
          window.TasksHistory.navigateHistory(-1);
        });
      }

      if (nextMoveBtn) {
        nextMoveBtn.addEventListener('click', () => {
          window.TasksHistory.navigateHistory(1);
        });
      }
    },

    toggleMobileMenu() {
      const menu = document.getElementById('mobileMenu');
      const icon = document.getElementById('menuIcon');
      if (!menu) return;
      const active = menu.classList.toggle('active');
      if (icon) icon.className = active ? 'fas fa-times' : 'fas fa-bars';
    },

    closeMobileMenu() {
      const menu = document.getElementById('mobileMenu');
      const icon = document.getElementById('menuIcon');
      if (menu) menu.classList.remove('active');
      if (icon) icon.className = 'fas fa-bars';
    },
  };

  // Экспортируем функции для использования в HTML через onclick
  window.toggleMobileMenu = () => window.TasksMain.toggleMobileMenu();
  window.closeMobileMenu = () => window.TasksMain.closeMobileMenu();

  // Инициализация при загрузке DOM
  document.addEventListener('DOMContentLoaded', () => {
    window.TasksMain.bootstrapTasksPage();
    window.TasksMain.initBoardControls();
    window.TasksUI.updateStats();
  });
})();

