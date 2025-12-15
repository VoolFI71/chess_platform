// Games WebSocket - WebSocket connection and handling
(() => {
  const state = window.getGamesState();

  function connectWebSocket(gameId) {
    if (state.ws) {
      state.ws.onopen = null;
      state.ws.onclose = null;
      state.ws.onmessage = null;
      state.ws.close();
      state.ws = null;
    }
    updateWsIndicator('offline');
    const token = window.getAccessToken ? window.getAccessToken() : '';
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws/games/${gameId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const ws = new WebSocket(url);
    state.ws = ws;

    ws.onopen = () => updateWsIndicator('online');
    ws.onclose = () => updateWsIndicator('offline');
    ws.onerror = () => updateWsIndicator('offline');
    ws.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        await handleWsPayload(payload);
      } catch (err) {
        console.error('WS parse error', err);
      }
    };
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
