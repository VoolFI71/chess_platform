// Управление часами и таймерами
(() => {
  const matchStateModule = window.MatchState;
  const { state, setState, haveBothPlayersJoined } = matchStateModule;
  const { formatClock } = window.MatchUtils || {};
  const { AUTO_CANCEL_TIMEOUT_MS } = window.MatchConstants || {};

  function getDisplayedClocks(applyRunning = true) {
    if (!state.game) return null;
    let { white_clock_ms: white, black_clock_ms: black, status, next_turn, move_count } = state.game;
    if (!applyRunning) return { white, black };
    
    // ВАЖНО: Время не должно тикать до первого хода
    const shouldTick = status === 'ACTIVE' && move_count > 0;
    if (!shouldTick) {
      if (window.__DEBUG_CLOCKS__) {
        console.log('[clock] getDisplayedClocks: NOT TICKING', {
          status,
          move_count,
          shouldTick: false,
          white,
          black,
        });
      }
      return { white, black };
    }

    const anchor = typeof state.clockAnchorTime === 'number' ? state.clockAnchorTime : Date.now();
    const elapsed = Math.max(0, Date.now() - anchor);

    if (next_turn === 'w') {
      white = Math.max(0, white - elapsed);
    } else if (next_turn === 'b') {
      black = Math.max(0, black - elapsed);
    }
    if (window.__DEBUG_CLOCKS__) {
      const now = Date.now();
      console.log('[clock] getDisplayedClocks: TICKING', {
        mode: applyRunning ? 'running' : 'static',
        status,
        move_count,
        next_turn,
        clockAnchorTime: anchor,
        now,
        elapsed_ms: elapsed,
        white_before: white_clock_ms,
        black_before: black_clock_ms,
        white_after: white,
        black_after: black,
        white_delta: white_clock_ms - white,
        black_delta: black_clock_ms - black,
      });
    }
    return { white, black };
  }

  function getAutoCancelCountdownSeconds() {
    if (!state.autoCancelDeadline || !state.game) return null;
    const waitingForFirstMove =
      state.game.status === 'CREATED' && state.game.move_count === 0 && haveBothPlayersJoined();
    if (!waitingForFirstMove) return null;
    const remainingMs = state.autoCancelDeadline - Date.now();
    if (remainingMs <= 0) return 0;
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  function updateClockDisplays(resetTimer = false, getPanelRoles, maybeAutoDeclareTimeout) {
    const clocks = getDisplayedClocks(true);
    if (!clocks) return;
    
    const autoCountdownSeconds = getAutoCancelCountdownSeconds();
    const countdownTargetRole =
      autoCountdownSeconds !== null && state.game ? (state.game.next_turn === 'w' ? 'white' : 'black') : null;
    const formatWithCountdown = (role, baseMs) => {
      if (countdownTargetRole && countdownTargetRole === role && autoCountdownSeconds !== null) {
        return formatClock ? formatClock(autoCountdownSeconds * 1000) : `${Math.floor(autoCountdownSeconds / 60)}:${String(autoCountdownSeconds % 60).padStart(2, '0')}`;
      }
      return formatClock ? formatClock(baseMs) : `${Math.floor(baseMs / 60000)}:${String(Math.floor((baseMs % 60000) / 1000)).padStart(2, '0')}`;
    };

    const whiteEl = document.getElementById('whiteClock');
    const blackEl = document.getElementById('blackClock');
    if (whiteEl) whiteEl.textContent = formatWithCountdown('white', clocks.white);
    if (blackEl) blackEl.textContent = formatWithCountdown('black', clocks.black);
    const topClockEl = document.getElementById('topClock');
    const bottomClockEl = document.getElementById('bottomClock');
    if (topClockEl || bottomClockEl) {
      const { topRole, bottomRole } = getPanelRoles();
      if (topClockEl) {
        const topValue = topRole === 'white' ? clocks.white : clocks.black;
        topClockEl.textContent = formatWithCountdown(topRole, topValue);
      }
      if (bottomClockEl) {
        const bottomValue = bottomRole === 'white' ? clocks.white : clocks.black;
        bottomClockEl.textContent = formatWithCountdown(bottomRole, bottomValue);
      }
    }
    if (maybeAutoDeclareTimeout) maybeAutoDeclareTimeout(clocks);

    if (resetTimer) {
      if (state.clockTimer) clearInterval(state.clockTimer);
      const timerId = setInterval(() => {
        const tick = getDisplayedClocks(true);
        if (!tick) return;
        const tickCountdownSeconds = getAutoCancelCountdownSeconds();
        const tickCountdownTarget =
          tickCountdownSeconds !== null && state.game ? (state.game.next_turn === 'w' ? 'white' : 'black') : null;
        const formatTick = (role, baseMs) => {
          if (tickCountdownTarget && tickCountdownTarget === role && tickCountdownSeconds !== null) {
            return formatClock ? formatClock(tickCountdownSeconds * 1000) : `${Math.floor(tickCountdownSeconds / 60)}:${String(tickCountdownSeconds % 60).padStart(2, '0')}`;
          }
          return formatClock ? formatClock(baseMs) : `${Math.floor(baseMs / 60000)}:${String(Math.floor((baseMs % 60000) / 1000)).padStart(2, '0')}`;
        };
        if (whiteEl) whiteEl.textContent = formatTick('white', tick.white);
        if (blackEl) blackEl.textContent = formatTick('black', tick.black);
        if (topClockEl || bottomClockEl) {
          const { topRole, bottomRole } = getPanelRoles();
          if (topClockEl) {
            const topValue = topRole === 'white' ? tick.white : tick.black;
            topClockEl.textContent = formatTick(topRole, topValue);
          }
          if (bottomClockEl) {
            const bottomValue = bottomRole === 'white' ? tick.white : tick.black;
            bottomClockEl.textContent = formatTick(bottomRole, bottomValue);
          }
        }
        if (maybeAutoDeclareTimeout) maybeAutoDeclareTimeout(tick);
      }, 1000);
      setState({ clockTimer: timerId }, 'updateClockDisplays:setInterval');
    }
  }

  window.MatchClocks = {
    getDisplayedClocks,
    getAutoCancelCountdownSeconds,
    updateClockDisplays,
  };
})();

