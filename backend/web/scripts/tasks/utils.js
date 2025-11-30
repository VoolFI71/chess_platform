(() => {
  const TasksState = window.TasksState;
  
  if (!TasksState) {
    throw new Error('TasksState module is not loaded. Ensure tasks/state.js is included first.');
  }

  window.TasksUtils = {
    // Безопасная функция для экранирования HTML
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    // Вспомогательная функция для создания безопасных таймеров
    createTimer(callback, delay) {
      const timerId = setTimeout(() => {
        TasksState.activeTimers.delete(timerId);
        callback();
      }, delay);
      
      TasksState.activeTimers.add(timerId);
      return timerId;
    },

    // Функция для отмены всех активных таймеров
    clearAllTimers() {
      TasksState.activeTimers.forEach(timerId => clearTimeout(timerId));
      TasksState.activeTimers.clear();
    },

    getCurrentPuzzleRating() {
      if (TasksState.puzzleStats && typeof TasksState.puzzleStats.puzzle_rating === 'number') {
        return TasksState.puzzleStats.puzzle_rating;
      }
      if (TasksState.currentUser && typeof TasksState.currentUser.puzzle_rating === 'number') {
        return TasksState.currentUser.puzzle_rating;
      }
      return 1200;
    },

    getModeMeta(mode) {
      if (mode.id === 'survival') {
        const best = TasksState.puzzleStats?.survival_best_streak ?? TasksState.puzzleStats?.best_streak ?? 0;
        return {
          icon: 'fa-fire',
          text: `Максимальная серия: ${best}`,
        };
      }
      if (mode.id === 'rated') {
        const rating = window.TasksUtils.getCurrentPuzzleRating();
        return {
          icon: 'fa-star',
          text: `Рейтинг задач: ${rating}`,
        };
      }
      return { icon: '', text: '' };
    },

    _ensureAudioContext() {
      if (TasksState.audioContext === false) return null;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        TasksState.audioContext = false;
        return null;
      }
      if (!TasksState.audioContext) {
        try {
          TasksState.audioContext = new AudioContext();
        } catch (err) {
          console.warn('[puzzle] Failed to create AudioContext', err);
          TasksState.audioContext = false;
          return null;
        }
      }
      const ctx = TasksState.audioContext;
      if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume().catch(() => {});
      }
      return ctx || null;
    },

    playTone(frequency, options = {}) {
      const ctx = window.TasksUtils._ensureAudioContext();
      if (!ctx) return;

      const {
        duration = 0.18,
        type = 'sine',
        volume = 0.12,
        delay = 0,
      } = options;

      const startTime = ctx.currentTime + Math.max(0, delay);
      const stopTime = startTime + Math.max(0.05, duration);

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startTime);

      gainNode.gain.setValueAtTime(Math.max(0.0001, volume), startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, stopTime);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(startTime);
      oscillator.stop(stopTime + 0.01);
    },

    playSound(kind) {
      const ctx = window.TasksUtils._ensureAudioContext();
      if (!ctx) return;

      if (kind === 'success') {
        window.TasksUtils.playTone(880, { duration: 0.12, type: 'sine', volume: 0.14 });
        window.TasksUtils.playTone(1180, { duration: 0.12, type: 'sine', volume: 0.10, delay: 0.08 });
      } else if (kind === 'error') {
        window.TasksUtils.playTone(300, { duration: 0.18, type: 'sawtooth', volume: 0.16 });
        window.TasksUtils.playTone(200, { duration: 0.18, type: 'sawtooth', volume: 0.14, delay: 0.06 });
      }
    },
  };
})();

