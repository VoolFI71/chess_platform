# Анализ дублирования кода в модулях обработки ходов

## Обзор

В проекте есть три модуля для обработки шахматных ходов:
1. **games/computer/board.js** - игра с компьютером
2. **match/match.js** - матч с живым игроком
3. **tasks/board.js + tasks/moves.js** - решение задач/пазлов

## Обнаруженное дублирование

### 1. Проверка принадлежности фигуры игроку

**Дублирование:** Три разные реализации одной и той же логики

#### games/computer/board.js
```javascript
function pieceBelongsToPlayer(piece, playerColor) {
  if (!piece) return false;
  const pieceStr = typeof piece === 'string' ? piece : String(piece);
  const isWhite = pieceStr === pieceStr.toUpperCase();
  return (playerColor === 'white' && isWhite) || (playerColor === 'black' && !isWhite);
}
```

#### match/match.js
```javascript
function pieceBelongsToRole(piece, role) {
  if (!piece) return false;
  const isWhite = piece === piece.toUpperCase();
  return role === (isWhite ? 'white' : 'black');
}
```

#### tasks/board.js
```javascript
getPieceColor(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? 'w' : 'b';
}
// Затем проверяется: pieceColor === activeColor
```

**Проблема:**
- Разные названия функций для одной логики
- Разные форматы возвращаемых значений ('white'/'black' vs 'w'/'b')
- Дублирование логики определения цвета фигуры

**Решение:**
- Вынести в общий модуль `chess-move-utils.js` или создать `chess-piece-utils.js`
- Унифицировать формат возвращаемых значений

---

### 2. Обработка клика на клетку (handleSquareClick)

**Дублирование:** Похожая логика в трех местах

#### Общая структура (одинаковая во всех модулях):
1. Проверка состояния игры/задачи
2. Проверка очереди хода
3. Если выбрана фигура и клик на цель → выполнить ход
4. Если клик на выбранную фигуру → отменить выбор
5. Если клик на пустую/чужую фигуру → сбросить выбор
6. Если клик на свою фигуру → выбрать фигуру и показать возможные ходы

#### Различия:

**games/computer/board.js:**
- Использует `ComputerGameState`
- Проверяет `isPlayerTurn()` и `getGameStatus()`
- Получает ходы через `getMovesForSquare()`
- Фильтрует через `isMoveAllowed()`

**match/match.js:**
- Использует `state` (локальное состояние)
- Проверяет `isAnalysisMode()`, `bothPlayersJoined`, `pendingMove`
- Использует предварительно сгенерированные `legalMovesByFrom`
- Более сложная валидация (роль игрока, статус игры)

**tasks/moves.js:**
- Использует `TasksState`
- Проверяет `isPuzzleSolved`, `isPuzzleFailed`
- Генерирует ходы при каждом клике (не кеширует)
- Проверяет корректность хода против правильного решения

**Проблема:**
- ~70% логики идентична
- Разные названия переменных для одного и того же
- Разные способы получения ходов (кеш vs генерация)

**Решение:**
- Создать базовую функцию `handleSquareClickBase()` в общем модуле
- Каждый модуль расширяет базовую логику своими проверками

---

### 3. Получение фигуры на клетке

**Дублирование:** Разные способы получения фигуры из FEN/доски

#### games/computer/board.js
```javascript
const baseBoard = parsed.board;
const piece = baseBoard?.[rankIdx]?.[fileIdx];
```

#### match/match.js
```javascript
function getPieceAtSquare(fen, square) {
  const utils = window.ChessMoveUtils;
  if (!utils || !fen || !square) return null;
  const { board } = utils.parseFen(fen);
  const fileIdx = square.charCodeAt(0) - 97;
  const rankIdx = 8 - Number.parseInt(square[1], 10);
  if (Number.isNaN(fileIdx) || Number.isNaN(rankIdx)) return null;
  return board?.[rankIdx]?.[fileIdx] ?? null;
}
```

#### tasks/moves.js
```javascript
const realRowIdx = 8 - parseInt(normalizedSquareName[1], 10);
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const realColIdx = files.indexOf(normalizedSquareName[0]);
const piece = TasksState.board[realRowIdx][realColIdx];
```

**Проблема:**
- Разные способы конвертации squareName в индексы
- Разные источники данных (FEN vs состояние доски)
- Дублирование логики парсинга координат

**Решение:**
- Вынести в `chess-move-utils.js`: `getPieceAtSquare(fen, square)` и `squareToIndices(square)`

---

### 4. Генерация и фильтрация легальных ходов

**Дублирование:** Повторяющаяся логика фильтрации

#### games/computer/board.js
```javascript
const validMoves = utils.getMovesForSquare(fen, playerColor, square);
const legalMoves = validMoves.filter(uci => {
  return utils.isMoveAllowed ? utils.isMoveAllowed(fen, playerColor, uci) : true;
});
```

#### match/match.js
```javascript
// Ходы предварительно генерируются в updateLegalMoves()
const moves = state.legalMovesByFrom.get(square);
// Уже отфильтрованы при генерации
```

#### tasks/moves.js
```javascript
const { movesByFrom } = moveUtils.generateMoves(TasksState.currentFEN, colorForMoveGen);
const moves = movesByFrom.get(normalizedSquareName);
const legalTargets = Array.from(moves)
  .filter(uci => {
    return moveUtils.isMoveAllowed(TasksState.currentFEN, colorForMoveGen, uci);
  })
  .map(uci => uci.slice(2, 4).toLowerCase());
```

**Проблема:**
- Разные подходы: генерация при клике vs предварительная генерация
- Дублирование логики фильтрации через `isMoveAllowed`
- Разные форматы данных (массив UCI vs Set целей)

**Решение:**
- Унифицировать подход: всегда использовать предварительную генерацию
- Вынести фильтрацию в общую функцию

---

### 5. Рендеринг доски

**Дублирование:** Похожая структура создания DOM

#### Общие элементы (во всех модулях):
- Создание элементов `.square` с классами `light`/`dark`
- Добавление координат (файлы и ранги)
- Подсветка выбранной фигуры (`.selected-user`)
- Подсветка доступных целей (`.legal-target`, `.legal-move-indicator`)
- Отображение фигур через SVG

#### Различия:

**games/computer/board.js:**
- Использует `getOrientedMatrix()` для переворота доски
- Проверяет `piece-movable` для каждой фигуры при рендере
- Добавляет обработчики клика на каждую клетку

**match/match.js:**
- Аналогичная структура
- Проверяет `piece-movable` через `legalMovesByFrom`
- Добавляет обработчики клика на каждую клетку

**tasks/board.js:**
- Использует делегирование событий (один обработчик на всю доску) ✅
- Не проверяет `piece-movable` при рендере
- Использует `requestAnimationFrame` для батчинга

**Проблема:**
- ~80% кода рендеринга идентичен
- Разные способы обработки событий
- Дублирование логики создания DOM-структуры

**Решение:**
- Создать базовую функцию `renderBoardBase()` в общем модуле
- Каждый модуль добавляет свои специфичные элементы

---

### 6. Сброс выбора фигуры

**Дублирование:** Три разные реализации

#### games/computer/board.js
```javascript
function resetSelectionIncremental() {
  const oldSelected = state.getSelectedSquare();
  const oldTargets = state.getAvailableTargets();
  state.setSelectedSquare(null);
  state.setAvailableTargets(new Set());
  // Инкрементальное обновление DOM
}
```

#### match/match.js
```javascript
function resetSelection() {
  setState({
    selectedSquare: null,
    availableTargets: new Set(),
  }, 'resetSelection');
}

function resetSelectionIncremental() {
  // Аналогично games/computer
}
```

#### tasks/moves.js
```javascript
clearSelection() {
  TasksState.selectedSquare = null;
  TasksState.availableTargets = new Set();
  window.TasksBoard.renderBoard(); // ❌ Полная перерисовка
}
```

**Проблема:**
- Разные названия функций
- `tasks` использует полную перерисовку (не оптимизировано)
- Дублирование логики сброса состояния

**Решение:**
- Унифицировать в общую функцию
- Применить инкрементальное обновление везде

---

### 7. Конвертация координат

**Дублирование:** Повторяющаяся логика конвертации

#### games/computer/board.js
```javascript
const fileIdx = square.charCodeAt(0) - 97;
const rankIdx = 8 - Number.parseInt(square[1], 10);
```

#### match/match.js
```javascript
const fileIdx = square.charCodeAt(0) - 97;
const rankIdx = 8 - Number.parseInt(square[1], 10);
```

#### tasks/moves.js
```javascript
const realRowIdx = 8 - parseInt(normalizedSquareName[1], 10);
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const realColIdx = files.indexOf(normalizedSquareName[0]);
```

**Проблема:**
- Одинаковая логика в разных местах
- Разные способы (charCodeAt vs indexOf)

**Решение:**
- Вынести в `chess-move-utils.js`: `squareToIndices(square)` → `{file, rank}`

---

### 8. Подсветка доступных ходов

**Дублирование:** Логика добавления/удаления подсветки

#### games/computer/board.js
```javascript
if (availableTargets.has(squareName)) {
  square.classList.add('legal-target');
  // Проверка взятия
  // Добавление индикатора
}
```

#### match/match.js
```javascript
if (targetSquares.has(squareName)) {
  square.classList.add('legal-target');
  // Проверка взятия
  // Добавление индикатора
}
```

#### tasks/board.js
```javascript
if (TasksState.selectedSquare && TasksState.availableTargets.has(squareName)) {
  square.classList.add('legal-target');
  const indicator = document.createElement('div');
  indicator.className = 'legal-move-indicator';
  square.appendChild(indicator);
}
```

**Проблема:**
- Идентичная логика в трех местах
- Разные названия переменных (`availableTargets` vs `targetSquares`)

**Решение:**
- Вынести в общую функцию `addLegalMoveHighlight(squareEl, isCapture)`

---

## Статистика дублирования

### Оценка дублирования кода:

| Компонент | Дублирование | Строк кода |
|-----------|--------------|------------|
| Проверка принадлежности фигуры | 100% | ~15 строк × 3 = 45 |
| Обработка клика | ~70% | ~100 строк × 3 = 300 |
| Получение фигуры на клетке | ~80% | ~10 строк × 3 = 30 |
| Генерация/фильтрация ходов | ~60% | ~20 строк × 3 = 60 |
| Рендеринг доски | ~80% | ~150 строк × 3 = 450 |
| Сброс выбора | ~90% | ~10 строк × 3 = 30 |
| Конвертация координат | 100% | ~3 строки × 3 = 9 |
| Подсветка ходов | ~90% | ~15 строк × 3 = 45 |

**Итого:** ~969 строк дублированного кода

**Потенциальная экономия:** ~650-700 строк при рефакторинге

---

## Предложения по рефакторингу

### Вариант 1: Общий модуль `chess-board-core.js`

Создать базовый модуль с общими функциями:

```javascript
// chess-board-core.js
window.ChessBoardCore = {
  // Утилиты
  pieceBelongsToPlayer(piece, playerColor),
  getPieceAtSquare(fen, square),
  squareToIndices(square),
  indicesToSquare(file, rank),
  
  // Обработка выбора
  handleSquareClickBase(config),
  resetSelectionIncremental(state, cache),
  
  // Рендеринг
  renderBoardBase(config),
  addLegalMoveHighlight(squareEl, isCapture),
  
  // Ходы
  getLegalMovesForSquare(fen, color, square),
  filterLegalMoves(moves, fen, color),
};
```

**Преимущества:**
- Централизованная логика
- Легко тестировать
- Единая точка изменений

**Недостатки:**
- Нужно адаптировать существующий код
- Может быть избыточно для простых случаев

---

### Вариант 2: Расширение `chess-move-utils.js`

Добавить общие функции в существующий модуль:

```javascript
// chess-move-utils.js (расширение)
window.ChessMoveUtils = {
  // Существующие функции...
  
  // Новые общие функции
  pieceBelongsToPlayer(piece, playerColor),
  getPieceAtSquare(fen, square),
  squareToIndices(square),
  getLegalMovesForSquare(fen, color, square),
};
```

**Преимущества:**
- Минимальные изменения
- Логичное место для утилит

**Недостатки:**
- Модуль может стать слишком большим
- Смешивание логики ходов и UI

---

### Вариант 3: Создать `chess-board-utils.js`

Отдельный модуль для UI-утилит доски:

```javascript
// chess-board-utils.js
window.ChessBoardUtils = {
  // UI-специфичные функции
  pieceBelongsToPlayer(piece, playerColor),
  renderSquare(squareName, piece, config),
  addHighlight(squareEl, type),
  removeHighlight(squareEl, type),
  createSquareElement(squareName, isLight),
};
```

**Преимущества:**
- Четкое разделение ответственности
- Легко расширять

**Недостатки:**
- Еще один модуль для загрузки

---

## Рекомендуемый план рефакторинга

### Этап 1: Низкоуровневые утилиты (низкий риск)

1. **Вынести конвертацию координат** в `chess-move-utils.js`
   ```javascript
   squareToIndices(square) → {file: 0-7, rank: 0-7}
   indicesToSquare(file, rank) → "e4"
   ```

2. **Вынести проверку принадлежности фигуры**
   ```javascript
   pieceBelongsToPlayer(piece, playerColor) → boolean
   getPieceColor(piece) → 'white' | 'black'
   ```

3. **Вынести получение фигуры на клетке**
   ```javascript
   getPieceAtSquare(fen, square) → piece | null
   ```

**Экономия:** ~90 строк, риск: низкий

---

### Этап 2: Обработка выбора (средний риск)

4. **Создать базовую функцию обработки клика**
   ```javascript
   handleSquareClickBase(config) {
     // Общая логика выбора/сброса
     // Каждый модуль передает свои проверки через config
   }
   ```

5. **Унифицировать сброс выбора**
   ```javascript
   resetSelectionIncremental(state, cache)
   ```

**Экономия:** ~200 строк, риск: средний

---

### Этап 3: Рендеринг (высокий риск)

6. **Создать базовую функцию рендеринга**
   ```javascript
   renderBoardBase(config) {
     // Общая логика создания DOM
     // Каждый модуль добавляет свои элементы
   }
   ```

7. **Унифицировать подсветку**
   ```javascript
   addLegalMoveHighlight(squareEl, isCapture)
   removeLegalMoveHighlight(squareEl)
   ```

**Экономия:** ~350 строк, риск: высокий (много UI-логики)

---

## Приоритеты

### Высокий приоритет (быстрая выгода, низкий риск):
- ✅ Конвертация координат
- ✅ Проверка принадлежности фигуры
- ✅ Получение фигуры на клетке

### Средний приоритет (значительная выгода, средний риск):
- ⚠️ Унификация сброса выбора
- ⚠️ Базовая обработка клика

### Низкий приоритет (большая выгода, высокий риск):
- ⚠️ Базовый рендеринг (требует тщательного тестирования)

---

## Ожидаемые результаты

### После этапа 1:
- **Экономия:** ~90 строк
- **Улучшение:** Единообразие кода, меньше багов
- **Время:** 2-3 часа

### После этапа 2:
- **Экономия:** ~290 строк
- **Улучшение:** Легче добавлять новые модули
- **Время:** 4-6 часов

### После этапа 3:
- **Экономия:** ~640 строк
- **Улучшение:** Централизованная логика рендеринга
- **Время:** 8-12 часов

---

## Риски и митигация

### Риски:
1. **Регрессии** - изменения могут сломать существующий функционал
2. **Производительность** - абстракции могут замедлить код
3. **Сложность** - общий код может стать сложнее для понимания

### Митигация:
1. **Постепенное внедрение** - по одному этапу за раз
2. **Тестирование** - тщательное тестирование после каждого этапа
3. **Обратная совместимость** - сохранить старые функции как обертки
4. **Метрики** - измерять производительность до и после

---

## Заключение

**Текущее состояние:**
- Значительное дублирование кода (~970 строк)
- Разные подходы к одной задаче
- Сложность поддержки и расширения

**После рефакторинга:**
- Единая логика в общих модулях
- Легче добавлять новые функции
- Меньше багов из-за дублирования
- Проще тестировать

**Рекомендация:** Начать с этапа 1 (низкоуровневые утилиты) для быстрой выгоды с минимальным риском.
