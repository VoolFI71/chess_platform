// Анимация шахматной доски в Hero section
(() => {
  const DEMO_GAME = [
    { from: 'e2', to: 'e4', delay: 0 },
    { from: 'e7', to: 'e5', delay: 1200 },
    { from: 'd1', to: 'h5', delay: 2400 },
    { from: 'b8', to: 'c6', delay: 3600 },
    { from: 'f1', to: 'c4', delay: 4800 },
    { from: 'g8', to: 'f6', delay: 6000 },
    { from: 'h5', to: 'f7', delay: 7200 , highlight: true }, // Мат!
  ];

  const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  let currentMoveIndex = 0;
  let animationTimeout = null;
  let currentFen = INITIAL_FEN;

  function parseFen(fen) {
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
    const board = [];
    
    for (const row of rows) {
      const boardRow = [];
      for (const char of row) {
        if (char >= '1' && char <= '8') {
          for (let i = 0; i < parseInt(char); i++) {
            boardRow.push('');
          }
        } else {
          boardRow.push(char);
        }
      }
      board.push(boardRow);
    }
    return board;
  }

  function renderHeroBoard(fen = INITIAL_FEN, highlightSquares = []) {
    const boardEl = document.getElementById('heroChessboard');
    if (!boardEl) return;

    const board = parseFen(fen);

    boardEl.innerHTML = '';
    
    board.forEach((row, rIdx) => {
      row.forEach((piece, cIdx) => {
        const square = document.createElement('div');
        const isLight = (rIdx + cIdx) % 2 === 0;
        square.className = `hero-square ${isLight ? 'light' : 'dark'}`;
        
        const file = String.fromCharCode(97 + cIdx);
        const rank = 8 - rIdx;
        const squareName = `${file}${rank}`;
        
        if (highlightSquares.includes(squareName)) {
          square.classList.add('highlighted');
        }
        
        if (piece) {
          const pieceEl = document.createElement('span');
          pieceEl.className = 'hero-piece';
          
          if (typeof window.getPieceSVG !== 'function') {
            throw new Error('Piece SVG renderer is not initialized');
          }
          pieceEl.innerHTML = window.getPieceSVG(piece);
          
          square.appendChild(pieceEl);
        }
        
        boardEl.appendChild(square);
      });
    });
  }

  function applyMove(fen, from, to) {
    // Упрощенная логика применения хода (без валидации)
    const board = parseFen(fen);
    const fromFile = from.charCodeAt(0) - 97;
    const fromRank = 8 - parseInt(from[1]);
    const toFile = to.charCodeAt(0) - 97;
    const toRank = 8 - parseInt(to[1]);
    
    const piece = board[fromRank][fromFile];
    board[fromRank][fromFile] = '';
    board[toRank][toFile] = piece;
    
    // Конвертируем обратно в FEN (упрощенно)
    const fenRows = board.map(row => {
      let fenRow = '';
      let emptyCount = 0;
      for (const sq of row) {
        if (sq === '') {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            fenRow += emptyCount;
            emptyCount = 0;
          }
          fenRow += sq;
        }
      }
      if (emptyCount > 0) fenRow += emptyCount;
      return fenRow;
    }).join('/');
    
    // Упрощенно - не меняем остальные части FEN
    return `${fenRows} w KQkq - 0 1`;
  }

  function playNextMove() {
    if (currentMoveIndex >= DEMO_GAME.length) {
      // Партия закончена, ждем 3 секунды и начинаем заново
      animationTimeout = setTimeout(() => {
        currentMoveIndex = 0;
        currentFen = INITIAL_FEN;
        renderHeroBoard(currentFen);
        playNextMove();
      }, 3000);
      return;
    }

    const move = DEMO_GAME[currentMoveIndex];
    
    // Применяем ход
    currentFen = applyMove(currentFen, move.from, move.to);
    
    // Рендерим с подсветкой
    const highlightSquares = move.highlight ? [move.from, move.to] : [];
    renderHeroBoard(currentFen, highlightSquares);
    
    currentMoveIndex++;
    
    // Планируем следующий ход
    const nextMove = DEMO_GAME[currentMoveIndex];
    const delay = nextMove ? nextMove.delay - move.delay : 1200;
    animationTimeout = setTimeout(playNextMove, delay);
  }

  function startHeroAnimation() {
    const boardEl = document.getElementById('heroChessboard');
    if (!boardEl) return;

    // Отключаем анимацию на мобильных устройствах для производительности
    const isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Проверяем prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    currentMoveIndex = 0;
    currentFen = INITIAL_FEN;
    renderHeroBoard(currentFen);
    
    // Не запускаем анимацию на мобильных или если пользователь предпочитает отключенные анимации
    if (isMobile || prefersReducedMotion) {
      return;
    }
    
    // Начинаем через 2 секунды после загрузки
    setTimeout(() => {
      playNextMove();
    }, 2000);
  }

  function stopHeroAnimation() {
    if (animationTimeout) {
      clearTimeout(animationTimeout);
      animationTimeout = null;
    }
  }

  // Запускаем при загрузке страницы
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startHeroAnimation);
  } else {
    startHeroAnimation();
  }

  // Останавливаем при уходе со страницы
  window.addEventListener('beforeunload', stopHeroAnimation);
  
  window.HeroAnimation = {
    start: startHeroAnimation,
    stop: stopHeroAnimation,
  };
})();

