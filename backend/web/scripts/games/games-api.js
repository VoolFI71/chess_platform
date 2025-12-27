// Games API - API requests and authentication
(() => {
  const state = window.getGamesState();

  // Build URL helper
  const buildUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return path;
  };

  // Auth helpers
  const originalGetAccessToken = window.getAccessToken;
  const getAccessToken = () => {
    if (originalGetAccessToken && typeof originalGetAccessToken === 'function') {
      return originalGetAccessToken();
    }
    try {
      return localStorage.getItem('access_token') || '';
    } catch {
      return '';
    }
  };
  
  const getRefreshToken = () => {
    try {
      return localStorage.getItem('refresh_token') || '';
    } catch {
      return '';
    }
  };
  
  const originalSetTokens = window.setTokens;
  const originalClearTokens = window.clearTokens;
  
  const setTokens = (access, refresh) => {
    if (originalSetTokens && typeof originalSetTokens === 'function') {
      originalSetTokens(access, refresh);
      return;
    }
    try {
      if (access) localStorage.setItem('access_token', access);
      if (refresh) localStorage.setItem('refresh_token', refresh);
    } catch {}
  };
  
  const clearTokens = () => {
    if (originalClearTokens && typeof originalClearTokens === 'function') {
      originalClearTokens();
      return;
    }
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } catch {}
  };

  const isAuthenticated = () => {
    const token = getAccessToken();
    return !!token && token.trim().length > 0;
  };

  const requireAuth = (redirectTo = '/login') => {
    if (!isAuthenticated()) {
      if (typeof window.showToast === 'function') {
        window.showToast('Войдите в аккаунт, чтобы создать партию', 'error');
      } else {
        alert('Войдите в аккаунт, чтобы создать партию');
      }
      window.location.href = redirectTo;
      return false;
    }
    return true;
  };

  // Используем единую apiFetch из auth.js с кастомным buildUrl
  async function authedFetch(path, options = {}) {
    if (window.apiFetch && typeof window.apiFetch === 'function') {
      return window.apiFetch(path, { ...options, buildUrl });
    }
    // Fallback если apiFetch не загружен (не должен происходить в нормальных условиях)
    console.warn('apiFetch not available, using direct fetch');
    const headers = new Headers(options.headers || {});
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(buildUrl(path), { ...options, headers });
  }

  const getSelectedGameType = () => {
    const selected = document.querySelector('input[name="gameType"]:checked');
    if (selected) {
      return selected.value === 'rated';
    }
    const isAuth = typeof window.isAuthenticated === 'function' ? window.isAuthenticated() : (getAccessToken() !== null && getAccessToken() !== '');
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

    const isAuth = typeof window.isAuthenticated === 'function' ? window.isAuthenticated() : (getAccessToken() !== null && getAccessToken() !== '');
    
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
        
        const url = buildUrl('/api/games/');
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
        
        res = await fetch(url, {
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
      state.currentUser = res && res.ok ? await res.json() : null;
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
      const url = buildUrl('/api/games/');
      const res = await authedFetch(url);
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
  window.authedFetch = authedFetch;
  window.isAuthenticated = isAuthenticated;
  window.getAccessToken = getAccessToken;
  window.requireAuth = requireAuth;
  window.createGame = createGame;
  window.getSelectedGameType = getSelectedGameType;
  window.fetchCurrentUser = fetchCurrentUser;
  window.loadGames = loadGames;
  window.segmentGames = segmentGames;
  window.clearTokens = clearTokens;
})();
