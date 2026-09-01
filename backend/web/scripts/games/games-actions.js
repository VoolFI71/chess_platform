// Games Actions - Game actions (join, resign, timeout, etc.)
(() => {
  const state = window.getGamesState();

  // Clock logic
  function getDisplayedClocks(applyRunning = true) {
    if (!state.selectedGame) return null;
    let { white_clock_ms: white, black_clock_ms: black, status, next_turn } = state.selectedGame;
    if (!applyRunning) return { white, black };
    if (status === 'ACTIVE' && typeof state.lastStateTimestamp === 'number') {
      const elapsed = Date.now() - state.lastStateTimestamp;
      if (next_turn === 'w') white = Math.max(0, white - elapsed);
      else if (next_turn === 'b') black = Math.max(0, black - elapsed);
    }
    return { white, black };
  }

  function updateClockDisplays(resetTimer = false) {
    const clocks = getDisplayedClocks(true);
    if (!clocks) return;
    const whiteClock = document.getElementById('whiteClock');
    const blackClock = document.getElementById('blackClock');
    if (whiteClock) whiteClock.textContent = window.formatClock(clocks.white);
    if (blackClock) blackClock.textContent = window.formatClock(clocks.black);

    if (resetTimer) {
      if (state.clockTimer) clearInterval(state.clockTimer);
      state.clockTimer = setInterval(() => {
        const tick = getDisplayedClocks(true);
        if (!tick) return;
        if (whiteClock) whiteClock.textContent = window.formatClock(tick.white);
        if (blackClock) blackClock.textContent = window.formatClock(tick.black);
        if (window.updateGameActionAvailability) window.updateGameActionAvailability();
      }, 1000);
    }
  }

  async function joinGame() {
    if (!state.selectedGameId) return;
    
    const isAuth = window.isAuthenticated();
    
    if (!isAuth && typeof window.getAnonymousHeaders !== 'function') {
      throw new Error('Anonymous session module is not initialized');
    }
    
    try {
      let res;
      if (isAuth) {
        res = await window.GamesApi.authedFetch(`/api/games/${state.selectedGameId}/join`, { method: 'POST' });
      } else {
        const headers = window.getAnonymousHeaders();
        
        res = await fetch(`/api/games/${state.selectedGameId}/join`, {
          method: 'POST',
          headers,
        });
      }
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      state.selectedGame = detail;
      state.moves = detail.moves || [];
      state.lastStateTimestamp = Date.now();
      if (window.ensureUsernamesForGames) await window.ensureUsernamesForGames([detail]);
      if (window.renderGameDetail) window.renderGameDetail();
      if (window.showToast) window.showToast('Вы присоединились к партии');
    } catch (err) {
      if (window.showToast) window.showToast('Не удалось присоединиться: ' + (err.message || ''), 'error');
    }
  }

  async function resignGame() {
    if (!state.selectedGameId) return;
    if (typeof window.getCurrentUserRole !== 'function') throw new Error('Games UI is not initialized');
    const role = window.getCurrentUserRole();
    if (!role) {
      if (window.showToast) window.showToast('Вы не участник этой партии', 'error');
      return;
    }
    if (!confirm('Точно сдаться?')) return;
    try {
      const isAuth = window.isAuthenticated();
      let res;
      if (isAuth) {
        res = await window.GamesApi.authedFetch(`/api/games/${state.selectedGameId}/resign`, { method: 'POST' });
      } else {
        if (typeof window.getAnonymousHeaders !== 'function') {
          throw new Error('Anonymous session module is not initialized');
        }
        const headers = window.getAnonymousHeaders();
        res = await fetch(`/api/games/${state.selectedGameId}/resign`, { method: 'POST', headers });
      }
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      state.selectedGame = detail;
      state.moves = detail.moves || [];
      state.lastStateTimestamp = Date.now();
      if (window.ensureUsernamesForGames) await window.ensureUsernamesForGames([detail]);
      if (window.renderGameDetail) window.renderGameDetail();
      if (window.loadGames) window.loadGames(false);
      if (window.showToast) window.showToast('Вы сдались.');
    } catch (err) {
      if (window.showToast) window.showToast('Не удалось сдаться: ' + (err.message || ''), 'error');
    }
  }

  async function declareTimeout() {
    if (!state.selectedGameId) return;
    if (typeof window.getCurrentUserRole !== 'function') throw new Error('Games UI is not initialized');
    const role = window.getCurrentUserRole();
    if (!role) {
      if (window.showToast) window.showToast('Только участники партии могут заявлять тайм-аут', 'error');
      return;
    }
    const loser = role === 'white' ? 'black' : 'white';
    try {
      const res = await window.GamesApi.authedFetch(`/api/games/${state.selectedGameId}/timeout`, {
        method: 'POST',
        body: JSON.stringify({ loser_color: loser }),
      });
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      state.selectedGame = detail;
      state.lastStateTimestamp = Date.now();
      if (window.renderGameDetail) window.renderGameDetail();
      if (window.showToast) window.showToast('Партия завершена по времени');
    } catch (err) {
      if (window.showToast) window.showToast('Не удалось завершить по времени: ' + (err.message || ''), 'error');
    }
  }

  function copyShareLink() {
    if (!state.selectedGame) return;
    const url = `${window.location.origin}/games?game=${state.selectedGame.id}`;
    navigator.clipboard.writeText(url).then(() => {
      if (window.showToast) window.showToast('Ссылка скопирована');
    }).catch(() => {
      if (window.showToast) window.showToast('Не удалось скопировать ссылку', 'error');
    });
  }

  // Export functions
  window.getDisplayedClocks = getDisplayedClocks;
  window.updateClockDisplays = updateClockDisplays;
  window.joinGame = joinGame;
  window.resignGame = resignGame;
  window.declareTimeout = declareTimeout;
  window.copyShareLink = copyShareLink;
})();
