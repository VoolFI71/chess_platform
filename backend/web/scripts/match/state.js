(() => {
  const createInitialState = () => ({
    matchId: null,
    game: null,
    gameRevision: -1,
    moves: [],
    ws: null,
    currentUser: null,
    clockTimer: null,
    clockAnchorTime: null,
    autoJoinAttempted: false,
    loginPromptShown: false,
    selectedSquare: null,
    availableTargets: new Set(),
    legalMovesByFrom: new Map(),
    pendingMove: false,
    timeoutAutoRequested: false,
    wsRetryCount: 0,
    wsReconnectTimerId: null,
    analysisCursor: null,
  });

  const state = createInitialState();
  Object.seal(state);

  const setState = (updates, context = 'setState') => {
    if (!updates || typeof updates !== 'object') {
      return state;
    }
    Object.entries(updates).forEach(([key, value]) => {
      if (!(key in state)) {
        return;
      }
      state[key] = value;
    });
    return state;
  };

  const isAssigned = (value) => value !== null && value !== undefined;

  const haveBothPlayersJoined = (game = state.game) => {
    if (!game) return false;
    const { white_id: whiteId, black_id: blackId } = game;
    const metadata = game.metadata || {};
    // Проверяем наличие игроков, включая анонимных через session_id
    const hasWhite = isAssigned(whiteId) || metadata.white_session_id;
    const hasBlack = isAssigned(blackId) || metadata.black_session_id;
    return hasWhite && hasBlack;
  };

  const getCurrentUserRole = () => {
    if (!state.game) return null;
    
    // Проверяем авторизованного пользователя
    if (state.currentUser) {
      if (state.currentUser.id === state.game.white_id) return 'white';
      if (state.currentUser.id === state.game.black_id) return 'black';
    }
    
    // Проверяем анонимного пользователя через session_id
    if (typeof window.getSessionId === 'function') {
      const sessionId = window.getSessionId();
      if (sessionId) {
        const metadata = state.game.metadata || {};
        if (sessionId === metadata.white_session_id) return 'white';
        if (sessionId === metadata.black_session_id) return 'black';
      }
    }
    
    return null;
  };

  window.MatchState = {
    state,
    setState,
    haveBothPlayersJoined,
    getCurrentUserRole,
  };
})();

