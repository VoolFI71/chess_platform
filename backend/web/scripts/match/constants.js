// Константы для match.js
(() => {
  window.MatchConstants = {
    DEFAULT_FEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
    PIECES: {
      K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
      k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
    },
    FILES: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    RANKS: ['8', '7', '6', '5', '4', '3', '2', '1'],
    TERMINATION_REASON_LABELS: {
      CHECKMATE: 'мат',
      RESIGNATION: 'сдача',
      TIMEOUT: 'по времени',
    },
    AUTO_CANCEL_TIMEOUT_MS: 30_000,
    WS_BASE_DELAY_MS: 1_000,
    WS_MAX_DELAY_MS: 30_000,
    WS_MAX_RETRY_ATTEMPTS: 6,
    AUTH_CLOSE_CODES: new Set([4401, 4403, 4402]),
  };
})();

