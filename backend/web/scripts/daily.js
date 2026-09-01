(() => {
  'use strict';

  // Debug logging (disabled by default)
  // Enable with: localStorage.setItem('debug_daily', '1')
  const DEBUG_DAILY = (() => {
    try {
      return localStorage.getItem('debug_daily') === '1';
    } catch {
      return false;
    }
  })();

  function debugLog(...args) {
    if (!DEBUG_DAILY) return;
    // eslint-disable-next-line no-console
    console.log(...args);
  }

  // Audio context для звуков
  let audioContext = null;

  // Функция для инициализации audio context
  function ensureAudioContext() {
    if (audioContext === false) return null;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      audioContext = false;
      return null;
    }
    if (!audioContext) {
      try {
        audioContext = new AudioContext();
      } catch (err) {
        audioContext = false;
        return null;
      }
    }
    const ctx = audioContext;
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
    return ctx || null;
  }

  // Функция для воспроизведения тона
  function playTone(frequency, options = {}) {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const {
      duration = 0.18,
      type = 'sine',
      volume = 0.12,
      delay = 0,
    } = options;

    const startTime = ctx.currentTime + Math.max(0, delay);
    const stopTime = startTime + Math.max(0.05, duration);

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gainNode.gain.setValueAtTime(Math.max(0.0001, volume), startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(startTime);
    oscillator.stop(stopTime + 0.01);
  }

  // Функция для воспроизведения звука
  function playSound(kind) {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    if (kind === 'success') {
      // Верный ход - приятный звук
      playTone(880, { duration: 0.12, type: 'sine', volume: 0.14 });
      playTone(1180, { duration: 0.12, type: 'sine', volume: 0.10, delay: 0.08 });
    } else if (kind === 'error') {
      // Неверный ход - низкий звук
      playTone(300, { duration: 0.18, type: 'sawtooth', volume: 0.16 });
      playTone(200, { duration: 0.18, type: 'sawtooth', volume: 0.14, delay: 0.06 });
    } else if (kind === 'capture') {
      // Взятие фигуры - более резкий звук
      playTone(600, { duration: 0.10, type: 'square', volume: 0.18 });
      playTone(800, { duration: 0.10, type: 'square', volume: 0.15, delay: 0.05 });
      playTone(1000, { duration: 0.10, type: 'square', volume: 0.12, delay: 0.10 });
    }
  }

  // State для задачи дня
  const state = {
    puzzle: null,
    currentFEN: null,
    initialFEN: null,
    board: [],
    solutionVisible: false,
    countdownTimer: null,
    userMoves: [],
    currentMoveIndex: 0, // Индекс текущего хода игрока (0 = первый ход игрока будет в moves[1])
    selectedSquare: null, // Выбранная клетка
    availableTargets: new Set(), // Доступные цели для выбранной фигуры
    isPuzzleSolved: false,
    isPuzzleFailed: false,
    isPuzzleSolvedByUser: false, // Решена ли задача пользователем сегодня
    positionCache: new Map(), // Кеш для позиций и ходов
    playerColor: null, // Цвет игрока ('white' или 'black')
    playerColorForMoveGen: null, // Цвет игрока для генерации ходов ('w' или 'b')
  };


// Submit daily puzzle solution
async function submitDailySolution() {
  try {
    const http = window.App?.Http;
    if (!http || typeof http.apiFetch !== 'function') {
      throw new Error('App.Http is not initialized');
    }

    const res = await http.apiFetch('/api/puzzles/daily/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (res.ok) {
      const data = await res.json();
      state.isPuzzleSolvedByUser = true;
      
      // Обновляем счетчик решенных задач
      const solvedCountEl = document.getElementById('todaySolvedCount');
      if (solvedCountEl) {
        const currentCount = parseInt(solvedCountEl.textContent) || 0;
        solvedCountEl.textContent = currentCount + 1;
      }
      
      debugLog('Daily puzzle solution submitted successfully');
    } else if (res.status === 409) {
      // Задача уже решена
      const data = await res.json().catch(() => ({}));
      debugLog('Daily puzzle already solved:', data.detail);
      state.isPuzzleSolvedByUser = true;
    } else if (res.status === 401) {
      // Пользователь не авторизован - это нормально для гостей
      debugLog('User not authenticated, skipping solution submission');
    } else {
      console.error('Failed to submit daily solution:', res.status);
    }
  } catch (e) {
    console.error('Error submitting daily solution:', e);
  }
}

// Submit user's moves as an attempt to the daily puzzle
async function submitUserAttempt(success) {
  if (!state.puzzle) {
    // No puzzle loaded
    return;
  }
  const timeSpentMs = state.puzzleStartTime ? Math.max(100, Date.now() - state.puzzleStartTime) : null;
  
  // Формируем список ходов: первый ход противника + ходы игрока
  // Логика аналогична tasks: moves[0] - противник, moves[1] - игрок, moves[2] - противник, и т.д.
  let movesPlayed = [];
  const correctMoves = state.puzzle.moves || [];
  
  if (success && correctMoves.length > 0) {
    // Если задача решена успешно, отправляем все ходы до момента решения
    // completedPlayerMoves - количество выполненных ходов игрока
    const completedPlayerMoves = state.currentMoveIndex;
    // lastMoveIndex - индекс последнего хода в последовательности (включая ходы противника и игрока)
    // Если игрок сделал 1 ход: lastMoveIndex = (1 * 2) - 1 = 1 (moves[0] противник, moves[1] игрок)
    const lastMoveIndex = completedPlayerMoves > 0 ? (completedPlayerMoves * 2) - 1 : -1;
    if (lastMoveIndex >= 0 && lastMoveIndex < correctMoves.length) {
      movesPlayed = correctMoves.slice(0, lastMoveIndex + 1);
    } else {
      throw new Error('Daily puzzle move index is inconsistent with the solution');
    }
  } else {
    // Если задача не решена, отправляем первый ход противника + ходы пользователя
    if (correctMoves.length > 0) {
      movesPlayed = [correctMoves[0]];
    }
    movesPlayed = movesPlayed.concat(state.userMoves);
  }
  
  const payload = {
    puzzle_id: state.puzzle.puzzle_id,
    mode: "survival",
    success: !!success,
    time_spent_ms: timeSpentMs,
    moves_played: movesPlayed.length > 0 ? movesPlayed : null,
  };

  try {
    const res = await window.TasksAPI.authorizedFetch("/puzzles/attempts/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const dailyStatusEl = document.getElementById('dailySubmissionStatus');
    if (res.ok) {
      // Reset moves on success to allow another attempt in future
      state.userMoves = [];
      if (dailyStatusEl) dailyStatusEl.textContent = "Попытка отправлена успешно.";
    } else {
      const data = await res.json().catch(() => ({}));
      if (dailyStatusEl) dailyStatusEl.textContent = data.detail || "Ошибка отправки попытки.";
    }
  } catch (e) {
    const dailyStatusEl = document.getElementById('dailySubmissionStatus');
    if (dailyStatusEl) dailyStatusEl.textContent = "Сетевой сбой при отправке попытки.";
  } finally {
    const dailyStatusEl = document.getElementById('dailySubmissionStatus');
    if (dailyStatusEl) dailyStatusEl.classList.remove('hidden');
  }
}

  // Загрузка темы
  function loadTheme() {
    try {
      const saved = localStorage.getItem('theme');
      const isDark = saved === 'dark';
      document.body.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('dark', isDark);
      const icon = document.getElementById('themeIcon');
      if (icon) {
        icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
      }
    } catch {}
  }

  // Toggle темы
  window.toggleTheme = function() {
    const isDark = document.body.classList.contains('dark');
    const newIsDark = !isDark;
    document.body.classList.toggle('dark', newIsDark);
    document.documentElement.classList.toggle('dark', newIsDark);
    try {
      localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
    } catch {}
    const icon = document.getElementById('themeIcon');
    if (icon) {
      icon.className = newIsDark ? 'fas fa-moon' : 'fas fa-sun';
    }
  };

  // Форматирование даты
  function formatDate(dateStr) {
    try {
      const date = new Date(dateStr + 'T00:00:00Z');
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      return date.toLocaleDateString('ru-RU', options);
    } catch {
      return dateStr;
    }
  }

  // Обновление счетчика до следующей задачи
  function updateCountdown() {
    const countdownEl = document.getElementById('nextPuzzleCountdown');
    if (!countdownEl) return;

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    const diff = tomorrow - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    countdownEl.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Применение хода противника с задержкой и анимацией
  function applyOpponentMove(uci) {
    if (!state.currentFEN || !uci) {
      debugLog('applyOpponentMove: early return', { currentFEN: state.currentFEN, uci });
      return;
    }
    
    debugLog('applyOpponentMove: applying move', uci, 'to FEN', state.currentFEN);
    const result = applyMoveToBoard(uci);
    debugLog('applyOpponentMove: result', result, 'new FEN', state.currentFEN);
    
    if (result.success) {
      // Задержка перед рендерингом доски для плавной анимации
      setTimeout(() => {
        debugLog('applyOpponentMove: rendering board with FEN', state.currentFEN);
        renderBoard();
      }, 100);
    } else {
      console.error('applyOpponentMove: failed to apply move', uci, result);
    }
  }

  // Применение хода к доске (упрощенная версия из tasks/moves.js)
  // Возвращает объект { success: boolean, isCapture: boolean }
  function applyMoveToBoard(uci) {
    if (!state.currentFEN || !window.ChessMoveUtils) {
      debugLog('applyMoveToBoard: early return - no FEN or utils', { currentFEN: state.currentFEN });
      return { success: false, isCapture: false };
    }
    
    const utils = window.ChessMoveUtils;
    const fenParts = state.currentFEN.split(' ');
    const activeColor = fenParts[1] || 'w';
    const color = activeColor === 'w' ? 'white' : 'black';
    
    debugLog('applyMoveToBoard: checking move', uci, 'for color', color, 'in FEN', state.currentFEN);
    if (!utils.isMoveAllowed(state.currentFEN, color, uci)) {
      debugLog('applyMoveToBoard: move not allowed', uci);
      return { success: false, isCapture: false };
    }
    
    const from = uci.slice(0, 2).toLowerCase();
    const to = uci.slice(2, 4).toLowerCase();
    const promotion = uci.length > 4 ? uci.slice(4, 5).toLowerCase() : null;
    
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const fromFile = files.indexOf(from[0]);
    const fromRank = 8 - parseInt(from[1], 10);
    const toFile = files.indexOf(to[0]);
    const toRank = 8 - parseInt(to[1], 10);
    
    if (fromFile === -1 || fromRank < 0 || fromRank > 7 || toFile === -1 || toRank < 0 || toRank > 7) {
      return { success: false, isCapture: false };
    }
    
    const piece = state.board[fromRank][fromFile];
    if (!piece) return { success: false, isCapture: false };
    
    // Проверяем, было ли взятие фигуры (до хода)
    const targetPiece = state.board[toRank][toFile];
    let isCapture = false;
    if (targetPiece && targetPiece !== '') {
      // Проверяем, что это фигура противника
      const targetIsWhite = targetPiece === targetPiece.toUpperCase();
      const movingIsWhite = piece === piece.toUpperCase();
      if (targetIsWhite !== movingIsWhite) {
        isCapture = true;
      }
    }
    
    // Проверяем взятие на проходе
    let isEnPassant = false;
    if (piece.toLowerCase() === 'p' && fenParts[3] && fenParts[3] !== '-') {
      const enPassantSquare = fenParts[3];
      const enPassantFile = files.indexOf(enPassantSquare[0]);
      const enPassantRank = 8 - parseInt(enPassantSquare[1], 10);
      if (toFile === enPassantFile && toRank === enPassantRank) {
        isEnPassant = true;
        isCapture = true; // Взятие на проходе тоже считается взятием
      }
    }
    
    let pieceToMove = piece;
    if (promotion && piece.toLowerCase() === 'p') {
      pieceToMove = activeColor === 'w' ? promotion.toUpperCase() : promotion.toLowerCase();
    }
    
    state.board[fromRank][fromFile] = '';
    state.board[toRank][toFile] = pieceToMove;
    
    // Обработка взятия на проходе
    if (isEnPassant) {
      const capturedPawnRank = fromRank;
      state.board[capturedPawnRank][toFile] = '';
    }
    
    // Обработка рокировки
    if (piece.toLowerCase() === 'k' && Math.abs(fromFile - toFile) === 2) {
      if (toFile === 6) {
        const rookFromFile = 7;
        const rookToFile = 5;
        const rook = state.board[fromRank][rookFromFile];
        state.board[fromRank][rookFromFile] = '';
        state.board[fromRank][rookToFile] = rook;
      } else if (toFile === 2) {
        const rookFromFile = 0;
        const rookToFile = 3;
        const rook = state.board[fromRank][rookFromFile];
        state.board[fromRank][rookFromFile] = '';
        state.board[fromRank][rookToFile] = rook;
      }
    }
    
    // Обновляем FEN
    const newActiveColor = activeColor === 'w' ? 'b' : 'w';
    const placement = state.board.map(row => {
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
    
    // Упрощенное обновление castling rights и en passant
    let castlingRights = fenParts[2] || '-';
    if (piece.toLowerCase() === 'k') {
      if (activeColor === 'w') {
        castlingRights = castlingRights.replace(/[KQ]/g, '');
      } else {
        castlingRights = castlingRights.replace(/[kq]/g, '');
      }
      if (castlingRights === '') castlingRights = '-';
    }
    
    let enPassantSquare = '-';
    if (piece.toLowerCase() === 'p') {
      const pawnStartRank = activeColor === 'w' ? 6 : 1;
      const pawnEndRank = activeColor === 'w' ? 4 : 3;
      if (fromRank === pawnStartRank && toRank === pawnEndRank) {
        const enPassantFile = files[toFile];
        const enPassantRank = activeColor === 'w' ? '6' : '3';
        enPassantSquare = enPassantFile + enPassantRank;
      }
    }
    
    const halfmoveClock = piece.toLowerCase() === 'p' || (state.board[toRank][toFile] && state.board[toRank][toFile] !== '') ? 0 : (parseInt(fenParts[4] || '0', 10) + 1);
    const fullmoveNumber = activeColor === 'b' ? (parseInt(fenParts[5] || '1', 10) + 1) : parseInt(fenParts[5] || '1', 10);
    
    state.currentFEN = `${placement} ${newActiveColor} ${castlingRights} ${enPassantSquare} ${halfmoveClock} ${fullmoveNumber}`;
    
    return { success: true, isCapture };
  }

  // Обработка клика на клетку доски
  const getDailyLegalMovesByFrom = window.ChessGameController.createLegalMoveCache({
    state,
    getFen: () => state.currentFEN,
    getPlayerColor: () => {
      if (!state.playerColor) throw new Error('Daily player color is not initialized');
      return state.playerColor;
    },
  });

  const dailyController = window.ChessGameController.create({
    state,
    getFen: () => state.currentFEN,
    getLegalMovesByFrom: getDailyLegalMovesByFrom,
    getPlayerColor: () => {
      if (!state.playerColor) throw new Error('Daily player color is not initialized');
      return state.playerColor;
    },
    isInteractive: () => {
      if (state.isPuzzleSolved || state.isPuzzleFailed || !state.currentFEN) {
        return false;
      }
      const activeColor = state.currentFEN.split(' ')[1];
      if (!state.playerColorForMoveGen) {
        throw new Error('Daily player move color is not initialized');
      }
      return activeColor === state.playerColorForMoveGen;
    },
    canSelectPiece: (piece) => {
      if (!state.playerColor) throw new Error('Daily player color is not initialized');
      return window.ChessMoveUtils.pieceColor(piece) === state.playerColor;
    },
    onMove: (from, to, uci) => executeMove(from, to, uci),
  });

  function handleSquareClick(squareName) {
    debugLog('handleSquareClick called:', squareName);
    dailyController.handleSquareClick(squareName);
  }

  function clearSelection() {
    dailyController.clearSelection();
  }

  // Выполнение хода
  function executeMove(fromSquare, toSquare, uciStr) {
    debugLog('executeMove called:', { fromSquare, toSquare, uci: uciStr });

    const fromLower = fromSquare.toLowerCase();
    const toLower = toSquare.toLowerCase();
    if (typeof uciStr !== 'string' || uciStr.length < 4 ||
        uciStr.slice(0, 2).toLowerCase() !== fromLower ||
        uciStr.slice(2, 4).toLowerCase() !== toLower) {
      throw new Error('Controller returned an invalid move');
    }

    debugLog('Applying move:', uciStr);

    // Сохраняем FEN до хода для возможного отката
    const fenBeforeMove = state.currentFEN;
    const boardBeforeMove = state.board ? state.board.map(row => [...row]) : null;

    // Применяем ход игрока мгновенно (без задержки)
    const moveResult = applyMoveToBoard(uciStr);
    if (moveResult.success) {
      debugLog('Move applied successfully');
      // Сразу очищаем выбор перед рендерингом доски
      state.selectedSquare = null;
      state.availableTargets = new Set();
      
      // Проверяем правильность хода ДО добавления в userMoves и рендеринга
      const correctMoves = state.puzzle.moves || [];
      const expectedPlayerMoveIndex = state.currentMoveIndex * 2 + 1;

      debugLog('Checking move:', {
        currentMoveIndex: state.currentMoveIndex,
        expectedPlayerMoveIndex,
        correctMovesLength: correctMoves.length,
        userMove: uciStr,
        expectedMove: correctMoves[expectedPlayerMoveIndex],
        allMoves: correctMoves
      });

      if (expectedPlayerMoveIndex < correctMoves.length) {
        const expectedMove = correctMoves[expectedPlayerMoveIndex];
        if (uciStr.toLowerCase() === expectedMove.toLowerCase()) {
          // Правильный ход - воспроизводим звук
          playSound('success');
          
          // Правильный ход - добавляем в список и рендерим
          state.userMoves.push(uciStr);
          renderBoard();
          
          debugLog('Move is correct!');
          state.currentMoveIndex++;

          // Проверяем, решена ли задача
          const nextOpponentMoveIndex = state.currentMoveIndex * 2;
          debugLog('Next opponent move index:', nextOpponentMoveIndex, 'Total moves:', correctMoves.length);
          
          if (nextOpponentMoveIndex >= correctMoves.length) {
            // Все ходы сделаны - задача решена
            debugLog('Puzzle solved!');
            state.isPuzzleSolved = true;
            
            // Отправляем решение на сервер (только если еще не решена пользователем)
            if (!state.isPuzzleSolvedByUser) {
              submitDailySolution();
            }
            
            const statusEl = document.getElementById('dailySubmissionStatus');
            if (statusEl) {
              statusEl.textContent = 'Отлично! Задача решена правильно!';
              statusEl.classList.remove('hidden');
            }
          } else {
            // Применяем следующий ход противника с задержкой (как в tasks)
            const nextOpponentMove = correctMoves[nextOpponentMoveIndex];
            debugLog('Applying opponent move:', nextOpponentMove, 'after 500ms delay');
            setTimeout(() => {
              applyOpponentMove(nextOpponentMove);
            }, 500);
          }
        } else {
          // Неправильный ход - воспроизводим звук ошибки
          playSound('error');
          
          // Неправильный ход - сбрасываем доску в начальную позицию
          debugLog('Move is incorrect! Expected:', expectedMove, 'Got:', uciStr);
          
          // Сбрасываем в начальную позицию
          state.currentFEN = state.initialFEN;
          state.currentMoveIndex = 0;
          state.userMoves = [];
          
          // Парсим начальный FEN для восстановления доски
          const utils = window.ChessMoveUtils;
          if (utils && state.initialFEN) {
            const parsed = utils.parseFen(state.initialFEN);
            if (parsed && parsed.board) {
              state.board = parsed.board;
            }
          }
          
          // Применяем первый ход противника снова
          const correctMoves = state.puzzle.moves || [];
          if (correctMoves.length > 0) {
            const firstOpponentMove = correctMoves[0];
            const resetResult = applyMoveToBoard(firstOpponentMove);
            if (resetResult.success) {
              // После применения первого хода противника перерисовываем доску
              setTimeout(() => {
                renderBoard();
                // Сбрасываем флаг ошибки после восстановления позиции, чтобы можно было продолжать играть
                state.isPuzzleFailed = false;
              }, 100);
            } else {
              renderBoard();
              state.isPuzzleFailed = false;
            }
          } else {
            renderBoard();
            state.isPuzzleFailed = false;
          }
          
          clearSelection();
          
          const statusEl = document.getElementById('dailySubmissionStatus');
          if (statusEl) {
            statusEl.textContent = 'Неверный ход! Попробуйте снова.';
            statusEl.classList.remove('hidden');
            // Скрываем сообщение через 3 секунды
            setTimeout(() => {
              if (statusEl) {
                statusEl.classList.add('hidden');
              }
            }, 3000);
          }
        }
      } else {
        debugLog('Expected move index out of bounds:', expectedPlayerMoveIndex, '>=', correctMoves.length);
        // Откатываем ход
        state.currentFEN = fenBeforeMove;
        if (boardBeforeMove) {
          state.board = boardBeforeMove;
        }
        clearSelection();
        renderBoard();
      }
    } else {
      clearSelection();
    }
  }

  // Рендеринг доски
  function renderBoard() {
    const boardEl = document.getElementById('dailyBoard');
    if (!boardEl) {
      console.error('renderBoard: board element not found');
      return;
    }
    if (!state.currentFEN) {
      console.error('renderBoard: currentFEN is null');
      return;
    }

    debugLog('renderBoard: rendering with FEN', state.currentFEN);
    const utils = window.ChessMoveUtils;
    if (!utils?.parseFen) throw new Error('ChessMoveUtils is not initialized');

    const parsed = utils.parseFen(state.currentFEN);
    if (!parsed || !parsed.board) {
      console.error('Failed to parse FEN', state.currentFEN);
      return;
    }

    state.board = parsed.board;
    debugLog('renderBoard: board updated, first row', state.board[0]);

    // Создаем матрицу для рендеринга
    const matrix = parsed.board.map(row => [...row]);

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

    // Используем базовую функцию рендеринга из chess-board-core.js
    const BoardCore = window.ChessBoardCore;
    if (!BoardCore?.renderBoardBase) throw new Error('ChessBoardCore is not initialized');
    {
      BoardCore.renderBoardBase({
        boardEl,
        matrix,
        files,
        ranks,
        state: state,
        getPieceSVG: window.getPieceSVG,
        onSquareClick: (!state.isPuzzleSolved && !state.isPuzzleFailed) ? handleSquareClick : null,
        options: {
          selectedSquare: state.selectedSquare,
          availableTargets: state.availableTargets,
          highlightSet: new Set(),
          baseBoard: parsed.board,
          showCoordinates: true,
          customClasses: {
            square: (!state.isPuzzleSolved && !state.isPuzzleFailed) ? 'clickable' : '',
          },
          customPieceClasses: {},
        },
      });

      // Добавляем курсор для кликабельных квадратов
      if (!state.isPuzzleSolved && !state.isPuzzleFailed) {
        const squares = boardEl.querySelectorAll('.square');
        squares.forEach(square => {
          square.style.cursor = 'pointer';
        });
        
        // Проверяем, что обработчик кликов установлен
        debugLog('Board rendered, onSquareClick handler:', handleSquareClick ? 'set' : 'null');
      }
    }
  }


  // Загрузка задачи дня
  async function loadDailyPuzzle() {
    const loadingEl = document.getElementById('puzzleLoading');
    const contentEl = document.getElementById('puzzleContent');
    const errorEl = document.getElementById('puzzleError');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');
    if (errorEl) errorEl.classList.add('hidden');

    try {
      const res = await fetch('/api/puzzles/daily');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      state.puzzle = data;
      state.currentFEN = data.fen;
      state.initialFEN = data.fen;

      // Определяем цвет игрока из начальной позиции
      const initialFenParts = state.currentFEN.split(' ');
      const initialActiveColor = initialFenParts[1] || 'w';
      // Игрок играет за противоположный цвет (если в FEN активный цвет 'w', игрок играет за 'b')
      state.playerColor = initialActiveColor === 'w' ? 'black' : 'white';
      state.playerColorForMoveGen = initialActiveColor === 'w' ? 'b' : 'w';

      // Обновляем информацию
      const dateEl = document.getElementById('dailyDate');
      const ratingEl = document.getElementById('dailyRating');
      const solvedCountEl = document.getElementById('todaySolvedCount');

      if (dateEl && data.date) {
        dateEl.textContent = formatDate(data.date);
      }
      if (ratingEl && data.daily_rating) {
        ratingEl.textContent = data.daily_rating;
      }
      if (solvedCountEl !== null) {
        solvedCountEl.textContent = data.today_solved_count || 0;
      }
      
      // Сохраняем информацию о решении
      state.isPuzzleSolvedByUser = data.is_solved || false;
      
      // Показываем контент сначала, чтобы доска была видима
      if (loadingEl) loadingEl.classList.add('hidden');
      if (contentEl) contentEl.classList.remove('hidden');
      
      // Рендерим доску с начальной позицией
      renderBoard();
      
      // Применяем первый ход противника (moves[0]) если он есть
      const correctMoves = data.moves || [];
      if (correctMoves.length > 0) {
        const firstOpponentMove = correctMoves[0];
        // Устанавливаем индекс в 0 (первый ход игрока будет в moves[1])
        state.currentMoveIndex = 0;
        // Применяем первый ход противника с небольшой задержкой для плавности
        setTimeout(() => {
          debugLog('About to apply first opponent move:', firstOpponentMove, 'to FEN:', state.currentFEN);
          applyOpponentMove(firstOpponentMove);
          // Логируем после вызова, но помним что applyOpponentMove асинхронный
          setTimeout(() => {
            debugLog('After first opponent move, current FEN:', state.currentFEN);
            debugLog('Player color:', state.playerColor, 'Player color for move gen:', state.playerColorForMoveGen);
          }, 200);
        }, 300);
      } else {
        // Если нет ходов, просто устанавливаем индекс
        state.currentMoveIndex = 0;
      }

      // Запускаем счетчик
      updateCountdown();
      if (state.countdownTimer) {
        window.App.Utils.PageLifecycle.clearInterval(state.countdownTimer);
      }
      state.countdownTimer = window.App.Utils.PageLifecycle.setInterval(updateCountdown, 1000);
      // Сброс пользовательских ходов для новой задачи
      state.userMoves = [];
      state.currentMoveIndex = 0;
      state.selectedSquare = null;
      state.availableTargets = new Set();
      state.isPuzzleSolved = false;
      state.isPuzzleFailed = false;
      state.positionCache.clear();
      
      debugLog('Daily puzzle loaded:', {
        puzzleId: state.puzzle?.puzzle_id,
        initialFEN: state.initialFEN,
        currentFEN: state.currentFEN,
        playerColor: state.playerColor,
        playerColorForMoveGen: state.playerColorForMoveGen,
        moves: state.puzzle?.moves?.length || 0
      });
      // Установить время начала решения задачи
      state.puzzleStartTime = Date.now();
    } catch (err) {
      console.error('Failed to load daily puzzle:', err);
      if (loadingEl) loadingEl.classList.add('hidden');
      if (errorEl) errorEl.classList.remove('hidden');
    }
  }

  // Инициализация при загрузке страницы
  document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    const refreshButton = document.getElementById('refreshDailyPuzzle');
    if (!refreshButton) throw new Error('Daily puzzle refresh button is not initialized');
    refreshButton.addEventListener('click', loadDailyPuzzle);
    loadDailyPuzzle();
  });

})();

