(() => {
  const TasksConstants = window.TasksConstants;
  const TasksState = window.TasksState;
  const BoardCore = window.ChessBoardCore; // Общий модуль для работы с доской
  
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
      const utils = window.ChessMoveUtils;
      if (utils && utils.pieceColor) {
        const color = utils.pieceColor(piece);
        // Конвертируем 'white'/'black' в 'w'/'b' для обратной совместимости
        return color === 'white' ? 'w' : color === 'black' ? 'b' : null;
      }
      // Fallback для обратной совместимости
      if (!piece) return null;
      return piece === piece.toUpperCase() ? 'w' : 'b';
    },

    renderBoard() {
      if (TasksState.renderBoardScheduled) {
        return;
      }
      
      TasksState.renderBoardScheduled = true;
      requestAnimationFrame(() => {
        TasksState.renderBoardScheduled = false;
        window.TasksBoard._renderBoard();
      });
    },

    _renderBoard() {
      const grid = document.getElementById('boardGrid');
      
      if (!grid || !TasksState.board.length || !TasksState.currentFEN) {
        return;
      }

      // Определяем, чей ход (из FEN)
      const fenParts = TasksState.currentFEN.split(' ');
      const activeColor = fenParts[1] || 'w'; // 'w' или 'b'
      
      // Используем фиксированную ориентацию доски (определяется при загрузке задачи)
      const isFlipped = TasksState.boardOrientation === 'black';

      // Определяем файлы и ранги для отображения
      // ВАЖНО: Для squareName нужно переворачивать files и ranks вместе с матрицей
      // (как в computer/board.js), чтобы squareName соответствовал реальным координатам
      const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
      
      // Для squareName: переворачиваем вместе с матрицей (как в computer)
      const filesForSquareName = isFlipped ? [...FILES].reverse() : FILES;
      const ranksForSquareName = isFlipped ? [...RANKS].reverse() : RANKS;
      
      // Для отображения координат на экране (визуальные метки)
      const displayFiles = isFlipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const displayRanksForCoords = ['8', '7', '6', '5', '4', '3', '2', '1'];

      // Получаем легальные ходы для текущей позиции (нужно для делегирования событий)
      let movesByFrom = new Map();
      
      if (window.ChessMoveUtils && !TasksState.isPuzzleSolved && !TasksState.isPuzzleFailed) {
        const moveUtils = window.ChessMoveUtils;
        // Конвертируем формат цвета: 'w'/'b' -> 'white'/'black'
        const colorForMoveGen = activeColor === 'w' ? 'white' : 'black';
        
        // Оптимизация памяти: используем кеш для позиций
        const cacheKey = `${TasksState.currentFEN}|${colorForMoveGen}|legal`;
        let cachedResult = TasksState.positionCache?.get(cacheKey);
        
        if (!cachedResult || !cachedResult.legalMovesByFrom) {
          // Используем предгенерацию легальных ходов
          if (moveUtils.generateLegalMoves) {
            const result = moveUtils.generateLegalMoves(TasksState.currentFEN, colorForMoveGen);
            cachedResult = result;
            
            // Сохраняем полный результат в кеш
            if (TasksState.positionCache) {
              if (TasksState.positionCache.size >= 50) {
                const firstKey = TasksState.positionCache.keys().next().value;
                if (firstKey) TasksState.positionCache.delete(firstKey);
              }
              TasksState.positionCache.set(cacheKey, result);
              // Также сохраняем с обычным ключом для обратной совместимости
              TasksState.positionCache.set(`${TasksState.currentFEN}|${colorForMoveGen}`, result.legalMovesByFrom || result.movesByFrom || new Map());
            }
          } else {
            // Fallback: генерируем обычные ходы
          const { movesByFrom: movesMap } = moveUtils.generateMoves(TasksState.currentFEN, colorForMoveGen);
            cachedResult = { legalMovesByFrom: movesMap, movesByFrom: movesMap };
          if (TasksState.positionCache) {
            if (TasksState.positionCache.size >= 50) {
              const firstKey = TasksState.positionCache.keys().next().value;
                if (firstKey) TasksState.positionCache.delete(firstKey);
            }
              TasksState.positionCache.set(cacheKey, cachedResult);
              TasksState.positionCache.set(`${TasksState.currentFEN}|${colorForMoveGen}`, movesMap);
            }
          }
        }
        
        movesByFrom = cachedResult.legalMovesByFrom || cachedResult.movesByFrom || new Map();
      }
      
      // BoardCore уже определен на уровне модуля
      
      // Обработка клика на квадрат (как в computer)
      function handleSquareClick(squareName) {
        if (TasksState.isPuzzleSolved || TasksState.isPuzzleFailed || !TasksState.currentFEN) {
          return;
        }

        // Используем предгенерированные ходы
        const normalizedSquare = squareName.toLowerCase();
        const selectedSquare = TasksState.selectedSquare;
        const availableTargets = TasksState.availableTargets || new Set();

        // Сценарий A: Уже выбрана фигура, клик на целевую клетку
        if (selectedSquare && availableTargets.has(normalizedSquare)) {
          if (window.TasksMoves && window.TasksMoves.handleSquareClick) {
            window.TasksMoves.handleSquareClick(squareName);
          }
          return;
        }

        // Сценарий B: Клик на уже выбранную фигуру (отмена выбора)
        if (selectedSquare === normalizedSquare) {
          if (window.TasksMoves && window.TasksMoves.clearSelection) {
            window.TasksMoves.clearSelection();
          }
          return;
        }

        // Сценарий C: Выбор новой фигуры - используем предгенерированные ходы
        const legalMoves = movesByFrom.get(normalizedSquare);
        
        if (!legalMoves || (Array.isArray(legalMoves) ? legalMoves.length === 0 : legalMoves.size === 0)) {
          // Нет ходов - сбрасываем выбор
          if (window.TasksMoves && window.TasksMoves.clearSelection) {
            window.TasksMoves.clearSelection();
          }
          return;
        }

        // Сценарий D: Обновляем выбор с предгенерированными ходами
        const legalMovesArray = Array.isArray(legalMoves) ? legalMoves : Array.from(legalMoves);
        const newTargets = new Set(legalMovesArray.map(m => {
          const uci = typeof m === 'string' ? m : m.uci || '';
          return uci.slice(2, 4).toLowerCase();
        }));

        // Используем общий модуль для обновления выбора (как в computer)
        if (BoardCore && BoardCore.updateSelection) {
          BoardCore.updateSelection({
            state: TasksState,
            square: normalizedSquare,
            targets: newTargets,
            getFen: () => TasksState.currentFEN,
            utils: window.ChessMoveUtils,
          });
        } else {
          // Fallback
          TasksState.selectedSquare = normalizedSquare;
          TasksState.availableTargets = newTargets;
          window.TasksBoard.renderBoard();
        }
      }

      // Создаем перевернутую матрицу доски, если нужно
      // Используем общую функцию из ChessBoardCore, если доступна
      let displayBoard = TasksState.board;
      if (isFlipped && BoardCore && BoardCore.getOrientedMatrix) {
        displayBoard = BoardCore.getOrientedMatrix([...TasksState.board], 'black');
      } else if (isFlipped) {
        // Fallback для обратной совместимости
        displayBoard = [...TasksState.board].reverse().map((row) => [...row].reverse());
      }

      // Используем базовую функцию рендеринга
      if (BoardCore && BoardCore.renderBoardBase) {
        // Преобразуем displayBoard в формат, который ожидает renderBoardBase
        // renderBoardBase ожидает matrix[rank][file], где rank идет сверху вниз
        const matrix = displayBoard;
        
        // ВАЖНО: Для squareName переворачиваем files и ranks вместе с матрицей
        // (как в computer/board.js), чтобы squareName соответствовал реальным координатам
        const files = filesForSquareName;
        const ranks = ranksForSquareName;

        BoardCore.renderBoardBase({
          boardEl: grid,
          matrix,
          files,
          ranks,
          state: TasksState,
          getPieceSVG: (pieceStr) => window.getPieceSVG?.(pieceStr) || null,
          onSquareClick: (!TasksState.isPuzzleSolved && !TasksState.isPuzzleFailed) ? handleSquareClick : null, // Используем прямой обработчик как в computer
          options: {
            selectedSquare: TasksState.selectedSquare,
            availableTargets: TasksState.availableTargets,
            highlightSet: new Set(),
            baseBoard: window.ChessMoveUtils ? window.ChessMoveUtils.parseFen(TasksState.currentFEN).board : null,
            showCoordinates: true,
            ranksForCoords: displayRanksForCoords, // Отдельный массив для координат
            isFlipped: isFlipped, // Передаем флаг перевернутой доски
            customClasses: {
              // Добавляем класс clickable для всех квадратов, если задача не решена/не провалена
              square: (!TasksState.isPuzzleSolved && !TasksState.isPuzzleFailed) ? 'clickable' : '',
            },
            customPieceClasses: {},
            pieceCheckCallback: null,
          },
        });
        
        // Добавляем курсор для кликабельных квадратов (как в computer)
        if (!TasksState.isPuzzleSolved && !TasksState.isPuzzleFailed) {
          const squares = grid.querySelectorAll('.square');
          squares.forEach(square => {
            square.style.cursor = 'pointer';
          });
        }

        // Добавляем дополнительные обработки после рендеринга
        displayBoard.forEach((row, rowIdx) => {
          row.forEach((piece, colIdx) => {
            const realRowIdx = isFlipped ? 7 - rowIdx : rowIdx;
            const realColIdx = colIdx;
            const squareName = window.TasksBoard.getSquareName(realRowIdx, realColIdx);
            const square = grid.querySelector(`[data-square="${squareName}"]`);
            
            if (!square) {
              return;
            }

            // Подсветка неверного хода (красным)
            if (square.classList.contains('invalid-move')) {
              square.style.backgroundColor = 'rgba(220, 38, 38, 0.3)';
              square.style.boxShadow = 'inset 0 0 0 3px rgba(220, 38, 38, 0.8)';
            }

            // Координаты уже добавлены правильно в renderBoardBase, ничего не нужно исправлять
          });
        });
      } else {
        // Fallback: старая логика
        grid.innerHTML = '';
        
        if (BoardCore) {
          BoardCore.clearSquareElementsCache(TasksState);
        }

      displayBoard.forEach((row, rowIdx) => {
        row.forEach((piece, colIdx) => {
          // ВАЖНО: displayBoard уже перевернута (и строки, и элементы в строках)
          // Поэтому нужно инвертировать индексы для получения реальных координат
          const realRowIdx = isFlipped ? 7 - rowIdx : rowIdx;
          const realColIdx = isFlipped ? 7 - colIdx : colIdx;
          
          const isLight = (realRowIdx + realColIdx) % 2 === 0;
          const squareName = window.TasksBoard.getSquareName(realRowIdx, realColIdx);
          const square = document.createElement('div');
          square.className = `square ${isLight ? 'light' : 'dark'}`;
          square.dataset.square = squareName;

            if (BoardCore) {
              BoardCore.registerSquareElement(TasksState, squareName, square);
            }

            // НЕ подсвечиваем выбранную фигуру - подсвечиваем только возможные ходы
            // if (TasksState.selectedSquare === squareName) {
            //   square.classList.add('selected-user');
            // }

          if (TasksState.selectedSquare && TasksState.availableTargets.has(squareName)) {
            square.classList.add('legal-target');
            const indicator = document.createElement('div');
            indicator.className = 'legal-move-indicator';
            square.appendChild(indicator);
          }

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

          // Добавляем координаты (файлы внизу, ранги слева)
          const isBottomRow = rowIdx === displayBoard.length - 1;
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
            // rowIdx идет от 0 (верх displayBoard) до 7 (низ displayBoard)
            // displayRanksForCoords = ['8', '7', '6', '5', '4', '3', '2', '1']
            // Когда isFlipped = false (белые внизу): rowIdx=7 (низ) должен показывать '1' → displayRanksForCoords[7] = '1'
            // Когда isFlipped = true (черные внизу): rowIdx=7 (низ) должен показывать '8' → displayRanksForCoords[0] = '8'
            // ИСПРАВЛЕНО: логика была перевернута!
            if (!isFlipped) {
              // Когда белые внизу: прямой индекс
              rankCoord.textContent = displayRanksForCoords[rowIdx];
            } else {
              // Когда черные внизу: инвертируем индекс
              rankCoord.textContent = displayRanksForCoords[displayRanksForCoords.length - 1 - rowIdx];
            }
            square.appendChild(rankCoord);
          }

          if (!TasksState.isPuzzleSolved && !TasksState.isPuzzleFailed) {
            const realPiece = TasksState.board[realRowIdx][realColIdx];
            const pieceColor = window.TasksBoard.getPieceColor(realPiece);
            const isUserPiece = pieceColor === activeColor;
            
            // Проверяем movesByFrom с разными вариантами регистра
            const squareNameLower = squareName.toLowerCase();
            const squareNameUpper = squareName.toUpperCase();
            const hasMoves = movesByFrom.has(squareNameLower) || movesByFrom.has(squareNameUpper) || movesByFrom.has(squareName);
            
            // Если выбрана фигура, кликабельными должны быть только целевые квадраты
            const isTargetForSelected = TasksState.selectedSquare && 
                                       TasksState.availableTargets && 
                                       TasksState.availableTargets.has(squareName);
            
            // Квадрат кликабелен, если:
            // 1. Это фигура активного игрока с возможными ходами ИЛИ
            // 2. Это целевой квадрат для выбранной фигуры
            const shouldBeClickable = (isUserPiece && hasMoves) || isTargetForSelected;
            
            if (shouldBeClickable) {
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
      }
    },
  };
  
})();

