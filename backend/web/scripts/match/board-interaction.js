(() => {
  'use strict';

  function create(config) {
    if (!config || !config.state || typeof config.setState !== 'function' ||
        typeof config.getCurrentFen !== 'function' || typeof config.getCurrentUserRole !== 'function' ||
        typeof config.haveBothPlayersJoined !== 'function' || typeof config.isAnalysisMode !== 'function' ||
        typeof config.showToast !== 'function' || typeof config.attemptMove !== 'function' ||
        typeof config.isPieceOwnedByRole !== 'function' || !config.boardCore || !config.moveUtils) {
      throw new Error('Match board interaction requires a complete configuration');
    }

    const {
      state,
      setState,
      getCurrentFen,
      getCurrentUserRole,
      haveBothPlayersJoined,
      isAnalysisMode,
      showToast,
      attemptMove,
      isPieceOwnedByRole,
      boardCore,
      moveUtils,
    } = config;

    if (typeof moveUtils.updateLegalMovesForState !== 'function' ||
        typeof moveUtils.getPieceAtSquare !== 'function' ||
        typeof boardCore.resetSelectionIncremental !== 'function' ||
        typeof boardCore.updateSelection !== 'function') {
      throw new Error('Chess modules are not initialized');
    }

    function resetSelection() {
      boardCore.resetSelectionIncremental({
        state,
        setState,
        getFen: getCurrentFen,
        utils: moveUtils,
      });
    }

    function formatMoves(legalMovesByFrom) {
      if (!(legalMovesByFrom instanceof Map)) {
        throw new Error('Legal move generator returned invalid data');
      }

      const formattedMoves = new Map();
      legalMovesByFrom.forEach((uciMoves, fromSquare) => {
        if (!Array.isArray(uciMoves)) {
          throw new Error('Legal move generator returned invalid moves');
        }

        const entries = uciMoves.map((uci) => {
          if (typeof uci !== 'string' || uci.length < 4) {
            throw new Error('Legal move has invalid UCI format');
          }
          return {
            from: fromSquare,
            to: uci.slice(2, 4),
            base: uci.slice(0, 4),
            promotion: uci.length > 4 ? uci.slice(4) : null,
          };
        });

        if (entries.length > 0) {
          formattedMoves.set(fromSquare, entries);
        }
      });
      return formattedMoves;
    }

    function updateLegalMoves() {
      moveUtils.updateLegalMovesForState({
        getFen: () => state.game ? state.game.current_pos : null,
        getPlayerColor: getCurrentUserRole,
        canGenerateMoves: () => {
          if (!state.game) return false;
          if (state.game.status !== 'ACTIVE' && !haveBothPlayersJoined()) return false;

          const role = getCurrentUserRole();
          if (!role) return false;
          const expectedTurn = state.game.next_turn === 'w' ? 'white' : 'black';
          return role === expectedTurn;
        },
        onReset: resetSelection,
        state,
        setState,
        formatMoves,
      });
    }

    function executeMove(fromSquare, toSquare) {
      const moves = state.legalMovesByFrom.get(fromSquare);
      if (!Array.isArray(moves) || moves.length === 0) {
        throw new Error('Selected square has no legal moves');
      }

      const options = moves.filter((entry) => entry.to === toSquare);
      if (options.length === 0) {
        throw new Error('Selected target is not a legal move');
      }

      let chosen = options[0];
      if (options.length > 1) {
        const promotion = prompt('Выберите фигуру для промоции (q, r, b, n)', 'q');
        if (!promotion) return;

        chosen = options.find((entry) => entry.promotion === promotion.toLowerCase());
        if (!chosen) {
          showToast('Неверная фигура промоции', 'error');
          return;
        }
      }

      if (attemptMove(chosen.base, chosen.promotion)) {
        resetSelection();
      }
    }

    function handleSquareClick(squareName) {
      if (!state.game) return;
      if (isAnalysisMode()) {
        showToast('Вы просматриваете предыдущий ход. Выберите последний ход, чтобы продолжить партию.', 'info');
        return;
      }

      const bothPlayersJoined = haveBothPlayersJoined();
      if (state.game.status !== 'ACTIVE' && !bothPlayersJoined) {
        if (state.game.status === 'CREATED') {
          showToast('Дождитесь присоединения соперника, чтобы начать игру', 'info');
        }
        return;
      }
      if (state.pendingMove) return;

      const role = getCurrentUserRole();
      if (!role) return;
      const expectedTurn = state.game.next_turn === 'w' ? 'white' : 'black';
      if (role !== expectedTurn) return;

      if (typeof squareName !== 'string' || !/^[a-h][1-8]$/i.test(squareName)) {
        throw new Error('Invalid chess square');
      }
      const square = squareName.toLowerCase();

      if (state.selectedSquare && state.availableTargets.has(square)) {
        executeMove(state.selectedSquare, square);
        return;
      }
      if (state.selectedSquare === square) {
        resetSelection();
        return;
      }

      const moves = state.legalMovesByFrom.get(square);
      if (!Array.isArray(moves) || moves.length === 0) {
        resetSelection();
        return;
      }

      const piece = moveUtils.getPieceAtSquare(state.game.current_pos, square);
      if (!isPieceOwnedByRole(piece, role)) {
        resetSelection();
        return;
      }

      boardCore.updateSelection({
        state,
        setState,
        square,
        targets: new Set(moves.map((entry) => entry.to)),
        getFen: getCurrentFen,
        utils: moveUtils,
      });
    }

    return {
      resetSelection,
      updateLegalMoves,
      handleSquareClick,
    };
  }

  window.MatchBoardInteraction = { create };
})();
