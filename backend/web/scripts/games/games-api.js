// Games API - API requests and authentication
(() => {
  const state = window.getGamesState();
  const http = window.App?.Http;
  if (!http) throw new Error('HTTP API is not initialized');

  const isAuthenticated = () => {
    if (typeof window.App?.Auth?.isAuthenticated !== 'function') {
      throw new Error('Auth API is not initialized');
    }
    return window.App.Auth.isAuthenticated();
  };

  const requireAuth = (redirectTo = '/login') => {
    if (!isAuthenticated()) {
      if (typeof window.showToast === 'function') {
        window.showToast('Войдите в аккаунт, чтобы создать партию', 'error');
      } else {
        throw new Error('Войдите в аккаунт, чтобы создать партию');
      }
      window.location.href = redirectTo;
      return false;
    }
    return true;
  };

  async function authedFetch(path, options = {}) {
    return http.apiFetch(path, options);
  }

  const getSelectedGameType = () => {
    const selected = document.querySelector('input[name="gameType"]:checked');
    if (selected) {
      return selected.value === 'rated';
    }
    const isAuth = isAuthenticated();
    return isAuth;
  };

  const createGame = async (options = {}) => {
    const {
      minutes = 5,
      increment = 0,
      isRated = false,
      creatorColor = 'white',
      initialFen = 'startpos',
      onSuccess = null,
      onError = null,
    } = options;

    const isAuth = isAuthenticated();
    
    if (!isAuth && isRated) {
      const errorMessage = 'Для создания рейтинговой партии необходимо войти в аккаунт';
      if (onError && typeof onError === 'function') {
        onError(new Error(errorMessage), errorMessage);
      } else if (typeof window.showToast === 'function') {
        window.showToast(errorMessage, 'error');
      }
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
      return null;
    }
    
    let finalCreatorColor = creatorColor;
    if (creatorColor === 'random' || !creatorColor || (creatorColor !== 'white' && creatorColor !== 'black')) {
      finalCreatorColor = Math.random() < 0.5 ? 'white' : 'black';
      }
    
    const payload = {
      initial_fen: initialFen === 'startpos' ? 'startpos' : initialFen,
      creator_color: finalCreatorColor,
      time_control: {
        initial_ms: Math.max(1, minutes) * 60000,
        increment_ms: Math.max(0, increment) * 1000,
        type: 'STANDARD',
      },
      metadata: {
        variant: 'standard',
        rated: isRated,
      },
    };

    try {
      let res;
      if (isAuth) {
        res = await authedFetch('/api/games/', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        if (typeof window.getAnonymousHeaders !== 'function') {
          const errorMessage = 'Ошибка: не удалось создать сессию для анонимной игры';
          if (onError && typeof onError === 'function') {
            onError(new Error(errorMessage), errorMessage);
          } else if (typeof window.showToast === 'function') {
            window.showToast(errorMessage, 'error');
          }
          return null;
        }
        
        if (typeof window.getOrCreateSessionId === 'function') {
          window.getOrCreateSessionId();
        }
        
        const sessionHeaders = window.getAnonymousHeaders();
        const headers = {
          ...sessionHeaders,
          'Content-Type': 'application/json'
        };
        
        const sessionId = sessionHeaders['X-Session-ID'];
        
        if (!sessionId) {
          const errorMessage = 'Ошибка: не удалось получить session_id';
          if (onError && typeof onError === 'function') {
            onError(new Error(errorMessage), errorMessage);
          } else if (typeof window.showToast === 'function') {
            window.showToast(errorMessage, 'error');
          }
          return null;
        }
        
        res = await fetch('/api/games/', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        let errorText = 'Не удалось создать партию';
        try {
          const errorData = await res.json();
          errorText = errorData.detail || errorData.message || errorText;
        } catch {
          const text = await res.text();
          errorText = text || errorText;
        }
        throw new Error(errorText);
      }

      const game = await res.json();
      
      if (onSuccess && typeof onSuccess === 'function') {
        onSuccess(game);
      }
      
      return game;
    } catch (err) {
      const errorMessage = err.message || 'Не удалось создать партию';
      
      if (onError && typeof onError === 'function') {
        onError(err, errorMessage);
      } else if (typeof window.showToast === 'function') {
        window.showToast(errorMessage, 'error');
      }
      
      return null;
    }
  };

  async function fetchCurrentUser() {
    try {
      const res = await authedFetch('/api/auth/me');
      state.currentUser = res.ok ? await res.json() : null;
    } catch {
      state.currentUser = null;
    }
    if (window.updateAuthPanel) window.updateAuthPanel();
    if (window.toggleCreateForm) window.toggleCreateForm();
  }

  async function loadGames(showSpinner = false) {
    if (showSpinner) {
      const waiting = document.getElementById('waitingList');
      const live = document.getElementById('liveList');
      if (waiting) waiting.innerHTML = '<div class="empty-state">Загружаем партии...</div>';
      if (live) live.innerHTML = '<div class="empty-state">Загружаем матчи...</div>';
    }
    try {
      const res = await authedFetch('/api/games/');
      if (!res.ok) throw new Error(await res.text());
      state.games = await res.json();
      if (window.ensureUsernamesForGames) await window.ensureUsernamesForGames(state.games);
      if (window.segmentGames) window.segmentGames();
      if (window.renderCollections) window.renderCollections();
      if (window.updateHeroStats) window.updateHeroStats();
      if (state.pendingGameId) {
        if (window.selectGame) window.selectGame(state.pendingGameId);
        state.pendingGameId = null;
      }
    } catch (err) {
      if (window.showToast) window.showToast('Не удалось загрузить список партий', 'error');
    }
  }

  const segmentGames = () => {
    state.waitingGames = state.games.filter((g) => g.status === 'CREATED');
    state.liveGames = state.games.filter((g) => g.status === 'ACTIVE');
    state.finishedGames = state.games.filter((g) => g.status === 'FINISHED');
  };

  // Export functions
  window.GamesApi = { authedFetch };
  window.isAuthenticated = isAuthenticated;
  window.requireAuth = requireAuth;
  window.createGame = createGame;
  window.getSelectedGameType = getSelectedGameType;
  window.fetchCurrentUser = fetchCurrentUser;
  window.loadGames = loadGames;
  window.segmentGames = segmentGames;
})();
