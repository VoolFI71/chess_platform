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
    
    if (!utils) return [];
    
    // Используем общую функцию из ChessBoardCore, если доступна
    if (BoardCore && BoardCore.fenToMatrix && BoardCore.getOrientedMatrix) {
      const matrix = BoardCore.fenToMatrix(fen, utils);
      return BoardCore.getOrientedMatrix(matrix, boardOrientation);
    }
    
    // Fallback для обратной совместимости
    const parsed = utils.parseFen(fen);
    const board = parsed.board || [];
    
    const matrix = [];
    for (let rank = 0; rank < 8; rank++) {
      const row = [];
      if (board[rank]) {
        for (let file = 0; file < 8; file++) {
          const piece = board[rank][file];
          if (piece && piece !== '' && piece !== ' ') {
            row.push(piece);
          } else {
            row.push(null);
          }
        }
      } else {
        for (let file = 0; file < 8; file++) {
          row.push(null);
        }
      }
      matrix.push(row);
    }

    if (boardOrientation === 'black') {
      return matrix.slice().reverse().map((row) => row.slice().reverse());
    }

    return matrix;
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
    if (utils && utils.pieceBelongsToPlayer) {
      return utils.pieceBelongsToPlayer(piece, playerColor);
    }
    // Fallback для обратной совместимости
    if (!piece) return false;
    const pieceStr = typeof piece === 'string' ? piece : String(piece);
    const isWhite = pieceStr === pieceStr.toUpperCase();
    return (playerColor === 'white' && isWhite) || (playerColor === 'black' && !isWhite);
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

  // Инкрементальный сброс выбора (использует общий модуль)
  function resetSelectionIncremental() {
    const state = window.ComputerGameState;
    if (!state) return;

    if (BoardCore) {
      // Получаем прямой доступ к состоянию для правильного чтения oldTargets
      const directState = state.getDirectState ? state.getDirectState() : null;
      if (directState) {
        BoardCore.resetSelectionIncremental({
          state: directState, // Передаем прямой объект состояния
          getFen: getCurrentFen,
          utils: window.ChessMoveUtils,
        });
      } else {
        // Fallback: используем объект с геттерами
        BoardCore.resetSelectionIncremental({
          state,
          getFen: getCurrentFen,
          utils: window.ChessMoveUtils,
        });
      }
    } else {
      // Fallback для обратной совместимости
      state.setSelectedSquare(null);
      state.setAvailableTargets(new Set());
      renderBoard();
    }
  }

  // Обертки для обратной совместимости
  function updateSelectedSquareHighlight(squareName, isSelected) {
    const state = window.ComputerGameState;
    if (BoardCore && state) {
      BoardCore.updateSelectedSquareHighlight(state, squareName, isSelected);
    }
  }

  function updateAvailableTargetsHighlight(targets) {
    const state = window.ComputerGameState;
    if (BoardCore && state) {
      BoardCore.updateAvailableTargetsHighlight(
        state, 
        targets, 
        getCurrentFen(), 
        window.ChessMoveUtils
      );
    }
  }

  // Предгенерация легальных ходов для текущей позиции (использует общую функцию)
  function updateLegalMoves() {
    const state = window.ComputerGameState;
    if (!state) return;

    const utils = window.ChessMoveUtils;
    if (!utils || !utils.updateLegalMovesForState) {
      // Fallback: старая логика
      const game = state.getGame();
      const moves = state.getMoves();
      const moveIndex = state.getCurrentMoveIndex();
      const isPlayerTurn = state.isPlayerTurn();

      if (!game || !isPlayerTurn || state.getGameStatus() !== 'active') {
        state.legalMovesByFrom = new Map();
        return;
      }

      const fen = getFenForIndex(moveIndex, game, moves);
      const playerColor = state.getPlayerColor();
      
      if (utils && utils.generateLegalMoves) {
        const { legalMovesByFrom } = utils.generateLegalMoves(fen, playerColor);
        state.legalMovesByFrom = legalMovesByFrom || new Map();
      } else {
        state.legalMovesByFrom = new Map();
      }
      return;
    }

    // Используем общую функцию предгенерации
    // Получаем прямой доступ к объекту состояния для записи legalMovesByFrom
    const directState = state.getDirectState ? state.getDirectState() : null;
    
    if (!directState) {
      // Fallback: старая логика
      const game = state.getGame();
      const moves = state.getMoves();
      const moveIndex = state.getCurrentMoveIndex();
      const isPlayerTurn = state.isPlayerTurn();

      if (!game || !isPlayerTurn || state.getGameStatus() !== 'active') {
        return;
      }

      const fen = getFenForIndex(moveIndex, game, moves);
      const playerColor = state.getPlayerColor();
      
      if (utils && utils.generateLegalMoves) {
        const { legalMovesByFrom } = utils.generateLegalMoves(fen, playerColor);
        // Пытаемся записать напрямую в state (если это возможно)
        if (state.legalMovesByFrom !== undefined) {
          state.legalMovesByFrom = legalMovesByFrom || new Map();
        }
      }
      return;
    }
    
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
    const baseBoard = utils ? utils.parseFen(displayedFen).board : null;
    
    // Для координат используем стандартные RANKS (как в tasks)
    const ranksForCoords = RANKS; // ['8', '7', '6', '5', '4', '3', '2', '1']
    const isFlipped = boardOrientation === 'black';

    // Используем базовую функцию рендеринга
    if (BoardCore && BoardCore.renderBoardBase) {
      BoardCore.renderBoardBase({
        boardEl,
        matrix,
        files,
        ranks,
        state,
        getPieceSVG: (pieceStr) => window.ChessPiecesSVG?.[pieceStr] || null,
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
              const directState = state.getDirectState ? state.getDirectState() : null;
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
    } else {
      // Fallback: старая логика
      boardEl.innerHTML = '';
      if (BoardCore && state) {
        BoardCore.clearSquareElementsCache(state);
      }

      matrix.forEach((row, rIdx) => {
        row.forEach((piece, cIdx) => {
          const square = document.createElement('div');
          const isLight = (rIdx + cIdx) % 2 === 0;
          square.className = `square ${isLight ? 'light' : 'dark'}`;
          const squareName = `${files[cIdx]}${ranks[rIdx]}`;
          
          if (BoardCore && state) {
            BoardCore.registerSquareElement(state, squareName, square);
          }
          
          if (highlightSet.has(squareName)) {
            square.classList.add('highlighted');
            const overlay = document.createElement('div');
            overlay.className = 'highlight-overlay';
            square.appendChild(overlay);
          }
          
          // НЕ подсвечиваем выбранную фигуру - подсвечиваем только возможные ходы
          // if (selectedSquare && squareName === selectedSquare) {
          //   square.classList.add('selected-user');
          // }
          
          if (availableTargets.has(squareName)) {
            square.classList.add('legal-target');
            if (baseBoard) {
              const fileIdx = squareName.charCodeAt(0) - 97;
              const rankIdx = 8 - Number.parseInt(squareName[1], 10);
              if (baseBoard[rankIdx] && baseBoard[rankIdx][fileIdx] && baseBoard[rankIdx][fileIdx] !== '') {
                square.classList.add('legal-target-capture');
              }
            }
            const marker = document.createElement('div');
            marker.className = 'legal-move-indicator';
            if (square.classList.contains('legal-target-capture')) {
              marker.classList.add('capture');
            }
            square.appendChild(marker);
          }

          if (piece) {
            const pieceStr = typeof piece === 'string' ? piece : String(piece);
            const pieceEl = document.createElement('div');
            pieceEl.className = `piece ${pieceStr.toLowerCase()}`;
            pieceEl.style.pointerEvents = 'none';
            
            const playerColor = state.getPlayerColor();
            if (isPlayerTurn && pieceBelongsToPlayer(pieceStr, playerColor)) {
              pieceEl.classList.add('piece-own');
              if (utils) {
                const validMoves = utils.getMovesForSquare(displayedFen, playerColor, squareName);
                if (validMoves && validMoves.length > 0) {
                  pieceEl.classList.add('piece-movable');
                }
              }
            }
            
            const pieceSVG = window.ChessPiecesSVG?.[pieceStr];
            if (pieceSVG) {
              pieceEl.innerHTML = pieceSVG;
            }
            square.appendChild(pieceEl);
          }

          if (isPlayerTurn && state.getGameStatus() === 'active') {
            square.style.cursor = 'pointer';
            square.addEventListener('click', (e) => {
              e.stopPropagation();
              handleSquareClick(squareName);
            });
          }

          boardEl.appendChild(square);
        });
      });
    }
  }

  // Обработка клика на квадрат (оптимизированная версия)
  function handleSquareClick(squareName) {
    const state = window.ComputerGameState;
    if (!state) return;

    // Быстрая проверка без парсинга FEN
    if (!state.isPlayerTurn() || state.getGameStatus() !== 'active') {
      return;
    }

    // Используем предгенерированные ходы - они уже проверены и готовы
    const normalizedSquare = squareName.toLowerCase();
    const selectedSquare = state.getSelectedSquare();
    const availableTargets = state.getAvailableTargets();

    // Сценарий A: Уже выбрана фигура, клик на целевую клетку
    if (selectedSquare && availableTargets.has(normalizedSquare)) {
      const uci = `${selectedSquare}${normalizedSquare}`;
      makeMove(uci);
      return;
    }

    // Сценарий B: Клик на уже выбранную фигуру (отмена выбора)
    if (selectedSquare === normalizedSquare) {
      resetSelectionIncremental();
      return;
    }

    // Сценарий C: Выбор новой фигуры - используем предгенерированные ходы
    // Получаем прямой доступ к состоянию для чтения legalMovesByFrom
    const directState = state.getDirectState ? state.getDirectState() : null;
    const legalMoves = directState?.legalMovesByFrom?.get(normalizedSquare);
    
    if (!legalMoves || legalMoves.length === 0) {
      // Нет ходов - сбрасываем выбор
      resetSelectionIncremental();
      return;
    }

    // Сценарий D: Обновляем выбор с предгенерированными ходами
    const newTargets = new Set(legalMoves.map(m => {
      const uci = typeof m === 'string' ? m : m.uci || '';
      return uci.slice(2, 4).toLowerCase();
    }));

    // Немедленно обновляем состояние для визуальной обратной связи
    state.setSelectedSquare(normalizedSquare);
    state.setAvailableTargets(newTargets);
    
    // Используем оптимизированное обновление (синхронно для быстрой обратной связи)
    if (BoardCore && BoardCore.updateSelection) {
      const game = state.getGame();
      const moves = state.getMoves();
      const moveIndex = state.getCurrentMoveIndex();
      const fen = getFenForIndex(moveIndex, game, moves);
      const utils = window.ChessMoveUtils;
      
      BoardCore.updateSelection({
        state,
        square: normalizedSquare,
        targets: newTargets,
        getFen: () => fen,
        utils,
      });
    } else {
      // Fallback (не должен выполняться, т.к. предгенерация всегда активна)
      state.setSelectedSquare(normalizedSquare);
      state.setAvailableTargets(newTargets);
      renderBoard();
    }
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

