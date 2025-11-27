// Управление таймерами (auto-cancel, WS reconnect)
(() => {
  const matchStateModule = window.MatchState;
  const { state, setState, haveBothPlayersJoined } = matchStateModule;
  const { AUTO_CANCEL_TIMEOUT_MS, WS_BASE_DELAY_MS, WS_MAX_DELAY_MS, WS_MAX_RETRY_ATTEMPTS } = window.MatchConstants || {};

  function clearAutoCancelTimer(updateClockDisplays) {
    if (state.autoCancelTimerId) {
      clearInterval(state.autoCancelTimerId);
    }
    setState({ autoCancelTimerId: null, autoCancelDeadline: null }, 'clearAutoCancelTimer');
    if (updateClockDisplays) updateClockDisplays(false);
  }

  function updateAutoCancelTimerDisplay(updateClockDisplays) {
    if (!state.autoCancelDeadline) {
      if (updateClockDisplays) updateClockDisplays(false);
      return;
    }
    const remainingMs = state.autoCancelDeadline - Date.now();
    if (remainingMs <= 0) {
      clearAutoCancelTimer(updateClockDisplays);
      return;
    }
    if (updateClockDisplays) updateClockDisplays(false);
  }

  function setAutoCancelDeadline(deadlineMs, updateClockDisplays) {
    if (deadlineMs === null || deadlineMs === undefined || Number.isNaN(deadlineMs)) {
      clearAutoCancelTimer(updateClockDisplays);
      return;
    }
    if (deadlineMs <= Date.now()) {
      clearAutoCancelTimer(updateClockDisplays);
      return;
    }
    const prev = state.autoCancelDeadline;
    setState({ autoCancelDeadline: deadlineMs }, 'setAutoCancelDeadline:deadline');
    if (prev && Math.abs(prev - deadlineMs) < 500) {
      updateAutoCancelTimerDisplay(updateClockDisplays);
      return;
    }
    if (state.autoCancelTimerId) {
      clearInterval(state.autoCancelTimerId);
      setState({ autoCancelTimerId: null }, 'setAutoCancelDeadline:clearTimer');
    }
    updateAutoCancelTimerDisplay(updateClockDisplays);
    const timerId = setInterval(() => {
      if (!state.autoCancelDeadline) {
        clearAutoCancelTimer(updateClockDisplays);
        return;
      }
      updateAutoCancelTimerDisplay(updateClockDisplays);
    }, 1000);
    setState({ autoCancelTimerId: timerId }, 'setAutoCancelDeadline:setTimer');
  }

  function syncAutoCancelDeadline(detail, updateClockDisplays) {
    if (!detail || !detail.auto_cancel_deadline_ms) {
      clearAutoCancelTimer(updateClockDisplays);
      return;
    }
    let deadlineMs = detail.auto_cancel_deadline_ms;
    if (typeof deadlineMs !== 'number' || Number.isNaN(deadlineMs)) {
      clearAutoCancelTimer(updateClockDisplays);
      return;
    }
    if (deadlineMs <= Date.now()) {
      clearAutoCancelTimer(updateClockDisplays);
      return;
    }
    if (deadlineMs > Date.now() + (AUTO_CANCEL_TIMEOUT_MS || 30000)) {
      deadlineMs = Date.now() + (AUTO_CANCEL_TIMEOUT_MS || 30000);
    }
    setAutoCancelDeadline(deadlineMs, updateClockDisplays);
  }

  function clearWsReconnectTimer() {
    if (state.wsReconnectTimerId) {
      clearTimeout(state.wsReconnectTimerId);
      setState({ wsReconnectTimerId: null }, 'clearWsReconnectTimer');
    }
  }

  function resetWsRetryState() {
    clearWsReconnectTimer();
    setState({ wsRetryCount: 0 }, 'resetWsRetryState');
  }

  function scheduleWsReconnect(connectWebSocket, showToast) {
    if (!state.matchId) return;
    const attempt = state.wsRetryCount || 0;
    if (attempt >= (WS_MAX_RETRY_ATTEMPTS || 6)) {
      if (showToast) showToast('Не удалось восстановить соединение с сервером', 'error');
      return;
    }
    const delay = Math.min(WS_MAX_DELAY_MS || 30000, (WS_BASE_DELAY_MS || 1000) * 2 ** attempt);
    clearWsReconnectTimer();
    const timerId = setTimeout(() => {
      setState({ wsReconnectTimerId: null }, 'wsReconnect:timerFired');
      if (connectWebSocket) connectWebSocket(state.matchId, { isReconnect: true });
    }, delay);
    setState(
      {
        wsRetryCount: attempt + 1,
        wsReconnectTimerId: timerId,
      },
      'scheduleWsReconnect'
    );
    if (attempt === 0 && showToast) {
      showToast('Соединение потеряно, пытаемся переподключиться…', 'error');
    }
  }

  window.MatchTimers = {
    clearAutoCancelTimer,
    updateAutoCancelTimerDisplay,
    setAutoCancelDeadline,
    syncAutoCancelDeadline,
    clearWsReconnectTimer,
    resetWsRetryState,
    scheduleWsReconnect,
  };
})();

