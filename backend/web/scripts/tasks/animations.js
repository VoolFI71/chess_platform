(() => {
  const TasksState = window.TasksState;
  
  if (!TasksState) {
    throw new Error('TasksState module is not loaded. Ensure tasks/state.js is included first.');
  }

  window.TasksAnimations = {
    animatePieceMove(from, to) {
      const grid = document.getElementById('boardGrid');
      if (!grid) return;
      
      const fromSquare = grid.querySelector(`[data-square="${from}"]`);
      const toSquare = grid.querySelector(`[data-square="${to}"]`);
      
      if (!fromSquare || !toSquare) return;
      
      const piece = fromSquare.querySelector('.piece');
      if (!piece) return;
      
      // Получаем координаты для плавной анимации
      const fromRect = fromSquare.getBoundingClientRect();
      const toRect = toSquare.getBoundingClientRect();
      const boardRect = grid.getBoundingClientRect();
      
      const deltaX = toRect.left - fromRect.left;
      const deltaY = toRect.top - fromRect.top;
      
      // Сохраняем исходное положение
      const originalTransform = piece.style.transform || '';
      
      // Применяем анимацию перемещения
      piece.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      piece.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.1)`;
      piece.classList.add('piece-moving');
      
      window.TasksUtils.createTimer(() => {
        if (piece && piece.parentNode) {
          piece.style.transform = originalTransform;
          piece.style.transition = '';
          piece.classList.remove('piece-moving');
        }
      }, 400);
    },

    highlightInvalidMove(squareName) {
      const grid = document.getElementById('boardGrid');
      if (!grid) return;
      
      const square = grid.querySelector(`[data-square="${squareName}"]`);
      if (square) {
        square.classList.add('invalid-move');
        square.style.backgroundColor = 'rgba(220, 38, 38, 0.4)';
        square.style.boxShadow = 'inset 0 0 0 3px rgba(220, 38, 38, 0.9)';
        
        window.TasksUtils.createTimer(() => {
          if (square && square.parentNode) {
            square.classList.remove('invalid-move');
            square.style.backgroundColor = '';
            square.style.boxShadow = '';
          }
        }, 1000);
      }
    },
  };
})();

