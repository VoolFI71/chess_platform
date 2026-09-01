(() => {
  'use strict';

  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
  const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Получить FEN для определенного индекса хода
  function getFenForIndex(moveIndex, game, moves) {
    if (!game) return DEFAULT_FEN;
    if (moveIndex === 0) {
      return game.initial_pos === 'startpos' ? DEFAULT_FEN : game.initial_pos;
    }
    if (moveIndex > 0 && moves && moves[moveIndex - 1]) {
      return moves[moveIndex - 1].fen_after || game.current_pos;
    }
    return game.current_pos;
  }

  // Получить ориентированную матрицу доски (используем общую функцию из ChessBoardCore)
  function getOrientedMatrix(boardOrientation, fen) {
    const utils = window.ChessMoveUtils;
    const BoardCore = window.ChessBoardCore;
    if (!utils?.parseFen || !BoardCore?.fenToMatrix || !BoardCore?.getOrientedMatrix) {
      throw new Error('ChessMoveUtils and ChessBoardCore are not initialized');
    }
    const matrix = BoardCore.fenToMatrix(fen, utils);
    return BoardCore.getOrientedMatrix(matrix, boardOrientation);
  }

  // Получить квадраты для подсветки
  function getHighlightSquares(moveIndex, moves) {
    if (!moveIndex || !moves || moveIndex === 0) return [];
    const targetMove = moves[moveIndex - 1];
    if (!targetMove || !targetMove.uci || targetMove.uci.length < 4) return [];
    const from = targetMove.uci.slice(0, 2);
    const to = targetMove.uci.slice(2, 4);
    return [from, to];
  }

  // Проверка, принадлежит ли фигура игроку (используем общую функцию)
  function pieceBelongsToPlayer(piece, playerColor) {
    const utils = window.ChessMoveUtils;
    if (!utils?.pieceBelongsToPlayer) throw new Error('ChessMoveUtils is not initialized');
    return utils.pieceBelongsToPlayer(piece, playerColor);
  }

  // Используем общий модуль ChessBoardCore для работы с выбором
  const BoardCore = window.ChessBoardCore;

  // Обертка для получения FEN
  function getCurrentFen() {
    const state = window.ComputerGameState;
    if (!state) return null;
    const game = state.getGame();
    const moves = state.getMoves();
    const moveIndex = state.getCurrentMoveIndex();
    return getFenForIndex(moveIndex, game, moves);
  }

  const computerState = window.ComputerGameState;
  if (!computerState || typeof computerState.getDirectState !== 'function') {
    throw new Error('Computer game state is not initialized');
  }
  const computerDirectState = computerState.getDirectState();
  if (!computerDirectState) {
    throw new Error('Computer game state is not initialized');
  }

  const computerController = window.ChessGameController.create({
    state: computerDirectState,
    getFen: getCurrentFen,
    getLegalMovesByFrom: () => {
      if (!(computerDirectState.legalMovesByFrom instanceof Map)) {
        throw new Error('Computer legal moves are not initialized');
      }
      return computerDirectState.legalMovesByFrom;
    },
    isInteractive: () => computerState.isPlayerTurn() && computerState.getGameStatus() === 'active',
    canSelectPiece: (piece) => pieceBelongsToPlayer(piece, computerState.getPlayerColor()),
    onMove: (_from, _to, uci) => makeMove(uci),
  });

  // Инкрементальный сброс выбора (использует общий модуль)
  function resetSelectionIncremental() {
    computerController.clearSelection();
  }

  // Адаптеры общего модуля доски
  function updateSelectedSquareHighlight(squareName, isSelected) {
    const state = window.ComputerGameState;
    if (!state || !BoardCore?.updateSelectedSquareHighlight) {
      throw new Error('Computer game state and ChessBoardCore are not initialized');
    }
    BoardCore.updateSelectedSquareHighlight(state.getDirectState(), squareName, isSelected);
  }

  function updateAvailableTargetsHighlight(targets) {
    const state = window.ComputerGameState;
    if (!state || !BoardCore?.updateAvailableTargetsHighlight) {
      throw new Error('Computer game state and ChessBoardCore are not initialized');
    }
    BoardCore.updateAvailableTargetsHighlight(
      state.getDirectState(),
      targets,
      getCurrentFen(),
      window.ChessMoveUtils
    );
  }

  // Предгенерация легальных ходов для текущей позиции (использует общую функцию)
  function updateLegalMoves() {
    const state = window.ComputerGameState;
    if (!state) return;

    const utils = window.ChessMoveUtils;
    if (!utils?.updateLegalMovesForState) throw new Error('ChessMoveUtils is not initialized');

    // Используем общую функцию предгенерации
    // Получаем прямой доступ к объекту состояния для записи legalMovesByFrom
    if (!state.getDirectState) throw new Error('Computer game state is not initialized');
    const directState = state.getDirectState();
    
    if (!directState) throw new Error('Computer game state is not initialized');
    
    utils.updateLegalMovesForState({
      getFen: () => {
        const game = state.getGame();
        const moves = state.getMoves();
        const moveIndex = state.getCurrentMoveIndex();
        return getFenForIndex(moveIndex, game, moves);
      },
      getPlayerColor: () => state.getPlayerColor(),
      canGenerateMoves: () => {
        const game = state.getGame();
        return game && state.isPlayerTurn() && state.getGameStatus() === 'active';
      },
      state: directState, // Передаем прямой объект состояния
    });
  }

  // Рендер доски (использует базовую функцию из общего модуля)
  function renderBoard() {
    const state = window.ComputerGameState;
    if (!state) return;

    const boardEl = document.getElementById('computerGameBoard');
    if (!boardEl) return;

    const game = state.getGame();
    const moves = state.getMoves();
    const moveIndex = state.getCurrentMoveIndex();
    const boardOrientation = state.getBoardOrientation();
    const selectedSquare = state.getSelectedSquare();
    const availableTargets = state.getAvailableTargets();
    const isPlayerTurn = state.isPlayerTurn();

    if (!game) {
      boardEl.innerHTML = '<div class="board-empty">Игра не найдена</div>';
      return;
    }

    const displayedFen = getFenForIndex(moveIndex, game, moves);
    
    // Предгенерируем ходы при рендеринге (синхронно, чтобы были готовы к первому клику)
    updateLegalMoves();
    
    const matrix = getOrientedMatrix(boardOrientation, displayedFen);
    const highlightSet = new Set(getHighlightSquares(moveIndex, moves));
    const files = boardOrientation === 'white' ? FILES : [...FILES].reverse();
    const ranks = boardOrientation === 'white' ? RANKS : [...RANKS].reverse();
    const utils = window.ChessMoveUtils;
    if (!utils?.parseFen || !BoardCore?.renderBoardBase) {
      throw new Error('ChessMoveUtils and ChessBoardCore are not initialized');
    }
    const baseBoard = utils.parseFen(displayedFen).board;
    
    // Для координат используем стандартные RANKS (как в tasks)
    const ranksForCoords = RANKS; // ['8', '7', '6', '5', '4', '3', '2', '1']
    const isFlipped = boardOrientation === 'black';

    // Используем базовую функцию рендеринга
    {
      BoardCore.renderBoardBase({
        boardEl,
        matrix,
        files,
        ranks,
        state: state.getDirectState(),
        getPieceSVG: window.getPieceSVG,
        onSquareClick: (isPlayerTurn && state.getGameStatus() === 'active') 
          ? handleSquareClick 
          : null,
        options: {
          selectedSquare,
          availableTargets,
          highlightSet,
          baseBoard,
          showCoordinates: true,
          ranksForCoords: ranksForCoords,
          isFlipped: isFlipped,
          customClasses: {
            square: (isPlayerTurn && state.getGameStatus() === 'active') ? 'clickable' : '',
          },
          customPieceClasses: {
            pieceTag: 'div', // computer использует div для фигур
          },
          pieceCheckCallback: (piece, squareName) => {
            const pieceStr = typeof piece === 'string' ? piece : String(piece);
            const playerColor = state.getPlayerColor();
            const classes = {};
            
            if (isPlayerTurn && pieceBelongsToPlayer(pieceStr, playerColor)) {
              classes.own = 'piece-own';
              
              // Используем предгенерированные ходы (быстро, без генерации)
      const directState = state.getDirectState();
              const legalMoves = directState?.legalMovesByFrom?.get(squareName.toLowerCase());
              if (legalMoves && legalMoves.length > 0) {
                classes.movable = 'piece-movable';
              }
            }
            
            return classes;
          },
        },
      });
      
      // Добавляем курсор для кликабельных квадратов
      if (isPlayerTurn && state.getGameStatus() === 'active') {
        const squares = boardEl.querySelectorAll('.square');
        squares.forEach(square => {
          square.style.cursor = 'pointer';
        });
      }
    }
  }

  // Обработка клика на квадрат (оптимизированная версия)
  function handleSquareClick(squareName) {
    computerController.handleSquareClick(squareName);
  }

  // Сделать ход
  function makeMove(uci) {
    const ws = window.ComputerGameWebSocket;
    if (!ws || !ws.sendMove) {
      return;
    }

    ws.sendMove(uci);
    
    // Очищаем выбор инкрементально
    resetSelectionIncremental();
  }

  // Export
  window.ComputerGameBoard = {
    renderBoard,
    updateLegalMoves,
    getFenForIndex,
    getOrientedMatrix,
  };

  // Экспортируем renderBoard глобально для использования в других модулях
  if (typeof window !== 'undefined') {
    window.renderComputerGameBoard = renderBoard;
  }
})();

