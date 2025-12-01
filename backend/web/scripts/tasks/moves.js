(() => {
  const TasksState = window.TasksState;
  
  if (!TasksState) {
    throw new Error('TasksState module is not loaded. Ensure tasks/state.js is included first.');
  }

  window.TasksMoves = {
    // Вспомогательная функция для сброса выбора фигуры
    clearSelection() {
      TasksState.selectedSquare = null;
      TasksState.availableTargets = new Set();
      window.TasksBoard.renderBoard();
    },

    handleSquareClick(squareName) {
      if (TasksState.isPuzzleSolved || TasksState.isPuzzleFailed || !TasksState.currentFEN || !window.ChessMoveUtils) return;

      const moveUtils = window.ChessMoveUtils;
      const fenParts = TasksState.currentFEN.split(' ');
      const activeColor = fenParts[1] || 'w';
      
      const normalizedSquareName = squareName.toLowerCase();
      const colorForMoveGen = activeColor === 'w' ? 'white' : 'black';
      const { movesByFrom } = moveUtils.generateMoves(TasksState.currentFEN, colorForMoveGen) || { movesByFrom: new Map() };
      
      // Если выбрана клетка с фигурой пользователя
      if (TasksState.selectedSquare && TasksState.selectedSquare.toLowerCase() === normalizedSquareName) {
        window.TasksMoves.clearSelection();
        return;
      }

      // Если уже выбрана фигура, пытаемся сделать ход
      if (TasksState.selectedSquare) {
        // Проверяем, что кликнули на легальную цель для выбранной фигуры
        if (!TasksState.availableTargets.has(normalizedSquareName)) {
          // Кликнули на клетку, которая не является легальной целью - сбрасываем выбор
          window.TasksMoves.clearSelection();
          return;
        }
        
        const moves = movesByFrom.get(TasksState.selectedSquare.toLowerCase());
        if (moves && moves.size > 0) {
          const uciMoves = Array.from(moves);
          const targetMove = uciMoves.find(uci => {
            const target = uci.slice(2, 4).toLowerCase();
            return target === normalizedSquareName;
          });
          
          if (targetMove) {
            window.TasksMoves.executeMove(TasksState.selectedSquare, normalizedSquareName, targetMove);
          } else {
            // Ход не найден, хотя клетка в availableTargets - сбрасываем выбор
            window.TasksMoves.clearSelection();
          }
        } else {
          window.TasksMoves.clearSelection();
        }
        return;
      }

      // Выбираем фигуру (только если это фигура игрока и у неё есть ходы)
      const realRowIdx = 8 - parseInt(normalizedSquareName[1], 10);
      const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const realColIdx = files.indexOf(normalizedSquareName[0]);
      
      if (realRowIdx >= 0 && realRowIdx < 8 && realColIdx >= 0 && realColIdx < 8) {
        const piece = TasksState.board[realRowIdx][realColIdx];
        const pieceColor = window.TasksBoard.getPieceColor(piece);
        
        // Проверяем, что это фигура игрока (активного цвета)
        if (pieceColor === activeColor) {
          const moves = movesByFrom.get(normalizedSquareName);
          if (moves && moves.size > 0) {
            // Фильтруем ходы: оставляем только те, которые действительно легальны
            // (не оставляют короля под шахом)
            const legalTargets = Array.from(moves)
              .filter(uci => {
                return moveUtils.isMoveAllowed(TasksState.currentFEN, colorForMoveGen, uci);
              })
              .map(uci => uci.slice(2, 4).toLowerCase());
            
            if (legalTargets.length > 0) {
              TasksState.selectedSquare = normalizedSquareName;
              TasksState.availableTargets = new Set(legalTargets);
              window.TasksBoard.renderBoard();
            }
          }
        }
      }
    },

    applyMoveToBoard(uci, animate = true) {
      if (!TasksState.currentFEN || !window.ChessMoveUtils) return false;
      
      const fenParts = TasksState.currentFEN.split(' ');
      const activeColor = fenParts[1] || 'w';
      const color = activeColor === 'w' ? 'white' : 'black';
      
      if (!window.ChessMoveUtils.isMoveAllowed(TasksState.currentFEN, color, uci)) {
        return false;
      }
      
      const from = uci.slice(0, 2).toLowerCase();
      const to = uci.slice(2, 4).toLowerCase();
      const promotion = uci.length > 4 ? uci.slice(4, 5).toLowerCase() : null;
      
      TasksState.lastMoveSquares = [from, to];
      
      if (animate && window.TasksAnimations && window.TasksAnimations.animatePieceMove) {
        window.TasksAnimations.animatePieceMove(from, to);
      }
      
      const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const fromFile = files.indexOf(from[0]);
      const fromRank = 8 - parseInt(from[1], 10);
      const toFile = files.indexOf(to[0]);
      const toRank = 8 - parseInt(to[1], 10);
      
      if (fromFile === -1 || fromRank < 0 || fromRank > 7 || toFile === -1 || toRank < 0 || toRank > 7) {
        return false;
      }
      
      const piece = TasksState.board[fromRank][fromFile];
      if (!piece) return false;
      
      // Проверяем, было ли взятие (до перезаписи)
      const capturedPiece = TasksState.board[toRank][toFile];
      let isCapture = capturedPiece !== '';
      
      // Проверяем взятие на проходе
      let isEnPassant = false;
      if (piece.toLowerCase() === 'p' && fenParts[3] && fenParts[3] !== '-') {
        const enPassantSquare = fenParts[3];
        const enPassantFile = files.indexOf(enPassantSquare[0]);
        const enPassantRank = 8 - parseInt(enPassantSquare[1], 10);
        
        // Если пешка ходит на поле en passant
        if (toFile === enPassantFile && toRank === enPassantRank) {
          isEnPassant = true;
          isCapture = true; // Взятие на проходе тоже считается взятием
        }
      }
      
      let pieceToMove = piece;
      if (promotion && piece.toLowerCase() === 'p') {
        pieceToMove = activeColor === 'w' ? promotion.toUpperCase() : promotion.toLowerCase();
      }
      
      TasksState.board[fromRank][fromFile] = '';
      TasksState.board[toRank][toFile] = pieceToMove;
      
      // Обработка взятия на проходе
      if (isEnPassant) {
        // Удаляем взятую пешку (она находится на той же горизонтали, что и исходная позиция)
        const capturedPawnRank = fromRank; // Пешка противника на той же горизонтали
        TasksState.board[capturedPawnRank][toFile] = '';
      }
      
      // Обработка рокировки
      if (piece.toLowerCase() === 'k' && Math.abs(fromFile - toFile) === 2) {
        if (toFile === 6) {
          const rookFromFile = 7;
          const rookToFile = 5;
          const rook = TasksState.board[fromRank][rookFromFile];
          TasksState.board[fromRank][rookFromFile] = '';
          TasksState.board[fromRank][rookToFile] = rook;
        } else if (toFile === 2) {
          const rookFromFile = 0;
          const rookToFile = 3;
          const rook = TasksState.board[fromRank][rookFromFile];
          TasksState.board[fromRank][rookFromFile] = '';
          TasksState.board[fromRank][rookToFile] = rook;
        }
      }
      
      const newActiveColor = activeColor === 'w' ? 'b' : 'w';
      const placement = TasksState.board.map(row => {
        let fenRow = '';
        let emptyCount = 0;
        for (const square of row) {
          if (square === '') {
            emptyCount++;
          } else {
            if (emptyCount > 0) {
              fenRow += emptyCount;
              emptyCount = 0;
            }
            fenRow += square;
          }
        }
        if (emptyCount > 0) {
          fenRow += emptyCount;
        }
        return fenRow;
      }).join('/');
      
      // Обновляем castling rights (убираем права после рокировки, движения короля/ладьи или взятия ладьи)
      let castlingRights = fenParts[2] || '-';
      if (piece.toLowerCase() === 'k') {
        // Убираем права на рокировку для этого цвета
        if (activeColor === 'w') {
          castlingRights = castlingRights.replace(/[KQ]/g, '');
        } else {
          castlingRights = castlingRights.replace(/[kq]/g, '');
        }
        if (castlingRights === '') castlingRights = '-';
      } else if (piece.toLowerCase() === 'r') {
        // Убираем права на рокировку для соответствующей ладьи (при движении)
        if (activeColor === 'w') {
          if (fromRank === 7 && fromFile === 0) castlingRights = castlingRights.replace('Q', '');
          if (fromRank === 7 && fromFile === 7) castlingRights = castlingRights.replace('K', '');
        } else {
          if (fromRank === 0 && fromFile === 0) castlingRights = castlingRights.replace('q', '');
          if (fromRank === 0 && fromFile === 7) castlingRights = castlingRights.replace('k', '');
        }
        if (castlingRights === '') castlingRights = '-';
      }
      
      // Если взята ладья противника на исходной позиции, убираем права на рокировку противника
      if (isCapture && capturedPiece.toLowerCase() === 'r') {
        // Определяем цвет взятой ладьи по регистру capturedPiece
        const capturedRookColor = capturedPiece === capturedPiece.toUpperCase() ? 'w' : 'b';
        if (capturedRookColor === 'w') {
          // Белая ладья взята на исходной позиции (rank 7 для белых)
          if (toRank === 7 && toFile === 0) castlingRights = castlingRights.replace('Q', '');
          if (toRank === 7 && toFile === 7) castlingRights = castlingRights.replace('K', '');
        } else {
          // Черная ладья взята на исходной позиции (rank 0 для черных)
          if (toRank === 0 && toFile === 0) castlingRights = castlingRights.replace('q', '');
          if (toRank === 0 && toFile === 7) castlingRights = castlingRights.replace('k', '');
        }
        if (castlingRights === '') castlingRights = '-';
      }
      
      // Обновляем en passant
      let enPassant = '-';
      if (piece.toLowerCase() === 'p') {
        const pawnStartRank = activeColor === 'w' ? 6 : 1;
        const pawnEndRank = activeColor === 'w' ? 4 : 3;
        // Если пешка ходит на 2 клетки вперёд, устанавливаем en passant
        if (fromRank === pawnStartRank && toRank === pawnEndRank) {
          const enPassantRank = activeColor === 'w' ? 5 : 2;
          enPassant = `${files[toFile]}${8 - enPassantRank}`;
        }
      }
      
      // Обновляем halfmove clock (сбрасывается при ходе пешкой или взятии, иначе увеличивается)
      let halfmoveClock = parseInt(fenParts[4] || '0', 10);
      if (piece.toLowerCase() === 'p' || isCapture) {
        halfmoveClock = 0;
      } else {
        halfmoveClock++;
      }
      
      // Обновляем fullmove number (увеличивается после хода чёрных)
      let fullmoveNumber = parseInt(fenParts[5] || '1', 10);
      if (newActiveColor === 'w') {
        fullmoveNumber++;
      }
      
      TasksState.currentFEN = `${placement} ${newActiveColor} ${castlingRights} ${enPassant} ${halfmoveClock} ${fullmoveNumber}`;
      
      return true;
    },

    executeMove(from, to, uci) {
      if (!TasksState.currentPuzzle || !TasksState.currentFEN) return;

      const correctMoves = TasksState.currentPuzzle.moves || [];
      
      // Определяем активный цвет из текущего FEN
      const fenParts = TasksState.currentFEN.split(' ');
      const currentActiveColor = fenParts[1] || 'w';
      
      // В пазлах игрок играет за противоположный цвет от начального активного цвета
      // Проверяем, что текущий активный цвет совпадает с цветом игрока
      if (currentActiveColor !== TasksState.playerColor) {
        console.warn('[puzzle] Player trying to move when it\'s opponent\'s turn', {
          currentActiveColor,
          playerColor: TasksState.playerColor,
          move: uci
        });
        // Отменяем ход и возвращаемся к предыдущей позиции
        window.TasksMoves.clearSelection();
        return;
      }
      
      const moveApplied = window.TasksMoves.applyMoveToBoard(uci, true);
      if (!moveApplied) {
        window.TasksMoves.clearSelection();
        return;
      }
      
      window.TasksBoard.renderBoard();
      
      // Массив moves начинается с хода противника (индекс 0)
      // Ходы противника: 0, 2, 4, 6, ...
      // Ходы игрока: 1, 3, 5, 7, ...
      // currentMoveIndex хранит количество выполненных корректных ходов игрока
      // Поэтому текущий ожидаемый ход игрока имеет индекс = currentMoveIndex * 2 + 1
      const playerMoveIndex = TasksState.currentMoveIndex * 2 + 1;
      
      const expectedMove = correctMoves[playerMoveIndex];
      
      if (!expectedMove) {
        if (playerMoveIndex >= correctMoves.length) {
          if (window.TasksUtils && typeof window.TasksUtils.playSound === 'function') {
            window.TasksUtils.playSound('success');
          }
          window.TasksMain.handlePuzzleSolved();
        } else {
          if (window.TasksUtils && typeof window.TasksUtils.playSound === 'function') {
            window.TasksUtils.playSound('error');
          }
          window.TasksMain.handlePuzzleFailed(to);
        }
        return;
      }
      
      if (uci.toLowerCase() === expectedMove.toLowerCase()) {
        if (window.TasksUtils && typeof window.TasksUtils.playSound === 'function') {
          window.TasksUtils.playSound('success');
        }
        TasksState.userMoves.push(uci);
        
        TasksState.movesHistory.push({
          move: uci,
          fen: TasksState.currentFEN,
          isPlayer: true,
          isCorrect: true
        });
        TasksState.currentHistoryIndex = TasksState.movesHistory.length - 1;
        window.TasksHistory.updateMovesHistory();
        
        // Индекс следующего хода противника: 2, 4, 6, 8, ...
        // После хода игрока currentMoveIndex соответствует количеству выполненных им ходов,
        // поэтому индекс следующего хода противника = currentMoveIndex * 2
        TasksState.currentMoveIndex++;
        const opponentMoveIndex = TasksState.currentMoveIndex * 2;
        
        if (opponentMoveIndex < correctMoves.length) {
          const opponentMove = correctMoves[opponentMoveIndex];
          window.TasksUtils.createTimer(() => {
            window.TasksMoves.applyOpponentMove(opponentMove);
          }, 500);
        } else {
          window.TasksMain.handlePuzzleSolved();
        }
      } else {
        if (window.TasksUtils && typeof window.TasksUtils.playSound === 'function') {
          window.TasksUtils.playSound('error');
        }
        window.TasksMain.handlePuzzleFailed(to);
      }
    },

    applyOpponentMove(uci) {
      if (!TasksState.currentFEN || !uci) return;
      
      if (window.TasksMoves.applyMoveToBoard(uci, true)) {
        TasksState.movesHistory.push({
          move: uci,
          fen: TasksState.currentFEN,
          isPlayer: false
        });
        TasksState.currentHistoryIndex = TasksState.movesHistory.length - 1;
        window.TasksHistory.updateMovesHistory();
        
        window.TasksUtils.createTimer(() => {
          window.TasksBoard.renderBoard();
        }, 100);
        
        TasksState.selectedSquare = null;
        TasksState.availableTargets = new Set();
        
        const correctMoves = TasksState.currentPuzzle.moves || [];
        
        // Индекс следующего хода игрока: 1, 3, 5, 7, ...
        const nextPlayerMoveIndex = TasksState.currentMoveIndex * 2 + 1;
        
        if (nextPlayerMoveIndex >= correctMoves.length) {
          if (window.TasksUtils && typeof window.TasksUtils.playSound === 'function') {
            window.TasksUtils.playSound('success');
          }
          window.TasksMain.handlePuzzleSolved();
        } else {
          window.TasksUI.setPuzzleStatus('Противник сделал ход. Ваш ход!', false);
        }
      }
    },
  };
})();

