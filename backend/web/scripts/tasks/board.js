(() => {
  const TasksConstants = window.TasksConstants;
  const TasksState = window.TasksState;
  
  if (!TasksConstants || !TasksState) {
    throw new Error('Required modules not loaded. Ensure tasks/constants.js and tasks/state.js are included first.');
  }

  const { PIECES } = TasksConstants;

  window.TasksBoard = {
    parseFEN(fen) {
      if (!fen) return [];
      const placement = fen.split(' ')[0];
      const rows = placement.split('/');
      return rows.map((row) => {
        const squares = [];
        for (const char of row) {
          if (char >= '1' && char <= '8') {
            squares.push(...Array(parseInt(char, 10)).fill(''));
          } else {
            squares.push(char);
          }
        }
        return squares;
      });
    },

    getSquareName(rowIdx, colIdx) {
      const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
      return files[colIdx] + ranks[rowIdx];
    },

    getPieceColor(piece) {
      if (!piece) return null;
      return piece === piece.toUpperCase() ? 'w' : 'b';
    },

    renderBoard() {
      if (TasksState.renderBoardScheduled) return;
      
      TasksState.renderBoardScheduled = true;
      requestAnimationFrame(() => {
        TasksState.renderBoardScheduled = false;
        window.TasksBoard._renderBoard();
      });
    },

    _renderBoard() {
      const grid = document.getElementById('boardGrid');
      if (!grid || !TasksState.board.length || !TasksState.currentFEN) return;

      // Определяем, чей ход (из FEN)
      const fenParts = TasksState.currentFEN.split(' ');
      const activeColor = fenParts[1] || 'w'; // 'w' или 'b'
      
      // Используем фиксированную ориентацию доски (определяется при загрузке задачи)
      const isFlipped = TasksState.boardOrientation === 'black';

      // Определяем файлы и ранги для отображения (всегда с точки зрения активного игрока)
      const displayFiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const displayRanks = ['1', '2', '3', '4', '5', '6', '7', '8'];

      grid.innerHTML = '';

      // Получаем легальные ходы для текущей позиции (нужно для делегирования событий)
      let movesByFrom = new Map();
      
      if (window.ChessMoveUtils && !TasksState.isPuzzleSolved && !TasksState.isPuzzleFailed) {
        const moveUtils = window.ChessMoveUtils;
        // Конвертируем формат цвета: 'w'/'b' -> 'white'/'black'
        const colorForMoveGen = activeColor === 'w' ? 'white' : 'black';
        
        // Оптимизация памяти: используем кеш для позиций
        const cacheKey = `${TasksState.currentFEN}|${colorForMoveGen}`;
        let cachedMoves = TasksState.positionCache?.get(cacheKey);
        
        if (!cachedMoves) {
          const { movesByFrom: movesMap } = moveUtils.generateMoves(TasksState.currentFEN, colorForMoveGen);
          cachedMoves = movesMap;
          // Сохраняем в кеш с ограничением размера (предотвращает утечки памяти)
          if (TasksState.positionCache) {
            // Ограничиваем размер кеша до 50 позиций
            if (TasksState.positionCache.size >= 50) {
              // Удаляем самую старую запись (первую)
              const firstKey = TasksState.positionCache.keys().next().value;
              if (firstKey) {
                TasksState.positionCache.delete(firstKey);
              }
            }
            TasksState.positionCache.set(cacheKey, cachedMoves);
          }
        }
        
        movesByFrom = cachedMoves;
      }
      
      // Устанавливаем делегирование событий на контейнер доски (один раз, при первом рендере)
      if (!TasksState.boardClickHandler) {
        TasksState.boardClickHandler = (e) => {
          if (TasksState.isPuzzleSolved || TasksState.isPuzzleFailed || !TasksState.currentFEN) return;
          const square = e.target.closest('.square');
          if (!square) return;
          const squareName = square.dataset.square;
          if (squareName && square.classList.contains('clickable')) {
            if (window.TasksMoves && window.TasksMoves.handleSquareClick) {
              window.TasksMoves.handleSquareClick(squareName);
            }
          }
        };
        grid.addEventListener('click', TasksState.boardClickHandler);
      }

      // Создаем перевернутую матрицу доски, если нужно
      const displayBoard = isFlipped ? [...TasksState.board].reverse() : TasksState.board;

      displayBoard.forEach((row, rowIdx) => {
        row.forEach((piece, colIdx) => {
          // Вычисляем реальные индексы в исходной доске
          const realRowIdx = isFlipped ? 7 - rowIdx : rowIdx;
          const realColIdx = colIdx; // Столбцы не переворачиваются
          
          const isLight = (realRowIdx + realColIdx) % 2 === 0;
          const squareName = window.TasksBoard.getSquareName(realRowIdx, realColIdx);
          const square = document.createElement('div');
          square.className = `square ${isLight ? 'light' : 'dark'}`;
          square.dataset.square = squareName;

          // Подсветка выбранной клетки
          if (TasksState.selectedSquare === squareName) {
            square.classList.add('selected-user');
          }

          // Подсветка доступных целей (только если есть выбранная фигура и это легальная цель)
          // availableTargets уже содержит только легальные ходы (отфильтрованы через isMoveAllowed в moves.js)
          if (TasksState.selectedSquare && TasksState.availableTargets.has(squareName)) {
            square.classList.add('legal-target');
            const indicator = document.createElement('div');
            indicator.className = 'legal-move-indicator';
            square.appendChild(indicator);
          }

          // Подсветка неверного хода (красным)
          if (square.classList.contains('invalid-move')) {
            square.style.backgroundColor = 'rgba(220, 38, 38, 0.3)';
            square.style.boxShadow = 'inset 0 0 0 3px rgba(220, 38, 38, 0.8)';
          }

          if (piece) {
            const pieceEl = document.createElement('span');
            pieceEl.className = 'piece';
            if (window.getPieceSVG) {
              pieceEl.innerHTML = window.getPieceSVG(piece);
            } else {
              pieceEl.textContent = PIECES[piece] || '';
            }
            square.appendChild(pieceEl);
          }

          // Отображаем координаты в зависимости от ориентации доски
          const isBottomRow = isFlipped ? rowIdx === 0 : rowIdx === displayBoard.length - 1;
          const isLeftCol = colIdx === 0;
          
          if (isBottomRow) {
            const fileCoord = document.createElement('span');
            fileCoord.className = 'coordinate file-coord';
            fileCoord.textContent = displayFiles[colIdx];
            square.appendChild(fileCoord);
          }

          if (isLeftCol) {
            const rankCoord = document.createElement('span');
            rankCoord.className = 'coordinate rank-coord';
            const rankIndex = isFlipped ? rowIdx : 7 - rowIdx;
            rankCoord.textContent = displayRanks[rankIndex];
            square.appendChild(rankCoord);
          }

          // Устанавливаем курсор для кликабельных клеток
          if (!TasksState.isPuzzleSolved && !TasksState.isPuzzleFailed) {
            const realPiece = TasksState.board[realRowIdx][realColIdx];
            const pieceColor = window.TasksBoard.getPieceColor(realPiece);
            const isUserPiece = pieceColor === activeColor;
            
            const hasMoves = movesByFrom.has(squareName.toLowerCase());
            
            if ((isUserPiece && hasMoves) || TasksState.selectedSquare) {
              square.style.cursor = 'pointer';
              square.classList.add('clickable');
            } else {
              square.style.cursor = '';
              square.classList.remove('clickable');
            }
          }

          grid.appendChild(square);
        });
      });
    },
  };
})();

