(() => {
  const TasksConstants = window.TasksConstants;
  const TasksState = window.TasksState;
  const BoardCore = window.ChessBoardCore; // Общий модуль для работы с доской
  
  if (!TasksConstants || !TasksState) {
    throw new Error('Required modules not loaded. Ensure tasks/constants.js and tasks/state.js are included first.');
  }

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
      if (!utils?.pieceColor) throw new Error('ChessMoveUtils is not initialized');
      const color = utils.pieceColor(piece);
      return color === 'white' ? 'w' : color === 'black' ? 'b' : null;
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
      const displayRanksForCoords = ['8', '7', '6', '5', '4', '3', '2', '1'];

      function handleSquareClick(squareName) {
        if (!window.TasksMoves || typeof window.TasksMoves.handleSquareClick !== 'function') {
          throw new Error('TasksMoves module is not initialized');
        }
        window.TasksMoves.handleSquareClick(squareName);
      }

      // Создаем перевернутую матрицу доски, если нужно
      // Используем общую функцию из ChessBoardCore, если доступна
      if (!BoardCore?.getOrientedMatrix || !BoardCore?.renderBoardBase) {
        throw new Error('ChessBoardCore is not initialized');
      }
      const displayBoard = isFlipped
        ? BoardCore.getOrientedMatrix([...TasksState.board], 'black')
        : TasksState.board;

      // Используем базовую функцию рендеринга
      {
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
          getPieceSVG: window.getPieceSVG,
          onSquareClick: (!TasksState.isPuzzleSolved && !TasksState.isPuzzleFailed) ? handleSquareClick : null, // Используем прямой обработчик как в computer
          options: {
            selectedSquare: TasksState.selectedSquare,
            availableTargets: TasksState.availableTargets,
            highlightSet: new Set(),
            baseBoard: window.ChessMoveUtils.parseFen(TasksState.currentFEN).board,
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
      }
    },
  };
  
})();
