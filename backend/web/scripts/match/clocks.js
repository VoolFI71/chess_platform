// Управление часами и таймерами
(() => {
  const matchStateModule = window.MatchState;
  const { state, setState, haveBothPlayersJoined } = matchStateModule;
  const { formatClock } = window.MatchUtils || {};

  function getDisplayedClocks(applyRunning = true) {
    if (!state.game) return null;
    let { white_clock_ms: white_past, black_clock_ms: black_past, status, next_turn, time_control, white_finish_ms, black_finish_ms } = state.game;
    
    // Получаем finish_time из time_control или из поля white_finish_ms/black_finish_ms
    let white_finish = white_finish_ms || 0;
    let black_finish = black_finish_ms || 0;
    if (white_finish === 0 && time_control) {
      white_finish = time_control.white_finish_ms || time_control.initial_ms || 0;
    }
    if (black_finish === 0 && time_control) {
      black_finish = time_control.black_finish_ms || time_control.initial_ms || 0;
    }
    
    // Вычисляем остаток времени: finish_time - past_time
    // past_time - прошедшее время в миллисекундах (начинается с 0)
    // finish_time - время окончания в миллисекундах (например, 180000 мс = 3 минуты)
    let white = white_finish > 0 ? Math.max(0, white_finish - white_past) : 0;
    let black = black_finish > 0 ? Math.max(0, black_finish - black_past) : 0;
    
    if (!applyRunning) return { white, black };
    
    // Время тикает когда игра активна (оба игрока присоединились)
    const shouldTick = status === 'ACTIVE';
    if (!shouldTick) {
      return { white, black };
    }

    // Вычитаем прошедшее время с момента последнего хода из остатка текущего игрока
    const anchor = typeof state.clockAnchorTime === 'number' ? state.clockAnchorTime : Date.now();
    const now = Date.now();
    const elapsed = Math.max(0, now - anchor);

    if (next_turn === 'w') {
      white = Math.max(0, white - elapsed);
    } else if (next_turn === 'b') {
      black = Math.max(0, black - elapsed);
    }
    
    return { white, black };
  }

  function updateClockDisplays(resetTimer = false, getPanelRoles, maybeAutoDeclareTimeout) {
    const clocks = getDisplayedClocks(true);
    if (!clocks) return;
    
    const formatTime = (baseMs) => {
      return formatClock ? formatClock(baseMs) : `${Math.floor(baseMs / 60000)}:${String(Math.floor((baseMs % 60000) / 1000)).padStart(2, '0')}`;
    };

    const whiteEl = document.getElementById('whiteClock');
    const blackEl = document.getElementById('blackClock');
    if (whiteEl) whiteEl.textContent = formatTime(clocks.white);
    if (blackEl) blackEl.textContent = formatTime(clocks.black);
    const topClockEl = document.getElementById('topClock');
    const bottomClockEl = document.getElementById('bottomClock');
    const topClockElMobile = document.getElementById('topClockMobile');
    const bottomClockElMobile = document.getElementById('bottomClockMobile');
    
    if (topClockEl || bottomClockEl || topClockElMobile || bottomClockElMobile) {
      const { topRole, bottomRole } = getPanelRoles();
        const topValue = topRole === 'white' ? clocks.white : clocks.black;
        const bottomValue = bottomRole === 'white' ? clocks.white : clocks.black;
      
      if (topClockEl) topClockEl.textContent = formatTime(topValue);
      if (bottomClockEl) bottomClockEl.textContent = formatTime(bottomValue);
      if (topClockElMobile) topClockElMobile.textContent = formatTime(topValue);
      if (bottomClockElMobile) bottomClockElMobile.textContent = formatTime(bottomValue);
    }
    if (maybeAutoDeclareTimeout) maybeAutoDeclareTimeout(clocks);

    if (resetTimer) {
      if (state.clockTimer) clearInterval(state.clockTimer);
      const timerId = setInterval(() => {
        const tick = getDisplayedClocks(true);
        if (!tick) return;
        if (whiteEl) whiteEl.textContent = formatTime(tick.white);
        if (blackEl) blackEl.textContent = formatTime(tick.black);
        if (topClockEl || bottomClockEl || topClockElMobile || bottomClockElMobile) {
          const { topRole, bottomRole } = getPanelRoles();
            const topValue = topRole === 'white' ? tick.white : tick.black;
            const bottomValue = bottomRole === 'white' ? tick.white : tick.black;
          
          if (topClockEl) topClockEl.textContent = formatTime(topValue);
          if (bottomClockEl) bottomClockEl.textContent = formatTime(bottomValue);
          if (topClockElMobile) topClockElMobile.textContent = formatTime(topValue);
          if (bottomClockElMobile) bottomClockElMobile.textContent = formatTime(bottomValue);
        }
        if (maybeAutoDeclareTimeout) maybeAutoDeclareTimeout(tick);
      }, 1000);
      setState({ clockTimer: timerId }, 'updateClockDisplays:setInterval');
    }
  }

  window.MatchClocks = {
    getDisplayedClocks,
    updateClockDisplays,
  };
})();

