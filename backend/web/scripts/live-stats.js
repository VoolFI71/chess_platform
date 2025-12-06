// Live statistics updates for hero section
(() => {
  async function updateOnlineCount() {
    try {
      // TODO: Реализовать эндпоинт /api/stats/online
      // Пока используем рандомное число для демонстрации
      const count = Math.floor(Math.random() * 50) + 150; // 150-200
      const el = document.getElementById('heroOnlineCount');
      if (el) {
        el.innerHTML = `<span style="font-weight: 600; color: #10b981;">${count}</span> игроков онлайн`;
      }
    } catch (err) {
      console.log('Failed to update online count:', err);
    }
  }

  function animateCounter(element, target, duration = 2000) {
    if (!element) return;
    
    const start = parseInt(element.textContent.replace(/,/g, '')) || 0;
    const increment = (target - start) / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
      current += increment;
      if ((increment > 0 && current >= target) || (increment < 0 && current <= target)) {
        current = target;
        clearInterval(timer);
      }
      element.textContent = Math.floor(current).toLocaleString('ru-RU');
    }, 16);
  }

  function initLiveStats() {
    // Обновляем количество онлайн игроков
    updateOnlineCount();
    
    // Обновляем каждые 30 секунд
    setInterval(updateOnlineCount, 30000);

    // Анимируем счетчики статистики при первой загрузке
    const statUsers = document.getElementById('stat-users');
    const statPuzzlesSolved = document.getElementById('stat-puzzles-solved');
    const statGamesPlayed = document.getElementById('stat-games-played');
    const statTotalPuzzles = document.getElementById('stat-total-puzzles');

    // Используем данные из глобальной статистики если они есть
    setTimeout(() => {
      if (statUsers && window.globalStats?.total_users) {
        animateCounter(statUsers, window.globalStats.total_users);
      }
      if (statPuzzlesSolved && window.globalStats?.total_puzzle_attempts) {
        animateCounter(statPuzzlesSolved, window.globalStats.total_puzzle_attempts);
      }
      if (statGamesPlayed && window.globalStats?.total_games) {
        animateCounter(statGamesPlayed, window.globalStats.total_games);
      }
      if (statTotalPuzzles && window.globalStats?.total_puzzles) {
        animateCounter(statTotalPuzzles, window.globalStats.total_puzzles);
      }
    }, 500);
  }

  // Запускаем при загрузке страницы
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLiveStats);
  } else {
    initLiveStats();
  }

  window.LiveStats = {
    update: updateOnlineCount,
    animateCounter,
  };
})();

