# Рекомендации по улучшению и оптимизации JavaScript в проекте

Документ составлен после просмотра всех JS-файлов из `backend/web/scripts/` (всего ~57 файлов, включая модули `tasks/`, `games/`, `match/`, `daily.js` и общие утилиты).

## Краткое резюме (что важно прямо сейчас)

- **P0 (баг)**: `EventListenerManager.remove()` в `backend/web/scripts/event-listener-utils.js` почти наверняка **не удаляет** listener’ы из-за сравнения объектов по ссылке (подробности ниже). Это делает утилиту “анти-утечкой” формально неверной.
- **P1 (архитектура)**: есть **несколько реализаций auth/fetch-обёрток** (`apiFetch`, `authedFetch`, `authorizedFetch`), что создаёт расхождения в поведении (refresh, заголовки, ошибки, кэш) и затрудняет поддержку.
- **P1 (архитектура)**: есть **несколько мест, где WebSocket создаётся по-разному** (часть использует `WebSocketUtils`, часть — собственную логику). Это усложняет стабильность и повторное использование.
- **P1 (поддерживаемость)**: много глобальных экспортов через `window.*` (порядка 200+). Это делает порядок загрузки критичным и повышает риск конфликтов имён.
- **P2 (perf/UX)**: в “шахматном ядре” (`chess-board-core.js`, `chess-move-utils.js`, `tasks/*`, `daily.js`) уже сделаны оптимизации, но остаются точки, где можно снизить количество `querySelector`, ререндеров и лишних вычислений.

## Карта JS-модулей (по назначению)

### Шахматные “ядра”
- `backend/web/scripts/chess-move-utils.js`: FEN-парсинг, генерация ходов (есть кэш `movesCache`).
- `backend/web/scripts/chess-board-core.js`: рендер доски, подсветки, выбор/сброс выбора, кэши DOM-элементов.
- `backend/web/scripts/chess-pieces-svg.js`: SVG фигур.

### Страницы
- `backend/web/scripts/tasks/*`: режим задач (слой “приложения” + рендер/ходы/таймеры).
- `backend/web/scripts/match/*`: просмотр/игра матча (много логики и UI в `match.js`).
- `backend/web/scripts/games/*`: лобби/список/TV/игра (websocket + UI + API).
- `backend/web/scripts/daily.js` (+ `daily-refactored.js`): задача дня.
- Прочее: `profile.js`, `notifications.js`, `index.js`, `course.js`, `mobile-menu.js`, `modal-utils.js`, `session.js` и т.д.

## P0 — критичные баги/риски

### 1) `EventListenerManager.remove()` не работает как задумано
**Файл**: `backend/web/scripts/event-listener-utils.js`

**Проблема**: в `add()` создаётся объект `listenerInfo = { type, handler, options }` и кладётся в `Set`.  
В `remove()` создаётся **новый** объект `{ type, handler, options }`, и проверка `elementListeners.has(listenerInfo)` почти всегда **false** (объекты сравниваются по ссылке).

**Риск**: потенциальные утечки обработчиков + ложное ощущение “мы чистим listeners”.

**Рекомендации**:
- **Вариант A (надёжно)**: хранить listener’ы в `Map<string, Set<handler>>` или `Map<key, info>`, где `key = type + '|' + optionsKey + '|' + handlerId`.
- **Вариант B (минимально)**: хранить не объект, а строковый ключ (например `JSON.stringify([type, !!optionsCapture, handler])` нельзя — handler не сериализуется; нужен `WeakMap<Function, id>` или вложенные `Map`).
- **Вариант C**: в `remove()` не делать `has`, а искать соответствующий `listenerInfo` через перебор `Set` и сравнение полей.

### 2) “Глобальный поиск клетки” может попадать не на ту доску
**Файл**: `backend/web/scripts/chess-board-core.js`

В `updateAvailableTargetsHighlight()` есть fallback-ветки с `document.querySelector('[data-square="..."]')`.  
Если на странице несколько досок/виджетов, есть шанс подсветить/снять подсветку **не там**.

**Рекомендации**:
- Всегда передавать `boardEl` (или scope root) в функции подсветки, и искать `boardEl.querySelector(...)`, а не `document.querySelector(...)`.
- Кэшировать элементы клеток **по `boardEl`**, а не только по `state` (сейчас кэш `WeakMap state -> Map`).

## P1 — архитектура/поддерживаемость

### 1) Унифицировать работу с API (fetch/auth/refresh)
**Симптом**: сразу несколько “обёрток”:
- `backend/web/scripts/auth.js`: `apiFetch()` с refresh на 401/403.
- `backend/web/scripts/games/games-api.js`: `authedFetch()` частично дублирует refresh и заголовки.
- `backend/web/scripts/tasks/api.js`: `authorizedFetch()` проксирует на `apiFetch` (или просто `fetch`).
- `backend/web/scripts/match/*`: собственный модуль API (похоже, отдельная реализация refresh).
- `backend/web/scripts/profile.js`, `notifications.js`: местами используют `window.apiFetch`, местами “чистый” `fetch`.

**Риски**:
- разное поведение при истёкшем токене (где-то refresh есть, где-то нет)
- разные заголовки (Content-Type, Cache-Control)
- разный формат ошибок
- тяжелее дебажить

**Рекомендация**:
- Сделать **единую точку**: например `window.Http = { request, apiFetch }`, где:
  - единый refresh policy (1 попытка)
  - единая сборка заголовков
  - единая обработка ошибок (`safeJson`, `safeText`, код/деталь)
  - поддержка `X-Session-ID` (анонимные игры) как опция
- В `games-api.js`, `match/api.js`, `tasks/api.js` оставить только тонкие методы предметной области (createGame, joinGame, submitAttempt), но не refresh/headers.

### 2) Стандартизировать WebSocket-подключения
**Наличие**:
- `backend/web/scripts/websocket-utils.js`: хороший базовый коннектор с backoff и max попытками.
- `backend/web/scripts/games/games-websocket.js`: уже использует `WebSocketUtils`.
- `backend/web/scripts/match/match.js`: создаёт `new WebSocket(...)` напрямую (и отдельно держит retry state в `match/timers.js`).
- `backend/web/scripts/live-stats.js`: отдельный коннектор.

**Рекомендации**:
- Перевести `match` и `live-stats` на `WebSocketUtils.createWebSocketConnection`.
- Ввести общий “протокол событий” (type + payload) и централизовать парсинг/валидацию (минимум: `try/catch` JSON.parse уже есть в utils).
- Добавить единый хук “страница скрыта” (`visibilitychange`) для паузы переподключений/таймеров.

### 3) Сократить `window.*` и сделать неймспейсы
Сейчас много экспортов `window.X = ...`.

**Рекомендации**:
- Сгруппировать по неймспейсам: `window.App.Auth`, `window.App.Http`, `window.App.WS`, `window.App.Chess.*`.
- Ввести правило: экспортировать **только публичное API**, остальное — внутри IIFE.
- Для “страничных” модулей — один объект на страницу (`window.Pages.Games`, `window.Pages.Match`, …), а не десятки глобальных функций.

### 4) Удалить/объединить дублирующиеся файлы daily
**Файлы**: `backend/web/scripts/daily.js` и `backend/web/scripts/daily-refactored.js`

**Рекомендации**:
- Оставить один “источник правды”.
- Если второй нужен как эксперимент — убрать из production-страниц и добавить комментарий в README/доках.

## P1 — качество кода/дебаг

### 1) Управление логированием
**Симптом**: много `console.log` (особенно в `daily.js`).

**Рекомендации**:
- Добавить `window.DEBUG = { daily: false, games: false, match: false }` или env-flag на бэкенде (например, добавлять `data-env="dev"` в HTML).
- Заменить `console.log` на `debugLog('daily', ...)` с флагом.
- Для продакшена: “тихий режим” по умолчанию.

### 2) Единый стиль ошибок
Сейчас часть кода молча `catch {}`/`catch(() => {})`.

**Рекомендации**:
- Везде где важно — логировать через контролируемый logger (см. выше) и показывать понятный toast.
- В сетевых ошибках — единый формат сообщений (с кодом/деталью).

## P2 — производительность/UX

### 1) Минимизировать `innerHTML = ...` для больших блоков
**Симптом**: `profile.js` активно использует `innerHTML`.

**Рекомендации**:
- Для списков: строить через `DocumentFragment` + `appendChild`.
- Для “шаблонов”: использовать функции-рендеры, возвращающие DOM-ноды.
- `innerHTML` оставить для маленьких/контролируемых фрагментов, где нет пользовательского ввода.

### 2) Рендер доски: меньше DOM-поиска, больше scoped-cache
**Файлы**: `chess-board-core.js`, `tasks/board.js`, `games/computer/board.js`, `daily.js`

**Рекомендации**:
- Жёстко передавать `boardEl` во все функции подсветки/selection.
- Кэш клеток: `WeakMap(boardEl -> Map(square -> el))` (а не только `state`).
- Если подсветка частая: обновлять классы “инкрементально” (у вас уже есть подход) и избегать полного рендера.

### 3) Кэш ходов в `ChessMoveUtils`: сделать LRU/TTL
**Файл**: `backend/web/scripts/chess-move-utils.js`

Сейчас `movesCache` ограничен по размеру, но удаление “самых старых” основано на порядке ключей `Map` и не является LRU по использованию.

**Рекомендации**:
- Либо LRU (перемещать ключ в конец при `get`), либо TTL (удалять устаревшие).
- Ключи кэша: нормализовать FEN (например, отбросить halfmove/fullmove, если они не влияют на легальность, либо наоборот — явно сохранять, но единообразно).

### 4) Таймеры: централизовать и чистить при уходе со страницы
**Файлы**: `daily.js`, `match/*`, `live-stats.js`, `tasks/*`

**Рекомендации**:
- Ввести `PageLifecycle` хелпер: `onMount`, `onUnmount` (хотя бы через `beforeunload`/`pagehide`).
- Хранить все таймеры в одном месте и чистить при `pagehide`.

## P2 — безопасность

### 1) Санитизация динамического контента
**Файлы**: особенно `profile.js`, частично `notifications.js`

**Рекомендации**:
- Любые пользовательские строки вставлять через `textContent`.
- Если нужен HTML — использовать белый список/шаблоны без пользовательского ввода.

### 2) Единые заголовки `Cache-Control` там, где это важно
Вы уже местами добавляете “анти-кэш” параметры и заголовки.

**Рекомендации**:
- Свести в одно место (в общем http-клиенте) и применять только там, где нужно (иначе лишняя нагрузка).

## P3 — инфраструктура/сборка

### 1) Переход на ES Modules (постепенно)
Сейчас система зависит от порядка `<script>` и `window.*`.

**План**:
- Начать с общих утилит (`websocket-utils`, `event-listener-utils`, `form-utils`).
- Дальше — `chess-*` модули.
- В конце — страницы (`match`, `games`, `tasks`, `daily`).

### 2) Минификация/кэширование
Если будете вводить сборку (Vite/Rollup/webpack):
- tree-shaking
- code-splitting по страницам
- hashed assets (и долгий Cache-Control)

## Конкретные “быстрые победы” (1–2 дня)

1) **Починить `EventListenerUtils.remove`** (P0).
2) Вынести **единый HTTP клиент** и перевести на него `games-api.js` + `tasks/api.js` (P1).
3) Перевести `match` WS на `WebSocketUtils` (P1).
4) Убрать/загейтить `console.log` в `daily.js` (P1).
5) В `ChessBoardCore` убрать `document.querySelector` fallback или сделать его scoped (P0/P2).

## Примечания по текущему стилю (что уже хорошо)

- Модульность по папкам (`tasks/`, `games/`, `match/`) — это правильное направление.
- Есть попытки оптимизировать рендер (`requestAnimationFrame` в `tasks/board.js`).
- Есть общий WS утилитный слой (`websocket-utils.js`) — хороший фундамент для унификации.
- Есть кэширование генерации ходов (`chess-move-utils.js`) — можно довести до LRU/TTL.


