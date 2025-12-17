// Live statistics updates for hero section
(() => {
  let statsWs = null;
  let reconnectTimeout = null;
  const RECONNECT_DELAY = 3000; // 3 секунды

  function updateOnlineCount(count) {
    const el = document.getElementById('heroOnlineCount');
    if (el) {
      el.innerHTML = `<span style="font-weight: 600; color: #10b981;">${count}</span> игроков онлайн`;
    }
  }

  function connectStatsWebSocket() {
    // Определяем WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stats`;

    try {
      statsWs = new WebSocket(wsUrl);

      statsWs.onopen = () => {
        console.log('[Stats WS] Connected');
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
          console.error('[Stats WS] Failed to parse message:', err);
        }
      };

      statsWs.onerror = (error) => {
        console.error('[Stats WS] Error:', error);
      };

      statsWs.onclose = () => {
        console.log('[Stats WS] Disconnected, reconnecting...');
        statsWs = null;
        // Переподключаемся через некоторое время
        reconnectTimeout = setTimeout(connectStatsWebSocket, RECONNECT_DELAY);
      };
    } catch (err) {
      console.error('[Stats WS] Failed to connect:', err);
      // Fallback: используем polling при ошибке WebSocket
      fallbackToPolling();
    }
  }

  function fallbackToPolling() {
    console.log('[Stats] Falling back to polling');
    async function fetchOnlineCount() {
      try {
        const res = await fetch('/api/stats/online');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        updateOnlineCount(data.online_players || 0);
      } catch (err) {
        console.error('Failed to update online count:', err);
        const el = document.getElementById('heroOnlineCount');
        if (el) {
          el.innerHTML = `<span style="font-weight: 600; color: #10b981;">—</span> игроков онлайн`;
        }
      }
    }
    fetchOnlineCount();
    setInterval(fetchOnlineCount, 30000);
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

  window.LiveStats = {
    update: (count) => updateOnlineCount(count),
    animateCounter,
    disconnect: () => {
      if (statsWs) {
        statsWs.close();
        statsWs = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    },
  };
})();

