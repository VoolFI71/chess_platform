// Games WebSocket - WebSocket connection and handling
(() => {
  const state = window.getGamesState();
  let wsConnection = null;

  function connectWebSocket(gameId) {
    // Отключаемся от предыдущего подключения, если есть
    if (wsConnection) {
      wsConnection.disconnect();
      wsConnection = null;
    }

    updateWsIndicator('offline');
    const token = window.getAccessToken ? window.getAccessToken() : '';
    const params = {};
    if (token) {
      params.token = token;
    } else if (typeof window.getSessionId === 'function') {
      const sid = window.getSessionId();
      if (sid) params.session_id = sid;
    }
    const url = window.WebSocketUtils.createWebSocketUrl(`/ws/games/${gameId}`, params);

    wsConnection = window.WebSocketUtils.createWebSocketConnection({
      url,
      onMessage: async (message) => {
        await handleWsPayload(message);
      },
      onConnect: () => {
        updateWsIndicator('online');
        if (wsConnection) {
          state.ws = wsConnection.getWebSocket();
        }
      },
      onDisconnect: () => {
        updateWsIndicator('offline');
        state.ws = null;
      },
      onError: () => {
        updateWsIndicator('offline');
      },
      maxReconnectAttempts: 5,
      baseDelay: 1000,
      maxDelay: 30000,
    });
  }

  async function handleWsPayload(payload) {
    if (!payload) return;
    if (payload.type === 'move_rejected' || payload.type === 'error') {
      if (window.showToast) window.showToast(payload.message || 'Ход отклонён', 'error');
      return;
    }
    if (payload.type === 'state' || payload.type === 'game_finished' || payload.type === 'move_made') {
      state.selectedGame = payload.game;
      state.moves = payload.game.moves || [];
      
      let lastStateTimestamp = Date.now();
      if (payload.game.status === 'ACTIVE' && payload.game.moves && payload.game.moves.length > 0) {
        lastStateTimestamp = Date.now();
      } else if (payload.game.moves && payload.game.moves.length > 0) {
        const lastMove = payload.game.moves[payload.game.moves.length - 1];
        if (lastMove.created_at) {
          lastStateTimestamp = new Date(lastMove.created_at).getTime();
        }
      } else if (payload.game.started_at) {
        lastStateTimestamp = new Date(payload.game.started_at).getTime();
      } else if (payload.game.created_at) {
        lastStateTimestamp = new Date(payload.game.created_at).getTime();
      }
      state.lastStateTimestamp = lastStateTimestamp;
      
      if (window.ensureUsernamesForGames) await window.ensureUsernamesForGames([payload.game]);
      if (window.renderGameDetail) window.renderGameDetail();
      if (window.loadGames) window.loadGames(false);
    }
  }

  function updateWsIndicator(status) {
    const indicator = document.getElementById('wsStatus');
    if (!indicator) return;
    indicator.textContent = `WS: ${status}`;
    indicator.className = `ws-indicator ${status === 'online' ? 'ws-online' : 'ws-offline'}`;
  }

  // Export functions
  window.connectWebSocket = connectWebSocket;
})();
