// Games Utils - Utility functions
(() => {
  const state = window.getGamesState();
  const playerUsernames = window.GamesPlayerUsernames;
  const pendingUsernameRequests = window.GamesPendingUsernameRequests;

  // Build URL helper
  const buildUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return path;
  };

  function showToast(message, type = 'info') {
    const toast = document.getElementById('gamesToast');
    if (toast) {
      toast.textContent = message;
      toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
      setTimeout(() => {
        toast.className = 'toast';
      }, 4000);
    } else {
      console.log(message);
      if (type === 'error') {
        alert(message);
      }
    }
  }

  const formatClock = (ms) => {
    if (ms === null || ms === undefined) return '—';
    const clamped = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(clamped / 60).toString().padStart(2, '0');
    const seconds = (clamped % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const translateStatus = (status) => ({
    CREATED: 'Ожидает соперника',
    ACTIVE: 'Идёт партия',
    PAUSED: 'Пауза',
    FINISHED: 'Завершена',
  }[status] || status || '—');

  const statusClass = (status) => ({
    CREATED: 'status-created',
    ACTIVE: 'status-active',
    PAUSED: 'status-paused',
    FINISHED: 'status-finished',
  }[status] || '');

  const normalizeUserId = (value) => {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    return Number.isNaN(numeric) ? value : numeric;
  };

  const usernameFromCache = (id) => {
    const key = normalizeUserId(id);
    if (key === null) return null;
    return playerUsernames.has(key) ? playerUsernames.get(key) : null;
  };

  const storeUsername = (id, username) => {
    const key = normalizeUserId(id);
    if (key === null) return;
    if (typeof username === 'string') {
      const trimmed = username.trim();
      playerUsernames.set(key, trimmed.length ? trimmed : null);
    } else {
      playerUsernames.set(key, null);
    }
  };

  async function fetchUsername(id) {
    const key = normalizeUserId(id);
    if (key === null) return null;
    if (playerUsernames.has(key)) return playerUsernames.get(key);
    if (pendingUsernameRequests.has(key)) return pendingUsernameRequests.get(key);

    const request = (async () => {
      try {
        const res = await fetch(buildUrl(`/api/users/${encodeURIComponent(key)}`));
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        const username =
          (data && (data.username || data.display_name || data.name || data.handle || data.login)) ||
          null;
        storeUsername(key, username);
        return usernameFromCache(key);
      } catch {
        storeUsername(key, null);
        return null;
      } finally {
        pendingUsernameRequests.delete(key);
      }
    })();

    pendingUsernameRequests.set(key, request);
    return request;
  }

  async function ensureUsernamesForGames(games) {
    if (!Array.isArray(games)) return;
    const fetchIds = [];
    games.forEach((game) => {
      if (!game) return;
      [game.white_id, game.black_id].forEach((id) => {
        const key = normalizeUserId(id);
        if (key === null) return;
        if (!playerUsernames.has(key) && !pendingUsernameRequests.has(key)) {
          fetchIds.push(key);
        }
      });
    });
    if (!fetchIds.length) return;
    await Promise.all(fetchIds.map((id) => fetchUsername(id)));
  }

  const getPlayerName = (game, role) => {
    if (!game) return '—';
    const metadata = game.metadata || {};
    const id = role === 'white' ? game.white_id : game.black_id;
    const sessionId = role === 'white' ? metadata.white_session_id : metadata.black_session_id;
    
    if (id !== null && id !== undefined) {
      if (state.currentUser && state.currentUser.id === id) {
        return state.currentUser.username ? `Вы (${state.currentUser.username})` : 'Вы';
      }
      const cached = usernameFromCache(id);
      if (cached) return cached;
      return `ID ${id}`;
    }
    
    if (sessionId) {
      if (typeof window.getSessionId === 'function') {
        const currentSessionId = window.getSessionId();
        if (currentSessionId === sessionId) {
          return 'Вы (Гость)';
        }
      }
      return 'Гость';
    }
    
    return '—';
  };

  const labelPlayer = (id) => {
    if (!id) return '—';
    if (state.currentUser && state.currentUser.id === id) {
      return state.currentUser.username ? `Вы (${state.currentUser.username})` : 'Вы';
    }
    const cached = usernameFromCache(id);
    if (cached) return cached;
    return `ID ${id}`;
  };

  const getAvailableSeat = (game) => {
    if (!game) return null;
    if (game.white_id == null) return 'white';
    if (game.black_id == null) return 'black';
    return null;
  };

  const describeTimeControl = (tc) => {
    if (!tc) return 'Без контроля';
    const minutes = Math.round((tc.initial_ms || 0) / 60000);
    const inc = Math.round((tc.increment_ms || 0) / 1000);
    return `${minutes} мин + ${inc} сек`;
  };

  // Export functions
  window.showToast = showToast;
  window.formatClock = formatClock;
  window.translateStatus = translateStatus;
  window.statusClass = statusClass;
  window.getPlayerName = getPlayerName;
  window.labelPlayer = labelPlayer;
  window.getAvailableSeat = getAvailableSeat;
  window.describeTimeControl = describeTimeControl;
  window.ensureUsernamesForGames = ensureUsernamesForGames;
})();
