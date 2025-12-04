// Утилиты для форматирования и работы с данными
(() => {
  const { DEFAULT_FEN, TERMINATION_REASON_LABELS } = window.MatchConstants || {};
  
  window.MatchUtils = {
    translateStatus(status, nextTurn) {
      if (status === 'CREATED' || status === 'ACTIVE') {
        if (nextTurn === 'w') return 'Ход белых';
        if (nextTurn === 'b') return 'Ход чёрных';
      }
      return (
        {
          PAUSED: 'Пауза',
          FINISHED: 'Завершена',
        }[status] || status || '—'
      );
    },

    statusClass(status) {
      return {
        CREATED: 'status-created',
        ACTIVE: 'status-active',
        PAUSED: 'status-paused',
        FINISHED: 'status-finished',
      }[status] || '';
    },

    describeTimeControl(tc) {
      if (!tc) return 'Без контроля';
      const minutes = Math.round((tc.initial_ms || 0) / 60000);
      const inc = Math.round((tc.increment_ms || 0) / 1000);
      return `${minutes} мин + ${inc} сек`;
    },

    formatClock(ms) {
      if (ms === null || ms === undefined) return '—';
      const clamped = Math.max(0, Math.floor(ms / 1000));
      const minutes = Math.floor(clamped / 60).toString().padStart(2, '0');
      const seconds = (clamped % 60).toString().padStart(2, '0');
      return `${minutes}:${seconds}`;
    },

    formatCountdown(totalSeconds) {
      const seconds = Math.max(0, totalSeconds);
      const minutes = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
      const secs = (seconds % 60).toString().padStart(2, '0');
      return `${minutes}:${secs}`;
    },

    normalizeUserId(value) {
      if (value === null || value === undefined) return null;
      const numeric = Number(value);
      return Number.isNaN(numeric) ? value : numeric;
    },

    normalizeFen(fen) {
      if (!fen || fen === 'startpos') return DEFAULT_FEN || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
      return fen;
    },

    getRoleLabel(role) {
      if (!role) return '—';
      return role === 'white' ? 'Белые' : 'Чёрные';
    },

    titleName(id) {
      if (!id) return '—';
      const username = window.MatchPlayerNamesUtils?.usernameFromCache(id);
      return username || `ID ${id}`;
    },

    describeWinner(game) {
      if (!game || game.status !== 'FINISHED') return '—';
      const { TERMINATION_REASON_LABELS } = window.MatchConstants || {};
      const reasonLabel = game.termination_reason
        ? (TERMINATION_REASON_LABELS?.[game.termination_reason] || game.termination_reason.toLowerCase())
        : null;
      if (game.result === '1/2-1/2') {
        return reasonLabel ? `Ничья (${reasonLabel})` : 'Ничья';
      }
      const winnerIsWhite = game.result === '1-0';
      const colorLabel = winnerIsWhite ? 'Белые' : 'Чёрные';
      const winnerId = winnerIsWhite ? game.white_id : game.black_id;
      const winnerName = window.MatchUtils.titleName(winnerId);
      const suffix = reasonLabel ? ` (${reasonLabel})` : '';
      return `${colorLabel}: ${winnerName} победили${suffix}`;
    },
  };
})();

