# Обработка клика по фигуре на шахматной доске

## Обзор

Когда игрок нажимает на фигуру или клетку на шахматной доске, происходит сложная последовательность проверок и действий. В проекте ChessMint есть три основных сценария:

1. **Игра с компьютером** (`games/computer/board.js`)
2. **Матч с живым игроком** (`match/match.js`)
3. **Решение задач/пазлов** (`tasks/board.js` + `tasks/moves.js`)

---

## Общий алгоритм обработки клика

### Этап 1: Перехват события клика

**Где происходит:**
- Событие `click` регистрируется на элементе `.square` (клетка доски)
- Используется делегирование событий или прямые обработчики

**Код:**
```javascript
// Пример из games/computer/board.js (строки 178-181)
square.addEventListener('click', (e) => {
  e.stopPropagation();
  handleSquareClick(squareName);
});

// Пример из tasks/board.js (строки 105-114) - делегирование
TasksState.boardClickHandler = (e) => {
  const square = e.target.closest('.square');
  if (!square) return;
  const squareName = square.dataset.square;
  if (squareName && square.classList.contains('clickable')) {
    window.TasksMoves.handleSquareClick(squareName);
  }
};
```

---

### Этап 2: Первичные проверки

Перед обработкой клика выполняются проверки:

#### 2.1. Проверка состояния игры
```javascript
// games/computer/board.js:195-197
if (!state.isPlayerTurn() || state.getGameStatus() !== 'active') {
  return; // Не ход игрока или игра не активна
}

// match/match.js:893-908
if (!state.game) return;
if (isAnalysisMode()) {
  showToast('Вы просматриваете предыдущий ход...');
  return;
}
if (state.game.status !== 'ACTIVE' && !bothPlayersJoined) return;
if (state.pendingMove) return; // Уже есть ожидающий ход
```

#### 2.2. Проверка очереди хода
```javascript
// match/match.js:912-919
const role = getCurrentUserRole(); // 'white' или 'black'
const expectedTurn = state.game.next_turn === 'w' ? 'white' : 'black';
if (role !== expectedTurn) {
  return; // Не ваш ход
}

// games/computer/board.js:209-213
const turn = parsed.activeColor; // 'white' или 'black'
if (turn !== playerColor) return; // Не ваш ход
```

---

### Этап 3: Обработка выбора фигуры

#### Сценарий A: Уже выбрана фигура, клик на целевую клетку

```javascript
// games/computer/board.js:218-223
if (selectedSquare && availableTargets.has(square)) {
  const uci = `${selectedSquare}${square}`;
  makeMove(uci); // Выполняем ход
  return;
}

// match/match.js:922-925
if (state.selectedSquare && state.availableTargets.has(square)) {
  executeMove(state.selectedSquare, square);
  return;
}
```

**Что происходит:**
1. Проверяется, что целевая клетка в списке доступных ходов (`availableTargets`)
2. Формируется UCI-нотация хода (например, `"e2e4"`)
3. Вызывается функция выполнения хода

#### Сценарий B: Клик на уже выбранную фигуру (отмена выбора)

```javascript
// games/computer/board.js:225-231
if (selectedSquare === square) {
  state.setSelectedSquare(null);
  state.setAvailableTargets(new Set());
  renderBoard(); // Перерисовываем доску без подсветки
  return;
}
```

#### Сценарий C: Клик на пустую клетку или фигуру соперника

```javascript
// games/computer/board.js:241-247
if (!piece || !pieceBelongsToPlayer(piece, playerColor)) {
  // Сбрасываем выбор
  state.setSelectedSquare(null);
  state.setAvailableTargets(new Set());
  renderBoard();
  return;
}
```

#### Сценарий D: Выбор новой фигуры

```javascript
// games/computer/board.js:233-268
// 1. Проверяем наличие фигуры и принадлежность игроку
const piece = baseBoard?.[rankIdx]?.[fileIdx];
if (!piece || !pieceBelongsToPlayer(piece, playerColor)) {
  // Сбрасываем выбор
  return;
}

// 2. Получаем возможные ходы для фигуры
const validMoves = utils.getMovesForSquare(fen, playerColor, square);

// 3. Фильтруем только легальные ходы (не оставляющие короля под шахом)
const legalMoves = validMoves.filter(uci => {
  return utils.isMoveAllowed(fen, playerColor, uci);
});

// 4. Сохраняем выбранную фигуру и доступные цели
if (legalMoves.length > 0) {
  state.setSelectedSquare(square);
  state.setAvailableTargets(new Set(legalMoves.map(m => m.slice(2, 4))));
  renderBoard(); // Перерисовываем с подсветкой
}
```

**Что происходит:**
1. Проверяется, что на клетке есть фигура игрока
2. Используется `ChessMoveUtils.getMovesForSquare()` для получения всех возможных ходов
3. Фильтруются только легальные ходы (не оставляющие короля под шахом)
4. Сохраняется выбранная клетка и список доступных целей
5. Доска перерисовывается с подсветкой

---

### Этап 4: Визуальная обратная связь

После выбора фигуры доска перерисовывается с подсветкой:

```javascript
// games/computer/board.js:122-143
// Подсветка выбранной клетки
if (selectedSquare && squareName === selectedSquare) {
  square.classList.add('selected-user');
}

// Подсветка доступных целей
if (availableTargets.has(squareName)) {
  square.classList.add('legal-target');
  
  // Индикатор возможного хода
  const marker = document.createElement('div');
  marker.className = 'legal-move-indicator';
  if (isCaptureTarget) marker.classList.add('capture');
  square.appendChild(marker);
}
```

**Визуальные эффекты:**
- Выбранная фигура: класс `selected-user` (обычно синяя рамка)
- Доступные ходы: класс `legal-target` + индикатор точки/круга
- Взятие: дополнительный класс `legal-target-capture` (обычно красная рамка)

---

### Этап 5: Выполнение хода

Когда игрок кликает на доступную цель:

#### 5.1. Формирование UCI-нотации

```javascript
// UCI формат: "e2e4" (откуда → куда)
// Для превращения: "e7e8q" (пешка превращается в ферзя)
const uci = `${selectedSquare}${targetSquare}`;
```

#### 5.2. Отправка хода на сервер

**Игра с компьютером:**
```javascript
// games/computer/board.js:272-279
function makeMove(uci) {
  const ws = window.ComputerGameWebSocket;
  if (!ws || !ws.sendMove) {
    console.error('WebSocket not available');
    return;
  }
  ws.sendMove(uci); // Отправка через WebSocket
}
```

**Матч с живым игроком:**
```javascript
// match/match.js:870-891
function executeMove(fromSquare, toSquare) {
  // ... валидация ...
  
  const uci = `${fromSquare}${toSquare}`;
  state.pendingMove = { from: fromSquare, to: toSquare };
  
  // Отправка через WebSocket
  if (ws && ws.send) {
    ws.send(JSON.stringify({
      type: 'move',
      uci: uci,
      game_id: state.game.id
    }));
  }
}
```

**Задачи/пазлы:**
```javascript
// tasks/moves.js:267-359
executeMove(from, to, uci) {
  // 1. Применяем ход к локальной доске
  const moveApplied = window.TasksMoves.applyMoveToBoard(uci, true);
  
  // 2. Проверяем корректность хода
  const expectedMove = correctMoves[playerMoveIndex];
  if (uci.toLowerCase() === expectedMove.toLowerCase()) {
    // Правильный ход
    TasksState.userMoves.push(uci);
    // Применяем ответный ход противника
    applyOpponentMove(opponentMove);
  } else {
    // Неправильный ход - задача провалена
    window.TasksMain.handlePuzzleFailed(to);
  }
}
```

---

### Этап 6: Обновление состояния

После выполнения хода:

```javascript
// Очистка выбора
state.setSelectedSquare(null);
state.setAvailableTargets(new Set());

// Обновление FEN позиции
state.currentFEN = newFen;

// Перерисовка доски
renderBoard();
```

---

## Детали реализации по модулям

### 1. Игра с компьютером (`games/computer/board.js`)

**Особенности:**
- Использует `ComputerGameState` для управления состоянием
- Ходы отправляются через `ComputerGameWebSocket.sendMove()`
- Ожидает ответ от сервера с ходом компьютера

**Ключевые функции:**
- `handleSquareClick(squareName)` - обработка клика
- `makeMove(uci)` - отправка хода
- `renderBoard()` - отрисовка доски с подсветкой

---

### 2. Матч с живым игроком (`match/match.js`)

**Особенности:**
- Более сложная логика проверок (оба игрока должны присоединиться)
- Режим анализа (просмотр предыдущих ходов)
- Проверка `pendingMove` для предотвращения дублирования

**Ключевые функции:**
- `handleSquareClick(squareName)` - обработка клика
- `executeMove(fromSquare, toSquare)` - выполнение хода
- `resetSelection()` - сброс выбора
- `renderBoard()` - отрисовка доски

**Проверки:**
```javascript
// match/match.js:893-919
- Проверка существования игры
- Проверка режима анализа
- Проверка статуса игры (CREATED/ACTIVE)
- Проверка pendingMove
- Проверка роли игрока (white/black)
- Проверка очереди хода
```

---

### 3. Задачи/пазлы (`tasks/board.js` + `tasks/moves.js`)

**Особенности:**
- Использует делегирование событий (один обработчик на всю доску)
- Проверяет корректность хода против правильного решения
- Автоматически применяет ответный ход противника

**Ключевые функции:**
- `TasksBoard.renderBoard()` - отрисовка с делегированием событий
- `TasksMoves.handleSquareClick(squareName)` - обработка клика
- `TasksMoves.executeMove(from, to, uci)` - выполнение и проверка хода
- `TasksMoves.applyMoveToBoard(uci, animate)` - применение хода к доске
- `TasksMoves.applyOpponentMove(uci)` - применение хода противника

**Логика проверки:**
```javascript
// tasks/moves.js:306-323
const playerMoveIndex = TasksState.currentMoveIndex * 2 + 1;
const expectedMove = correctMoves[playerMoveIndex];

if (uci.toLowerCase() === expectedMove.toLowerCase()) {
  // Правильный ход
  TasksState.currentMoveIndex++;
  applyOpponentMove(opponentMove); // Автоматический ответ
} else {
  // Неправильный ход - задача провалена
  handlePuzzleFailed(to);
}
```

---

## Утилиты для работы с ходами

### `ChessMoveUtils` (`chess-move-utils.js`)

**Основные функции:**

1. **`parseFen(fen)`** - парсинг FEN-нотации
   ```javascript
   // Возвращает: { board, activeColor, castlingRights, enPassant }
   ```

2. **`getMovesForSquare(fen, color, square)`** - получение возможных ходов
   ```javascript
   // Возвращает массив UCI-ходов для фигуры на указанной клетке
   const moves = utils.getMovesForSquare(fen, 'white', 'e2');
   // ['e2e3', 'e2e4', ...]
   ```

3. **`isMoveAllowed(fen, color, uci)`** - проверка легальности хода
   ```javascript
   // Проверяет, не оставляет ли ход короля под шахом
   const isLegal = utils.isMoveAllowed(fen, 'white', 'e2e4');
   ```

4. **`generateMoves(fen, color)`** - генерация всех легальных ходов
   ```javascript
   // Возвращает: { moves: Set, movesByFrom: Map }
   const { moves, movesByFrom } = utils.generateMoves(fen, 'white');
   ```

---

## Визуальная обратная связь

### CSS классы для подсветки:

- `.selected-user` - выбранная фигура (синяя рамка)
- `.legal-target` - доступная цель для хода
- `.legal-target-capture` - доступная цель с взятием (красная рамка)
- `.legal-move-indicator` - индикатор возможного хода (точка/круг)
- `.highlighted` - подсветка последнего хода
- `.invalid-move` - неверный ход (красная подсветка)

### Анимации:

```javascript
// tasks/animations.js
window.TasksAnimations.animatePieceMove(from, to);
// Анимация перемещения фигуры с клетки from на to
```

---

## Обработка специальных случаев

### 1. Превращение пешки

```javascript
// Если пешка достигает последней горизонтали
if (promotion && piece.toLowerCase() === 'p') {
  pieceToMove = activeColor === 'w' 
    ? promotion.toUpperCase() 
    : promotion.toLowerCase();
}
```

### 2. Рокировка

```javascript
// tasks/moves.js:160-175
if (piece.toLowerCase() === 'k' && Math.abs(fromFile - toFile) === 2) {
  // Перемещаем ладью
  if (toFile === 6) { // Короткая рокировка
    // Ладья с h1 на f1
  } else if (toFile === 2) { // Длинная рокировка
    // Ладья с a1 на d1
  }
}
```

### 3. Взятие на проходе

```javascript
// tasks/moves.js:131-143
if (piece.toLowerCase() === 'p' && fenParts[3] && fenParts[3] !== '-') {
  const enPassantSquare = fenParts[3];
  if (toFile === enPassantFile && toRank === enPassantRank) {
    isEnPassant = true;
    // Удаляем взятую пешку
    TasksState.board[capturedPawnRank][toFile] = '';
  }
}
```

---

## Схема потока данных

```
Клик на клетку
    ↓
handleSquareClick(squareName)
    ↓
Проверки (ход игрока? игра активна?)
    ↓
Уже выбрана фигура?
    ├─ Да → Клик на цель?
    │   ├─ Да → executeMove() / makeMove()
    │   └─ Нет → Сброс выбора
    └─ Нет → Выбор новой фигуры
        ↓
        Проверка: фигура игрока?
        ↓
        Получение возможных ходов (getMovesForSquare)
        ↓
        Фильтрация легальных ходов (isMoveAllowed)
        ↓
        Сохранение выбора + подсветка
        ↓
        renderBoard() - перерисовка с подсветкой
```

---

## Оптимизации

### 1. Делегирование событий (задачи)

Вместо добавления обработчика на каждую клетку, используется один обработчик на всю доску:

```javascript
// tasks/board.js:105-119
TasksState.boardClickHandler = (e) => {
  const square = e.target.closest('.square');
  // ...
};
grid.addEventListener('click', TasksState.boardClickHandler);
```

### 2. Кеширование позиций

```javascript
// tasks/board.js:76-94
const cacheKey = `${TasksState.currentFEN}|${colorForMoveGen}`;
let cachedMoves = TasksState.positionCache?.get(cacheKey);
if (!cachedMoves) {
  // Генерация ходов и сохранение в кеш
}
```

### 3. Отложенный рендеринг

```javascript
// tasks/board.js:41-47
if (TasksState.renderBoardScheduled) return;
TasksState.renderBoardScheduled = true;
requestAnimationFrame(() => {
  TasksState.renderBoardScheduled = false;
  window.TasksBoard._renderBoard();
});
```

---

## Заключение

Обработка клика по фигуре включает:

1. **Перехват события** - регистрация обработчика клика
2. **Валидация** - проверка состояния игры и очереди хода
3. **Выбор фигуры** - определение фигуры и получение возможных ходов
4. **Визуальная обратная связь** - подсветка выбранной фигуры и доступных ходов
5. **Выполнение хода** - формирование UCI, отправка на сервер, обновление состояния
6. **Специальные случаи** - рокировка, превращение, взятие на проходе

Каждый модуль (компьютер, матч, задачи) имеет свои особенности, но общая логика остается схожей.
