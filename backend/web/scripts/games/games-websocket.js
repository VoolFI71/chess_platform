// Games WebSocket - WebSocket connection and handling
(() => {
  const wsApi = window.App?.WS;
  if (!wsApi) throw new Error('WebSocket API is not initialized');

  const state = window.getGamesState();
  let wsConnection = null;

  function connectWebSocket(gameId) {
    // Отключаемся от предыдущего подключения, если есть
    if (wsConnection) {
      wsConnection.disconnect();
      wsConnection = null;
    }

    updateWsIndicator('offline');
		const params = {};
		if (typeof window.getSessionId === 'function') {
			const sid = window.getSessionId();
			if (sid) params.session_id = sid;
    }
    const url = wsApi.createWebSocketUrl(`/ws/games/${gameId}`, params);

    wsConnection = wsApi.createWebSocketConnection({
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
      maxReconnectAttempts: Infinity,
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
      const incomingGame = payload.game;
      if (!incomingGame) return;
      const revision = Number.isInteger(payload.revision) ? payload.revision : incomingGame.move_count;
      if (
        state.selectedGameId === incomingGame.id &&
        Number.isInteger(revision) &&
        Number.isInteger(state.selectedGame?.move_count) &&
        revision < state.selectedGame.move_count
      ) {
        return;
      }

      const incomingMoves = payload.type === 'state'
        ? (incomingGame.moves || [])
        : payload.move
          ? [payload.move]
          : [];
      const shouldMerge = payload.type !== 'state' && state.moves?.length;
      const moves = shouldMerge
        ? mergeMoves(state.moves, incomingMoves)
        : incomingMoves;
      state.selectedGame = { ...incomingGame, moves };
      state.moves = moves;

      const gameIndex = state.games.findIndex((game) => game.id === incomingGame.id);
      if (gameIndex >= 0) {
        state.games[gameIndex] = { ...state.games[gameIndex], ...incomingGame };
      }
      
      let lastStateTimestamp = Date.now();
      if (state.selectedGame.status === 'ACTIVE' && moves.length > 0) {
        lastStateTimestamp = Date.now();
      } else if (moves.length > 0) {
        const lastMove = moves[moves.length - 1];
        if (lastMove.created_at) {
          lastStateTimestamp = new Date(lastMove.created_at).getTime();
        }
      } else if (state.selectedGame.started_at) {
        lastStateTimestamp = new Date(state.selectedGame.started_at).getTime();
      } else if (state.selectedGame.created_at) {
        lastStateTimestamp = new Date(state.selectedGame.created_at).getTime();
      }
      state.lastStateTimestamp = lastStateTimestamp;
      
      if (window.ensureUsernamesForGames) await window.ensureUsernamesForGames([state.selectedGame]);
      if (window.renderGameDetail) window.renderGameDetail();
      if (window.segmentGames) window.segmentGames();
      if (window.renderCollections) window.renderCollections();
      if (window.updateHeroStats) window.updateHeroStats();
    }
  }

  function mergeMoves(previousMoves = [], incomingMoves = []) {
    const byIndex = new Map();
    [...previousMoves, ...incomingMoves].forEach((move) => {
      if (move && Number.isInteger(move.move_index)) {
        byIndex.set(move.move_index, move);
      }
    });
    return [...byIndex.values()].sort((a, b) => a.move_index - b.move_index);
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
