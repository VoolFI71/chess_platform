(() => {
  'use strict';

  const moveUtils = window.ChessMoveUtils;
  const boardCore = window.ChessBoardCore;

  if (!moveUtils || typeof moveUtils.generateLegalMoves !== 'function') {
    throw new Error('ChessMoveUtils is not initialized');
  }
  if (!boardCore || typeof boardCore.updateSelection !== 'function' ||
      typeof boardCore.resetSelectionIncremental !== 'function') {
    throw new Error('ChessBoardCore is not initialized');
  }

  function getMoveUci(move) {
    if (typeof move === 'string') {
      return move;
    }
    if (move && typeof move.uci === 'string') {
      return move.uci;
    }
    throw new Error('Legal move has invalid UCI format');
  }

  function createLegalMoveCache(config) {
    if (!config || !config.state || typeof config.getFen !== 'function' ||
        typeof config.getPlayerColor !== 'function' ||
        !(config.state.positionCache instanceof Map)) {
      throw new Error('Chess legal move cache requires a complete configuration');
    }

    const { state, getFen, getPlayerColor } = config;

    return function getLegalMovesByFrom() {
      const fen = getFen();
      const color = getPlayerColor();
      if (typeof fen !== 'string' || !fen || (color !== 'white' && color !== 'black')) {
        throw new Error('Chess position or player color is not initialized');
      }

      const cacheKey = `${fen}|${color}|legal`;
      const cachedResult = state.positionCache.get(cacheKey);
      if (cachedResult) {
        if (!(cachedResult.legalMovesByFrom instanceof Map)) {
          throw new Error('Legal move cache contains invalid data');
        }
        return cachedResult.legalMovesByFrom;
      }

      const result = moveUtils.generateLegalMoves(fen, color);
      if (!result || !(result.legalMovesByFrom instanceof Map)) {
        throw new Error('Legal move generator returned invalid data');
      }

      if (state.positionCache.size >= 50) {
        const oldestKey = state.positionCache.keys().next().value;
        state.positionCache.delete(oldestKey);
      }
      state.positionCache.set(cacheKey, result);
      return result.legalMovesByFrom;
    };
  }

  function create(config) {
    if (!config || !config.state || typeof config.getFen !== 'function' ||
        typeof config.getLegalMovesByFrom !== 'function' ||
        typeof config.isInteractive !== 'function' ||
        typeof config.canSelectPiece !== 'function' ||
        typeof config.onMove !== 'function') {
      throw new Error('ChessGameController requires a complete configuration');
    }

    const { state, getFen, getLegalMovesByFrom, isInteractive, canSelectPiece, onMove } = config;
    if (!(state.availableTargets instanceof Set)) {
      throw new Error('Chess state has invalid available targets');
    }

    function clearSelection() {
      boardCore.resetSelectionIncremental({
        state,
        getFen,
        utils: moveUtils,
      });
    }

    function selectPiece(square, moves) {
      if (!Array.isArray(moves) || moves.length === 0) {
        clearSelection();
        return;
      }

      const targets = new Set(moves.map((move) => {
        const uci = getMoveUci(move);
        if (uci.length < 4) {
          throw new Error('Legal move has invalid UCI length');
        }
        return uci.slice(2, 4).toLowerCase();
      }));

      if (targets.size === 0) {
        clearSelection();
        return;
      }

      boardCore.updateSelection({
        state,
        square,
        targets,
        getFen,
        utils: moveUtils,
      });
    }

    function handleSquareClick(squareName) {
      if (typeof squareName !== 'string' || !/^[a-h][1-8]$/i.test(squareName)) {
        throw new Error('Invalid chess square');
      }
      if (!isInteractive()) {
        return;
      }
      if (!(state.availableTargets instanceof Set)) {
        throw new Error('Chess state has invalid available targets');
      }

      const square = squareName.toLowerCase();
      const selectedSquare = state.selectedSquare;
      const legalMovesByFrom = getLegalMovesByFrom();

      if (selectedSquare && state.availableTargets.has(square)) {
        const moves = legalMovesByFrom.get(selectedSquare);
        if (!Array.isArray(moves)) {
          throw new Error('Selected square has no legal move list');
        }

        const targetMove = moves.find((move) => {
          const uci = getMoveUci(move);
          return uci.length >= 4 && uci.slice(2, 4).toLowerCase() === square;
        });
        if (!targetMove) {
          throw new Error('Selected target is not a legal move');
        }

        onMove(selectedSquare, square, getMoveUci(targetMove));
        return;
      }

      if (selectedSquare === square) {
        clearSelection();
        return;
      }

      const piece = moveUtils.getPieceAtSquare(getFen(), square);
      if (!canSelectPiece(piece)) {
        clearSelection();
        return;
      }

      const moves = legalMovesByFrom.get(square);
      selectPiece(square, moves);
    }

    return {
      getLegalMovesByFrom,
      clearSelection,
      handleSquareClick,
    };
  }

  if (!window.App || !window.App.Chess) {
    throw new Error('App.Chess namespace is not initialized');
  }
  window.App.Chess.GameController = { create, createLegalMoveCache };
  window.ChessGameController = window.App.Chess.GameController;
})();
