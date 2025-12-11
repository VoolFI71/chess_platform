(() => {
  const TasksConstants = window.TasksConstants;
  const TasksState = window.TasksState;
  
  if (!TasksConstants || !TasksState) {
    throw new Error('Required modules not loaded. Ensure all task modules are included.');
  }

  window.TasksMain = {
    async bootstrapTasksPage() {
      // Пытаемся получить пользователя, но не перенаправляем, если не авторизован
      try {
        if (typeof window.authMe === 'function') {
          TasksState.currentUser = await window.authMe();
        } else {
          // Если функция authMe недоступна, проверяем токен напрямую
          const token = localStorage.getItem('access_token');
          if (token) {
            // Пытаемся получить пользователя через API
            const res = await fetch('/api/auth/me', {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            if (res.ok) {
              TasksState.currentUser = await res.json();
            }
          }
        }
      } catch (err) {
        // Тихо игнорируем ошибки авторизации - пользователь может быть неавторизован
        console.debug('Auth check failed (user may be not authorized)', err);
        TasksState.currentUser = null;
      }
      
      // Загружаем статистику только для авторизованных пользователей
      if (TasksState.currentUser) {
        await window.TasksAPI.loadPuzzleStats();
      }
      
      // Для всех пользователей инициализируем рейтинг марафона, если выбран режим марафон
      if (TasksState.selectedMode.id === 'marathon') {
        TasksState.marathonRating = 1000;
        try {
          sessionStorage.setItem('tasks_marathon_rating', '1000');
        } catch (e) {
          console.debug('Failed to save marathon rating to sessionStorage', e);
        }
      }
      
      // Рендерим режимы после проверки авторизации
      window.TasksUI.renderModes();
    },

    async selectMode(id) {
      const next = TasksConstants.MODES.find((m) => m.id === id);
      if (!next) return;
      
      // Проверяем, требуется ли авторизация для выбранного режима
      if (next.requiresAuth && !TasksState.currentUser) {
        window.location.href = '/login';
        return;
      }
      
      // Для режима марафон всегда сбрасываем рейтинг на 1000 при выборе режима
      // (независимо от того, авторизован пользователь или нет)
      if (next.id === 'marathon') {
        TasksState.marathonRating = 1000;
        try {
          sessionStorage.setItem('tasks_marathon_rating', '1000');
        } catch (e) {
          console.debug('Failed to save marathon rating to sessionStorage', e);
        }
      }
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
      } else if (TasksState.selectedMode.id === 'marathon') {
        // Для режима марафон увеличиваем рейтинг на 100 при правильном решении
        TasksState.marathonRating = (TasksState.marathonRating || 1000) + 100;
        try {
          sessionStorage.setItem('tasks_marathon_rating', TasksState.marathonRating.toString());
        } catch (e) {
          console.debug('Failed to save marathon rating to sessionStorage', e);
        }
      }
      window.TasksUI.updateStats();
      
      window.TasksHistory.showCorrectMovesInHistory();
      
      // Для режима марафон не отправляем попытки на сервер, сразу загружаем следующую задачу
      if (TasksState.selectedMode.id === 'marathon') {
        window.TasksUtils.createTimer(() => {
          window.TasksUI.setPuzzleStatus('Загружаем следующую задачу...', false);
          window.TasksAPI.loadPuzzleForCurrentMode();
        }, 1500);
      } else {
        // Отправляем попытку только для авторизованных пользователей в других режимах
        if (TasksState.currentUser) {
          window.TasksAPI.submitAttempt(true);
        }
      }
    },

    handlePuzzleFailed(targetSquare) {
      TasksState.isPuzzleFailed = true;
      TasksState.selectedSquare = null;
      TasksState.availableTargets = new Set();
      window.TasksUI.stopTimeTracking();
      
      TasksState.sessionStats.total++;
      if (TasksState.selectedMode.id === 'survival') {
        TasksState.sessionStats.streak = 0;
      } else if (TasksState.selectedMode.id === 'marathon') {
        // Для режима марафон уменьшаем рейтинг на 100 при неправильном решении
        TasksState.marathonRating = Math.max(400, (TasksState.marathonRating || 1000) - 100);
        try {
          sessionStorage.setItem('tasks_marathon_rating', TasksState.marathonRating.toString());
        } catch (e) {
          console.debug('Failed to save marathon rating to sessionStorage', e);
        }
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
    // Не переопределяем window.toggleMobileMenu, используем функции напрямую из mobile-menu.js
  };

  // Не переопределяем глобальные функции toggleMobileMenu и closeMobileMenu
  // Они уже определены в mobile-menu.js и должны использоваться напрямую

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

