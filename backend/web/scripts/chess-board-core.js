(() => {
  'use strict';

  /**
   * Общий модуль для работы с выбором фигур и обработкой кликов на доске
   * Используется в games/computer, match и tasks модулях
   */

  // Кеш DOM-элементов клеток (общий для всех модулей)
  const squareElementsCaches = new WeakMap(); // state -> Map<squareName, DOMElement>

  // Кеш корневого DOM-элемента доски для состояния (чтобы не искать board через document.querySelector)
  const boardElementsByState = new WeakMap(); // state -> HTMLElement

  function setBoardElement(state, boardEl) {
    if (!state || !boardEl) return;
    boardElementsByState.set(state, boardEl);
  }

  function getBoardElement(state) {
    if (!state) return null;
    return boardElementsByState.get(state) || null;
  }

  /**
   * Получить или создать кеш DOM-элементов для состояния
   */
  function getSquareElementsCache(state) {
    if (!squareElementsCaches.has(state)) {
      squareElementsCaches.set(state, new Map());
    }
    return squareElementsCaches.get(state);
  }

  /**
   * Инкрементальное обновление подсветки выбранной фигуры
   */
  function updateSelectedSquareHighlight(state, squareName, isSelected) {
    const cache = getSquareElementsCache(state);
    const squareEl = cache.get(squareName);
    if (squareEl) {
      squareEl.classList.toggle('selected-user', isSelected);
    }
  }

  // Кеш для parsed FEN (чтобы не парсить при каждом обновлении подсветки)
  const parsedFenCache = new WeakMap(); // state -> { fen, parsed, timestamp }

  /**
   * Получить parsed FEN из кеша или распарсить
   */
  function getParsedFen(state, fen, utils) {
    if (!fen || !utils?.parseFen) throw new Error('FEN parser is not initialized');
    
    const cached = parsedFenCache.get(state);
    if (cached && cached.fen === fen) {
      return cached.parsed;
    }
    
    const parsed = utils.parseFen(fen);
    if (!parsed?.board) throw new Error('Invalid FEN board');
    parsedFenCache.set(state, { fen, parsed, timestamp: Date.now() });
    return parsed;
  }

  /**
   * Инкрементальное обновление подсветки доступных целей
   * Оптимизировано для быстрой работы на мобильных устройствах
   */
  function updateAvailableTargetsHighlight(state, targets, fen, utils, previousTargets = state.availableTargets) {
    const cache = getSquareElementsCache(state);
    const stateBoardEl = getBoardElement(state);
    if (!stateBoardEl) throw new Error('Board element is not registered');
    if (!(targets instanceof Set)) throw new Error('Available targets must be a Set');
    
    // Получаем текущие активные целевые квадраты из состояния
    const oldTargets = previousTargets;
    if (!(oldTargets instanceof Set)) throw new Error('Previous board targets must be a Set');
    
    // Удаляем подсветку только с тех клеток, которые больше не являются целями
    oldTargets.forEach(oldTarget => {
      if (!targets || !targets.has(oldTarget)) {
        const squareEl = cache.get(oldTarget);
        if (squareEl) {
          squareEl.classList.remove('legal-target', 'legal-target-capture');
          const marker = squareEl.querySelector('.legal-move-indicator');
          if (marker) {
            marker.remove();
          }
        }
      }
    });

    // Добавляем новую подсветку только для новых целей
    if (targets && targets.size > 0) {
      // Используем кешированный parsed FEN
      const parsed = getParsedFen(state, fen, utils);
      const baseBoard = parsed ? parsed.board : null;

      targets.forEach(targetSquare => {
        // Пропускаем, если подсветка уже есть
        let targetEl = cache.get(targetSquare);
        
        if (targetEl && !targetEl.classList.contains('legal-target')) {
          targetEl.classList.add('legal-target');

          // Проверяем, является ли это взятием
          let isCapture = false;
          if (baseBoard) {
            if (!utils?.squareToCoords) throw new Error('Square coordinate utility is not initialized');
            const coords = utils.squareToCoords(targetSquare);
            if (coords) {
              const piece = baseBoard[coords.rank]?.[coords.file];
              if (piece && piece !== '') {
                isCapture = true;
                targetEl.classList.add('legal-target-capture');
              }
            }
          }

          // Добавляем индикатор возможного хода
          const marker = document.createElement('div');
          marker.className = 'legal-move-indicator';
          if (isCapture) {
            marker.classList.add('capture');
          }
          targetEl.appendChild(marker);
        }
      });
    }
  }

  /**
   * Инкрементальный сброс выбора (без полной перерисовки)
   * 
   * @param {Object} config - Конфигурация
   * @param {Object} config.state - Объект состояния (должен иметь selectedSquare и availableTargets)
   * @param {Function} config.setState - Функция для обновления состояния (опционально)
   * @param {Function} config.getFen - Функция для получения текущего FEN (опционально)
   * @param {Object} config.utils - ChessMoveUtils (опционально)
   */
  function resetSelectionIncremental(config) {
    const { state, setState, getFen, utils } = config;
    if (!state) throw new Error('Board state is not initialized');

    // Получаем старые значения ПЕРЕД обновлением состояния
    const oldSelected = state.selectedSquare;
    const oldTargets = state.availableTargets;
    if (!(oldTargets instanceof Set)) throw new Error('Board state has invalid available targets');
    const oldTargetsSet = oldTargets;

    // Обновляем состояние
    state.selectedSquare = null;
    state.availableTargets = new Set();
    if (setState) setState({ selectedSquare: null, availableTargets: state.availableTargets }, 'resetSelection');

    // Удаляем подсветку выбранной фигуры
    if (oldSelected) {
      updateSelectedSquareHighlight(state, oldSelected, false);
    }

    // Удаляем подсветку доступных целей (передаем пустой Set для удаления всех)
    if (oldTargetsSet && oldTargetsSet.size > 0) {
      const fen = getFen ? getFen() : null;
      // Передаем пустой Set, чтобы удалить все подсветки
      updateAvailableTargetsHighlight(state, new Set(), fen, utils, oldTargetsSet);
    }
  }

  /**
   * Обновление выбора фигуры с инкрементальной подсветкой
   * 
   * @param {Object} config - Конфигурация
   * @param {Object} config.state - Объект состояния
   * @param {Function} config.setState - Функция для обновления состояния
   * @param {string} config.square - Квадрат для выбора
   * @param {Set} config.targets - Доступные цели
   * @param {Function} config.getFen - Функция для получения FEN
   * @param {Object} config.utils - ChessMoveUtils
   */
  function updateSelection(config) {
    const { state, setState, square, targets, getFen, utils } = config;
    if (!state || !square || !(targets instanceof Set)) throw new Error('Invalid board selection state');

    // Получаем старые значения ДО обновления состояния
    const oldSelected = state.selectedSquare;
    const oldTargets = state.availableTargets;
    if (!(oldTargets instanceof Set)) throw new Error('Board state has invalid available targets');
    const oldTargetsSet = oldTargets;

    // Обновляем состояние
    state.selectedSquare = square;
    state.availableTargets = targets;
    if (setState) setState({ selectedSquare: square, availableTargets: targets }, 'updateSelection');

    // Убираем подсветку со старой выбранной фигуры (если была)
    if (oldSelected && oldSelected !== square) {
      updateSelectedSquareHighlight(state, oldSelected, false);
    }
    // НЕ добавляем подсветку на новую выбранную фигуру - подсвечиваем только возможные ходы
    
    // Удаляем ВСЕ старые подсветки доступных целей перед добавлением новых
    // Это гарантирует, что не останется подсветок от предыдущих выборов
    const fen = getFen ? getFen() : null;
    const cache = getSquareElementsCache(state);
    
    // Удаляем все подсветки из кеша
    cache.forEach((squareEl, squareName) => {
      if (squareEl && squareEl.classList.contains('legal-target')) {
        squareEl.classList.remove('legal-target', 'legal-target-capture');
        const marker = squareEl.querySelector('.legal-move-indicator');
        if (marker) {
          marker.remove();
        }
      }
    });
    
    // Также удаляем подсветки через DOM (на случай, если что-то не в кеше)
    // Ищем доску по разным возможным ID и классам для всех модулей
    const boardEl = getBoardElement(state);
    if (!boardEl) throw new Error('Board element is not registered');
    const allLegalTargets = boardEl.querySelectorAll('.legal-target');
    allLegalTargets.forEach(squareEl => {
      squareEl.classList.remove('legal-target', 'legal-target-capture');
      const marker = squareEl.querySelector('.legal-move-indicator');
      if (marker) marker.remove();
    });
    
    // Теперь добавляем новые подсветки
    updateAvailableTargetsHighlight(state, targets, fen, utils, oldTargetsSet);
  }

  /**
   * Базовая обработка клика на клетку
   * Общая логика для всех модулей
   * 
   * @param {Object} config - Конфигурация обработки клика
   * @param {string} config.squareName - Имя квадрата (например, "e4")
   * @param {Object} config.state - Объект состояния
   * @param {Function} config.canProcessClick - Функция проверки возможности обработки клика
   * @param {Function} config.getMovesForSquare - Функция получения ходов для квадрата
   * @param {Function} config.onMoveExecute - Callback при выполнении хода
   * @param {Function} config.onSelectionUpdate - Callback при обновлении выбора
   * @param {Function} config.onSelectionReset - Callback при сбросе выбора
   * @param {Function} config.getFen - Функция получения FEN
   * @param {Object} config.utils - ChessMoveUtils
   */
  function handleSquareClickBase(config) {
    const {
      squareName,
      state,
      canProcessClick,
      getMovesForSquare,
      onMoveExecute,
      onSelectionUpdate,
      onSelectionReset,
      getFen,
      utils,
    } = config;

    if (!state || typeof getMovesForSquare !== 'function' ||
        typeof onMoveExecute !== 'function' || typeof onSelectionUpdate !== 'function' ||
        typeof onSelectionReset !== 'function' || typeof getFen !== 'function' ||
        !utils?.isMoveAllowed) {
      throw new Error('Incomplete board click configuration');
    }

    // Проверка возможности обработки клика
    if (canProcessClick && !canProcessClick()) {
      return;
    }

    const normalizedSquare = squareName.toLowerCase();
    const selectedSquare = state.selectedSquare;
    const availableTargets = state.availableTargets;
    if (!(availableTargets instanceof Set)) throw new Error('Board state has invalid available targets');

    // Сценарий A: Уже выбрана фигура, клик на целевую клетку
    if (selectedSquare && availableTargets.has(normalizedSquare)) {
      onMoveExecute(selectedSquare, normalizedSquare);
      return;
    }

    // Сценарий B: Клик на уже выбранную фигуру (отмена выбора)
    if (selectedSquare === normalizedSquare) {
      onSelectionReset();
      return;
    }

    // Сценарий C: Получаем ходы для новой фигуры
    const moves = getMovesForSquare ? getMovesForSquare(normalizedSquare) : null;
    
    if (!moves || moves.length === 0) {
      // Нет ходов - сбрасываем выбор
      onSelectionReset();
      return;
    }

    // Сценарий D: Выбор новой фигуры
    onSelectionUpdate(normalizedSquare, moves);
  }

  /**
   * Регистрация квадрата в кеше DOM-элементов
   */
  function registerSquareElement(state, squareName, element) {
    const cache = getSquareElementsCache(state);
    cache.set(squareName, element);
  }

  /**
   * Очистка кеша DOM-элементов
   */
  function clearSquareElementsCache(state) {
    if (squareElementsCaches.has(state)) {
      squareElementsCaches.get(state).clear();
    }
  }

  /**
   * Создание базового квадрата доски
   * @param {Object} config - Конфигурация квадрата
   * @param {string} config.squareName - Имя квадрата (например, "e4")
   * @param {boolean} config.isLight - Светлая или темная клетка
   * @param {string} config.piece - Фигура на клетке (или null)
   * @param {Object} config.state - Объект состояния
   * @param {Set} config.selectedSquare - Выбранный квадрат
   * @param {Set} config.availableTargets - Доступные цели
   * @param {Set} config.highlightSet - Квадраты для подсветки
   * @param {Array} config.baseBoard - Доска для проверки взятий
   * @param {Function} config.getPieceSVG - Функция получения SVG фигуры
   * @param {Function} config.onSquareClick - Обработчик клика
   * @param {Object} config.customClasses - Дополнительные классы для квадрата
   * @param {Object} config.customPieceClasses - Дополнительные классы для фигуры
   * @param {boolean} config.showCoordinates - Показывать ли координаты
   * @param {string} config.fileLabel - Метка файла (для координат)
   * @param {string} config.rankLabel - Метка ранга (для координат)
   * @param {boolean} config.isBottomRow - Это нижний ряд?
   * @param {boolean} config.isLeftCol - Это левый столбец?
   * @returns {HTMLElement} DOM элемент квадрата
   */
  function createSquareElement(config) {
    const {
      squareName,
      isLight,
      piece,
      state,
      selectedSquare,
      availableTargets = new Set(),
      highlightSet = new Set(),
      baseBoard = null,
      getPieceSVG,
      onSquareClick = null,
      customClasses = {},
      customPieceClasses = {},
      showCoordinates = false,
      fileLabel = null,
      rankLabel = null,
      isBottomRow = false,
      isLeftCol = false,
    } = config;

    // Создаем квадрат
    const square = document.createElement('div');
    square.className = `square ${isLight ? 'light' : 'dark'}`;
    
    // Добавляем кастомные классы
    if (customClasses.square) {
      square.className += ` ${customClasses.square}`;
    }
    
    square.dataset.square = squareName;

    // Регистрируем в кеше
    if (state) {
      registerSquareElement(state, squareName, square);
    }

    // Подсветка последнего хода
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

    // Подсветка доступных целей
    let isCaptureTarget = false;
    if (availableTargets.has(squareName)) {
      square.classList.add('legal-target');
      
      // Проверяем, является ли это взятием
      if (baseBoard) {
        if (!window.ChessMoveUtils?.squareToCoords) {
          throw new Error('Square coordinate utility is not initialized');
        }
        const coords = window.ChessMoveUtils.squareToCoords(squareName);
        const occupant = baseBoard[coords.rank]?.[coords.file];
        if (occupant && occupant !== '') {
          isCaptureTarget = true;
          square.classList.add('legal-target-capture');
        }
      }
      
      // Добавляем индикатор возможного хода
      const marker = document.createElement('div');
      marker.className = 'legal-move-indicator';
      if (isCaptureTarget) {
        marker.classList.add('capture');
      }
      square.appendChild(marker);
    }

    // Создаем фигуру
    if (piece) {
      const pieceStr = typeof piece === 'string' ? piece : String(piece);
      const pieceEl = document.createElement(customClasses.pieceTag || 'span');
      pieceEl.className = `piece ${pieceStr.toLowerCase()}`;
      
      // Добавляем кастомные классы для фигуры
      if (customPieceClasses.base) {
        pieceEl.className += ` ${customPieceClasses.base}`;
      }
      if (customPieceClasses.own) {
        pieceEl.classList.add(customPieceClasses.own);
      }
      if (customPieceClasses.movable) {
        pieceEl.classList.add(customPieceClasses.movable);
      }
      
      // Отключаем pointer events для фигуры
      pieceEl.style.pointerEvents = 'none';
      
      // Получаем SVG фигуры из единого рендера
      const pieceContent = getPieceSVG(pieceStr);
      
      if (!pieceContent) throw new Error(`SVG piece is not registered: ${pieceStr}`);
      pieceEl.innerHTML = pieceContent;
      
      square.appendChild(pieceEl);
    }

    // Добавляем координаты (если нужно)
    if (showCoordinates) {
      if (isBottomRow && fileLabel !== null && fileLabel !== undefined) {
        const fileCoord = document.createElement('span');
        fileCoord.className = 'coordinate file-coord';
        fileCoord.textContent = fileLabel;
        square.appendChild(fileCoord);
      }
      
      if (isLeftCol && rankLabel !== null && rankLabel !== undefined) {
        const rankCoord = document.createElement('span');
        rankCoord.className = 'coordinate rank-coord';
        rankCoord.textContent = rankLabel;
        square.appendChild(rankCoord);
      }
    }

    // Добавляем обработчик клика (оптимизировано для мобильных)
    if (onSquareClick) {
      // Используем touchstart для мобильных (убирает 300ms задержку)
      let touchStartTime = 0;
      let touchStartPos = null;
      
      square.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        touchStartTime = Date.now();
        touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        // Убрана визуальная обратная связь - не добавляем класс 'touching'
      }, { passive: true });
      
      square.addEventListener('touchend', (e) => {
        e.stopPropagation();
        e.preventDefault(); // Предотвращаем click событие
        
        // Проверяем, что это не был свайп
        if (touchStartPos && e.changedTouches[0]) {
          const touchEndPos = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
          const deltaX = Math.abs(touchEndPos.x - touchStartPos.x);
          const deltaY = Math.abs(touchEndPos.y - touchStartPos.y);
          const deltaTime = Date.now() - touchStartTime;
          
          // Если движение меньше 10px и время меньше 300ms - это клик
          if (deltaX < 10 && deltaY < 10 && deltaTime < 300) {
            onSquareClick(squareName);
          }
        }
        touchStartPos = null;
      }, { passive: false });
      
      // Для десктопа используем обычный click
      square.addEventListener('click', (e) => {
        e.stopPropagation();
        onSquareClick(squareName);
      });
    }

    return square;
  }

  /**
   * Базовая функция рендеринга доски
   * @param {Object} config - Конфигурация рендеринга
   * @param {HTMLElement} config.boardEl - DOM элемент контейнера доски
   * @param {Array} config.matrix - Матрица доски [rank][file]
   * @param {Array} config.files - Массив файлов для отображения
   * @param {Array} config.ranks - Массив рангов для отображения
   * @param {Object} config.state - Объект состояния
   * @param {Function} config.getPieceSVG - Функция получения SVG фигуры
   * @param {Function} config.onSquareClick - Обработчик клика на квадрат
   * @param {Object} config.options - Дополнительные опции
   * @returns {void}
   */
  function renderBoardBase(config) {
    const {
      boardEl,
      matrix,
      files,
      ranks,
      state,
      getPieceSVG,
      onSquareClick = null,
      options = {},
    } = config;

    if (!boardEl || !state || !Array.isArray(matrix) || !Array.isArray(files) || !Array.isArray(ranks)) {
      throw new Error('Invalid board render configuration');
    }
    if (typeof getPieceSVG !== 'function') throw new Error('Piece SVG renderer is not initialized');

    const {
      selectedSquare = null,
      availableTargets = new Set(),
      highlightSet = new Set(),
      baseBoard = null,
      showCoordinates = false,
      customClasses = {},
      customPieceClasses = {},
      pieceCheckCallback = null, // Callback для проверки фигуры (например, piece-movable)
      isClickableCallback = null, // Callback для определения, является ли квадрат кликабельным
      ranksForCoords = null, // Отдельный массив рангов для координат (если null, используется ranks)
      isFlipped = false, // Флаг перевернутой доски (для правильного отображения координат)
    } = options;

    // Очищаем доску
    boardEl.innerHTML = '';
    
    // Запоминаем корневой элемент доски для этого состояния (важно для инкрементальной подсветки)
    setBoardElement(state, boardEl);
    clearSquareElementsCache(state);

    // Рендерим квадраты
    matrix.forEach((row, rIdx) => {
      row.forEach((piece, cIdx) => {
        const squareName = `${files[cIdx]}${ranks[rIdx]}`;
        const isLight = (rIdx + cIdx) % 2 === 0;
        const isBottomRow = rIdx === matrix.length - 1;
        const isLeftCol = cIdx === 0;

        // Получаем дополнительные классы для фигуры через callback
        const pieceClasses = { ...customPieceClasses };
        if (pieceCheckCallback && piece) {
          const additionalClasses = pieceCheckCallback(piece, squareName);
          if (additionalClasses) {
            if (additionalClasses.own) pieceClasses.own = additionalClasses.own;
            if (additionalClasses.movable) pieceClasses.movable = additionalClasses.movable;
            if (additionalClasses.base) pieceClasses.base = additionalClasses.base;
          }
        }

        // Используем ranksForCoords для координат, если указан, иначе используем ranks
        let rankLabel = null;
        if (showCoordinates && isLeftCol) {
          if (ranksForCoords) {
            // ranksForCoords всегда в порядке ['8', '7', '6', '5', '4', '3', '2', '1']
            // rIdx идет от 0 (верх матрицы) до 7 (низ матрицы)
            // Когда isFlipped = false (белые внизу): 
            //   - rIdx=0 (верх) должен показывать '8' → ranksForCoords[0] = '8' ✓
            //   - rIdx=7 (низ) должен показывать '1' → ranksForCoords[7] = '1' ✓
            // Когда isFlipped = true (черные внизу):
            //   - rIdx=0 (верх) должен показывать '1' → ranksForCoords[7] = '1' ✓
            //   - rIdx=7 (низ) должен показывать '8' → ranksForCoords[0] = '8' ✓
            // ranksForCoords = ['8', '7', '6', '5', '4', '3', '2', '1']
            // rIdx идет от 0 (верх матрицы) до 7 (низ матрицы)
            // Когда isFlipped = false (белые внизу): 
            //   - rIdx=0 (верх экрана) должен показывать '8' → ranksForCoords[0] = '8' ✓
            //   - rIdx=7 (низ экрана) должен показывать '1' → ranksForCoords[7] = '1' ✓
            //   Прямой индекс правильный: ranksForCoords[rIdx]
            // Когда isFlipped = true (черные внизу):
            //   - rIdx=0 (верх экрана) должен показывать '1' → ranksForCoords[7] = '1' ✓
            //   - rIdx=7 (низ экрана) должен показывать '8' → ranksForCoords[0] = '8' ✓
            //   Нужно инвертировать: ranksForCoords[7 - rIdx]
            // ИСПРАВЛЕНО: логика была перевернута!
            if (!isFlipped) {
              // Когда белые внизу: прямой индекс
              rankLabel = ranksForCoords[rIdx];
            } else {
              // Когда черные внизу: инвертируем индекс
              rankLabel = ranksForCoords[ranksForCoords.length - 1 - rIdx];
            }
          } else {
            rankLabel = ranks[rIdx];
          }
        }
        
        const square = createSquareElement({
          squareName,
          isLight,
          piece,
          state,
          selectedSquare,
          availableTargets,
          highlightSet,
          baseBoard,
          getPieceSVG,
          onSquareClick,
          customClasses,
          customPieceClasses: pieceClasses,
          showCoordinates,
          fileLabel: showCoordinates && isBottomRow ? files[cIdx] : null,
          rankLabel: rankLabel,
          isBottomRow,
          isLeftCol,
        });

        // Добавляем класс clickable, если callback возвращает true
        if (isClickableCallback && isClickableCallback(squareName, piece)) {
          square.classList.add('clickable');
          square.style.cursor = 'pointer';
        }

        boardEl.appendChild(square);
      });
    });
  }

  /**
   * Получить ориентированную матрицу доски (перевернутую, если нужно)
   * @param {Array<Array>} matrix - Матрица доски [rank][file]
   * @param {string} orientation - 'white' или 'black'
   * @returns {Array<Array>} - Ориентированная матрица
   */
  function getOrientedMatrix(matrix, orientation) {
    if (!Array.isArray(matrix)) throw new Error('Board matrix is invalid');
    if (orientation !== 'white' && orientation !== 'black') {
      throw new Error('Board orientation is invalid');
    }
    if (orientation === 'white') return matrix;
    // Переворачиваем для черных: сначала переворачиваем ряды, потом элементы в каждом ряду
    return matrix.slice().reverse().map((row) => row.slice().reverse());
  }

  /**
   * Преобразовать FEN в матрицу доски
   * @param {string} fen - FEN строка
   * @param {Object} utils - ChessMoveUtils объект
   * @returns {Array<Array>} - Матрица доски [rank][file]
   */
  function fenToMatrix(fen, utils) {
    if (!fen || !utils?.parseFen) throw new Error('FEN parser is not initialized');
    
    const parsed = utils.parseFen(fen);
    if (!parsed?.board || parsed.board.length !== 8) throw new Error('Invalid FEN board');
    const board = parsed.board;
    
    // Преобразуем в матрицу [rank][file]
    const matrix = [];
    for (let rank = 0; rank < 8; rank++) {
      const row = [];
      if (!Array.isArray(board[rank]) || board[rank].length !== 8) {
        throw new Error('Invalid FEN row');
      }
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        row.push(piece && piece !== '' && piece !== ' ' ? piece : null);
      }
      matrix.push(row);
    }
    
    return matrix;
  }

  // Создаем неймспейс App.Chess если его еще нет
  if (!window.App) {
    window.App = {};
  }
  if (!window.App.Chess) {
    window.App.Chess = {};
  }

  // Export в новый неймспейс
  window.App.Chess.Board = {
    getOrientedMatrix,
    fenToMatrix,
    resetSelectionIncremental,
    updateSelection,
    handleSquareClickBase,
    updateSelectedSquareHighlight: (state, square, isSelected) => 
      updateSelectedSquareHighlight(state, square, isSelected),
    updateAvailableTargetsHighlight: (state, targets, fen, utils) => 
      updateAvailableTargetsHighlight(state, targets, fen, utils),
    registerSquareElement,
    clearSquareElementsCache,
    getSquareElementsCache,
    createSquareElement,
    renderBoardBase,
  };

  // Публичный алиас для страниц приложения
  window.ChessBoardCore = window.App.Chess.Board;
})();
