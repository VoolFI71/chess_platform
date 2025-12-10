(() => {
  const TasksConstants = window.TasksConstants;
  const TasksState = window.TasksState;
  
  if (!TasksConstants || !TasksState) {
    throw new Error('Required modules not loaded. Ensure all task modules are included.');
  }

  window.TasksMain = {
    async bootstrapTasksPage() {
      // Проверяем авторизацию - если пользователь не авторизован, перенаправляем на страницу входа
      try {
        if (typeof window.authMe === 'function') {
          TasksState.currentUser = await window.authMe();
        } else {
          // Если функция authMe недоступна, проверяем токен напрямую
          const token = localStorage.getItem('access_token');
          if (!token) {
            window.location.href = '/login';
            return;
          }
          // Пытаемся получить пользователя через API
          const res = await fetch('/api/auth/me', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (!res.ok) {
            window.location.href = '/login';
            return;
          }
          TasksState.currentUser = await res.json();
        }
        
        // Если пользователь не авторизован, перенаправляем на страницу входа
        if (!TasksState.currentUser) {
          window.location.href = '/login';
          return;
        }
      } catch (err) {
        // Если произошла ошибка при проверке авторизации, перенаправляем на страницу входа
        console.debug('Auth check failed', err);
        window.location.href = '/login';
        return;
      }
      
      // Загружаем статистику (только для авторизованных пользователей)
      await window.TasksAPI.loadPuzzleStats();
    },

    async selectMode(id) {
      // Проверяем авторизацию перед выбором режима
      if (!TasksState.currentUser) {
        window.location.href = '/login';
        return;
      }
      
      const next = TasksConstants.MODES.find((m) => m.id === id);
      if (!next) return;
      TasksState.selectedMode = next;
      window.TasksUI.renderModes();
      
      const modeGrid = document.getElementById('modeGrid');
      if (modeGrid) {
        modeGrid.classList.add('hidden');
      }
      
      const tasksHeader = document.querySelector('.tasks-header');
      if (tasksHeader) {
        tasksHeader.classList.add('hidden');
      }
      
      // Ленивая загрузка модулей для работы с доской
      try {
        if (window.loadBoardModules && typeof window.loadBoardModules === 'function') {
          await window.loadBoardModules();
        }
      } catch (error) {
        console.error('Failed to load board modules:', error);
        window.TasksUI.setPuzzleStatus('Ошибка загрузки модулей. Перезагрузите страницу.', true);
        return;
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
      
      // Отправляем попытку и загружаем следующую задачу
      window.TasksAPI.submitAttempt(false).then(() => {
        window.TasksUtils.createTimer(() => {
          window.TasksAPI.loadPuzzleForCurrentMode();
        }, 1000);
      }).catch(() => {
        // Если отправка не удалась, все равно загружаем следующую задачу
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

    // Mobile menu functions теперь в mobile-menu.js
    toggleMobileMenu() {
      if (window.toggleMobileMenu && typeof window.toggleMobileMenu === 'function') {
        window.toggleMobileMenu();
      }
    },

    closeMobileMenu() {
      if (window.closeMobileMenu && typeof window.closeMobileMenu === 'function') {
        window.closeMobileMenu();
      }
    },
  };

  // Экспортируем функции для использования в HTML через onclick
  window.toggleMobileMenu = () => window.TasksMain.toggleMobileMenu();
  window.closeMobileMenu = () => window.TasksMain.closeMobileMenu();

  // Инициализация при загрузке DOM
  document.addEventListener('DOMContentLoaded', () => {
    // Загружаем тему из localStorage и обновляем иконку
    if (window.loadTheme && typeof window.loadTheme === 'function') {
      window.loadTheme();
    } else {
      // Fallback если auth.js еще не загружен
      try {
        const saved = localStorage.getItem('theme');
        const isDark = saved === 'dark';
        document.body.classList.toggle('dark', isDark);
        document.documentElement.classList.toggle('dark', isDark);
        const icon = document.getElementById('themeIcon');
        if (icon) icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
      } catch (e) {
        console.debug('Theme load error:', e);
      }
    }
    
    window.TasksMain.bootstrapTasksPage();
    window.TasksMain.initBoardControls();
    window.TasksUI.updateStats();
  });
})();

