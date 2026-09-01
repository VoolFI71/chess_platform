// Live statistics updates for hero section
(() => {
  let statsWs = null;
  let reconnectTimeout = null;
  const RECONNECT_DELAY = 3000; // 3 секунды

  function updateOnlineCount(count) {
    const el = document.getElementById('heroOnlineCount');
    if (el) {
      el.textContent = '';
      const span = document.createElement('span');
      span.style.fontWeight = '600';
      span.style.color = '#10b981';
      span.textContent = count;
      el.appendChild(span);
      const text = document.createTextNode(' игроков онлайн');
      el.appendChild(text);
    }
  }

  function connectStatsWebSocket() {
    // Определяем WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stats`;

    statsWs = new WebSocket(wsUrl);

    statsWs.onopen = () => {
        // Сбрасываем таймер переподключения при успешном подключении
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
    };

    statsWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'online_stats') {
            updateOnlineCount(data.online_players || 0);
          }
        } catch (err) {
          }
    };

    statsWs.onerror = () => {
      statsWs?.close();
    };

    statsWs.onclose = () => {
      statsWs = null;
      reconnectTimeout = setTimeout(connectStatsWebSocket, RECONNECT_DELAY);
    };
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
    // Подключаемся к WebSocket для real-time обновлений
    connectStatsWebSocket();
    // Удалено: анимация счетчиков статистики (window.globalStats не используется)
  }

  // Запускаем при загрузке страницы
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLiveStats);
  } else {
    initLiveStats();
  }

  function disconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (statsWs) {
      statsWs.close(1000, 'User disconnect');
      statsWs = null;
    }
  }

  window.LiveStats = {
    update: (count) => updateOnlineCount(count),
    animateCounter,
    disconnect,
  };
})();

