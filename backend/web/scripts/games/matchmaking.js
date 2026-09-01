// Matchmaking - WebSocket-based opponent search
(() => {
  const lifecycle = window.App?.Utils?.PageLifecycle;
  if (!lifecycle) throw new Error('PageLifecycle is not initialized');

  let wsConnection = null;
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

    if (typeof window.isAuthenticated !== 'function') throw new Error('Auth API is not initialized');
    const isAuth = window.isAuthenticated();
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

		if (!window.App?.WS?.createWebSocketUrl || !window.App.WS.createWebSocketConnection) {
		  throw new Error('WebSocket API is not initialized');
		}
		const wsUrl = window.App.WS.createWebSocketUrl('/ws/matchmaking');

    const sendJoin = () => {
      const ui = getMatchmakingUI();
      if (ui.statusText) ui.statusText.textContent = 'Ищем соперника...';
      wsConnection?.send({
        type: 'join',
        time_control: {
          initial_ms: initialMs,
          increment_ms: incrementMs,
        },
        rated: !!rated,
      });
    };

    wsConnection = window.App.WS.createWebSocketConnection({
      url: wsUrl,
      onConnect: sendJoin,
      onMessage: (data) => {
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
      },
      onDisconnect: (event) => {
        if (isSearching && event.code !== 1000) {
          const ui = getMatchmakingUI();
          if (ui.statusText) ui.statusText.textContent = 'Восстанавливаем соединение...';
        }
      },
      onError: () => {},
      maxReconnectAttempts: Infinity,
      baseDelay: 1000,
      maxDelay: 30000,
    });
  }

  function onMatchFound(gameId) {
    const ui = getMatchmakingUI();
    if (ui.statusText) ui.statusText.textContent = 'Соперник найден!';
    stopSearch(false);
    lifecycle.setTimeout(() => {
      window.location.href = '/match/' + gameId;
    }, 500);
  }

  function cancelSearch() {
    if (wsConnection?.isConnected()) {
      wsConnection.send({ type: 'leave' });
    }
    stopSearch();
  }

  function stopSearch(hideOverlay = true) {
    isSearching = false;
    stopTimer();

    if (wsConnection) {
      wsConnection.disconnect();
      wsConnection = null;
    }

    if (hideOverlay) {
      const ui = getMatchmakingUI();
      if (ui.overlay) ui.overlay.classList.remove('active');
    }
  }

  // Search timer display
  let timerInterval = null;
  let timerStart = 0;

  function startTimer() {
    timerStart = Date.now();
    stopTimer();
    const ui = getMatchmakingUI();
    timerInterval = lifecycle.setInterval(() => {
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
      lifecycle.clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  window.findOpponent = findOpponent;
  window.cancelMatchmaking = cancelSearch;
})();
