// Matchmaking - WebSocket-based opponent search
(() => {
  let ws = null;
  let isSearching = false;

  function getMatchmakingUI() {
    return {
      overlay: document.getElementById('matchmakingOverlay'),
      statusText: document.getElementById('matchmakingStatusText'),
      cancelBtn: document.getElementById('matchmakingCancelBtn'),
      timeLabel: document.getElementById('matchmakingTimeLabel'),
      timer: document.getElementById('matchmakingTimer'),
    };
  }

  function formatTimeControl(initialMs, incrementMs) {
    const minutes = Math.round(initialMs / 60000);
    const increment = Math.round(incrementMs / 1000);
    return increment > 0 ? `${minutes}+${increment}` : `${minutes}+0`;
  }

  function findOpponent(initialMs, incrementMs, rated) {
    if (isSearching) return;

    const isAuth = typeof window.isAuthenticated === 'function' && window.isAuthenticated();
    if (!isAuth) {
      if (typeof window.showToast === 'function') {
        window.showToast('Для поиска соперника необходимо войти в аккаунт', 'error');
      }
      return;
    }

    isSearching = true;

    const ui = getMatchmakingUI();
    if (ui.overlay) ui.overlay.classList.add('active');
    if (ui.timeLabel) ui.timeLabel.textContent = formatTimeControl(initialMs, incrementMs);
    if (ui.statusText) ui.statusText.textContent = 'Подключение...';

    startTimer();

    const token = typeof window.getAccessToken === 'function' ? window.getAccessToken() : '';
    const wsUrl = window.App && window.App.WS
      ? window.App.WS.createWebSocketUrl('/ws/matchmaking', { token })
      : buildWsUrl(token);

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      const ui = getMatchmakingUI();
      if (ui.statusText) ui.statusText.textContent = 'Ищем соперника...';

      ws.send(JSON.stringify({
        type: 'join',
        time_control: {
          initial_ms: initialMs,
          increment_ms: incrementMs,
        },
        rated: !!rated,
      }));
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'matched' && data.game_id) {
        onMatchFound(data.game_id);
      } else if (data.type === 'searching') {
        const ui = getMatchmakingUI();
        if (ui.statusText) ui.statusText.textContent = 'Ищем соперника...';
      } else if (data.type === 'error') {
        stopSearch();
        if (typeof window.showToast === 'function') {
          window.showToast(data.message || 'Ошибка поиска', 'error');
        }
      }
    };

    ws.onerror = () => {
      // Connection error will trigger onclose
    };

    ws.onclose = (event) => {
      if (isSearching && event.code !== 1000) {
        stopSearch();
        if (typeof window.showToast === 'function') {
          window.showToast('Соединение потеряно. Попробуйте ещё раз.', 'error');
        }
      }
      ws = null;
    };
  }

  function onMatchFound(gameId) {
    const ui = getMatchmakingUI();
    if (ui.statusText) ui.statusText.textContent = 'Соперник найден!';
    stopSearch(false);
    setTimeout(() => {
      window.location.href = '/match/' + gameId;
    }, 500);
  }

  function cancelSearch() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'leave' }));
    }
    stopSearch();
  }

  function stopSearch(hideOverlay = true) {
    isSearching = false;
    stopTimer();

    if (ws) {
      ws.close(1000, 'cancel');
      ws = null;
    }

    if (hideOverlay) {
      const ui = getMatchmakingUI();
      if (ui.overlay) ui.overlay.classList.remove('active');
    }
  }

  function buildWsUrl(token) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws/matchmaking?token=${encodeURIComponent(token)}`;
  }

  // Search timer display
  let timerInterval = null;
  let timerStart = 0;

  function startTimer() {
    timerStart = Date.now();
    stopTimer();
    const ui = getMatchmakingUI();
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - timerStart) / 1000);
      const min = Math.floor(elapsed / 60);
      const sec = elapsed % 60;
      if (ui.timer) {
        ui.timer.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  window.findOpponent = findOpponent;
  window.cancelMatchmaking = cancelSearch;
})();
