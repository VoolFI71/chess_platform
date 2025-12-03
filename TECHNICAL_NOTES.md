
## Архитектура проекта

### Микросервисная архитектура
Проект построен на микросервисной архитектуре с использованием Docker Compose для оркестрации.

**Основные сервисы:**
- `db` - PostgreSQL база данных
- `auth_service` - Аутентификация и авторизация
- `users_service` - Управление пользователями, рейтингами, друзьями
- `games_service` - Логика шахматных игр
- `puzzles_service` - Управление задачами (puzzles)
- `notifications_service` - Система уведомлений
- `courses_service` - Курсы обучения
- `lessons_service` - Уроки в курсах
- `enrollments_service` - Записи на курсы
- `payments_service` - Платежи
- `api` - API Gateway (FastAPI)
- `backend` - Статический фронтенд (HTML/CSS/JS)
- `gateway` - Nginx reverse proxy
- `migrations_service` - Централизованный сервис миграций

### Технологический стек

**Backend:**
- Python 3.12
- FastAPI (веб-фреймворк)
- SQLAlchemy 2.0 (ORM)
- Alembic (миграции БД)
- PostgreSQL (база данных)
- AsyncIO (асинхронное программирование)

**Frontend:**
- Vanilla JavaScript (ES6+)
- HTML5/CSS3
- Fetch API для HTTP запросов

**Инфраструктура:**
- Docker & Docker Compose
- Nginx (reverse proxy)
- nginx-proxy + acme-companion (автоматический SSL)

## Инфраструктура проекта

### API Gateway (Nginx)

Все внешние запросы принимает API Gateway и маршрутизирует их к нужным сервисам.

**Плюсы Gateway в отличие от прямого доступа к сервисам:**
- Централизованная безопасность
- Легче контролировать нагрузку, упрощение управления трафиком
- Единая точка входа для всех клиентов
- Возможность добавления rate limiting, аутентификации на уровне gateway
- Упрощение маршрутизации и балансировки нагрузки

### PostgreSQL

Централизованная база данных PostgreSQL используется всеми микросервисами.

**Плюсы единой БД:**
- Простота транзакций между сервисами
- Единая точка бэкапа и восстановления
- Возможность использования JOIN между таблицами разных сервисов
- Упрощение миграций

**Особенности:**
- Использование схем для логического разделения (опционально)
- Foreign key constraints между таблицами разных сервисов
- Индексы для оптимизации запросов

### Connection Pooling

Настроен пул соединений с базой данных через SQLAlchemy для каждого сервиса.

**Параметры пула:**
- `pool_size: 10` - базовый размер пула соединений
- `max_overflow: 20` - дополнительные соединения при пиковой нагрузке
- `pool_timeout: 30` - таймаут ожидания свободного соединения (секунды)
- `pool_recycle: 1800` - пересоздание соединений через 30 минут

**Плюсы connection pooling:**
- Переиспользование соединений вместо создания новых для каждого запроса
- Контроль нагрузки на БД через ограничение количества соединений
- Автоматическое переподключение при разрыве соединения (`pool_pre_ping=True`)
- Предотвращение утечек соединений через автоматический recycle

### Система миграций (Alembic + migrations_service)

Централизованный сервис миграций применяет все миграции из всех микросервисов в правильном порядке.

**Плюсы централизованных миграций:**
- Гарантированный порядок применения миграций
- Единая точка управления схемой БД
- Предотвращение конфликтов при параллельном запуске сервисов
- Возможность отката всех миграций одной командой

**Особенности:**
- Каждый сервис имеет свою таблицу версий: `alembic_version_<service_name>`
- Автоматический `stamp` начальной версии при первом запуске на существующей БД
- Миграции выполняются до запуска всех остальных сервисов

### Кэширование

Используется in-memory кэширование для оптимизации частых запросов.

**Примеры кэширования:**
- `puzzles_service`: кэш случайных задач (5000 задач, TTL 5 минут)
- Frontend: кэширование позиций через WeakMap
- HTTP кэширование статических ресурсов через заголовки

**Плюсы кэширования:**
- Снижение нагрузки на БД
- Ускорение ответов для пользователей
- Экономия ресурсов сервера

### Gzip сжатие

Применяется Gzip сжатие HTTP ответов через `GZipMiddleware` в FastAPI.

**Плюсы сжатия:**
- Уменьшение размера передаваемых данных
- Ускорение загрузки страниц для пользователей
- Экономия трафика
- Особенно эффективно для JSON ответов и статических файлов

**Настройки:**
- Минимальный размер для сжатия: 1000 байт
- Автоматическое определение поддерживаемого алгоритма через заголовки

## Структура базы данных

### Таблицы по сервисам

**users_service:**
- `users` - пользователи (id, username, email, рейтинги по форматам, статистика)
- `rating_history` - история изменений рейтингов (user_id, format_type, rating_before, rating_after, game_id, opponent_id)
- `friendships` - дружеские связи (requester_id, addressee_id, status)

**auth_service:**
- `tokens` - токены доступа и обновления

**games_service:**
- `games` - шахматные игры (id, white_user_id, black_user_id, status, moves, результат)

**puzzles_service:**
- `puzzles` - задачи (puzzle_id, FEN, moves, rating, themes, opening_tags)
- `puzzle_user_stats` - статистика пользователей по задачам (user_id, solved_count, failed_count, puzzle_rating, streaks)

**notifications_service:**
- `notifications` - уведомления (user_id, type, message, read_at)

**courses_service:**
- `courses` - курсы обучения

**lessons_service:**
- `lessons` - уроки в курсах

**enrollments_service:**
- `enrollments` - записи пользователей на курсы

**payments_service:**
- Таблицы для платежей

### Миграции

**Централизованная система миграций:**
- Все миграции выполняются через `migrations_service`
- Каждый сервис имеет свою таблицу версий: `alembic_version_<service_name>`
- Порядок применения миграций определен в `MIGRATION_ORDER`
- При первом запуске на существующей БД выполняется `stamp` начальной версии, если таблицы уже существуют

**Миграции по сервисам:**
- `users_service`: `0001_initial`, `0002_add_rating_history`
- `puzzles_service`: `0001_initial`, `0003_add_rating_indexes`
- Остальные сервисы: `0001_initial`

## API Endpoints

### users_service

**Рейтинги (`/api/ratings`):**
- `GET /api/ratings/history/me` - история рейтингов текущего пользователя
- `GET /api/ratings/history/{user_id}` - история рейтингов пользователя (публичный)
- `GET /api/ratings/leaderboard` - таблица лидеров (query params: format_type, limit, offset)

**Пользователи (`/api/users`):**
- `GET /api/users/search` - поиск пользователей по username
- `GET /api/users/{identifier}` - получение профиля пользователя
- `GET /api/users/{identifier}/stats` - статистика пользователя

**Друзья (`/api/friendships`):**
- `GET /api/friendships/status/{user_id}` - статус дружбы с пользователем
- `POST /api/friendships/request` - отправить запрос на дружбу
- `POST /api/friendships/{friendship_id}/accept` - принять запрос
- `POST /api/friendships/{friendship_id}/decline` - отклонить запрос
- `DELETE /api/friendships/{friendship_id}` - удалить дружбу
- `GET /api/friendships/me` - список друзей текущего пользователя

**Внутренние (`/internal/users`):**
- `GET /internal/users/{user_id}` - получение пользователя для внутренних вызовов

### games_service

**Игры (`/api/games`):**
- `POST /api/games` - создать новую игру
- `GET /api/games/{game_id}` - получить игру
- `POST /api/games/{game_id}/move` - сделать ход
- `POST /api/games/{game_id}/resign` - сдаться
- `POST /api/games/{game_id}/offer-draw` - предложить ничью

**Рейтинговая система:**
- Elo рейтинг рассчитывается при завершении игры
- Обновляются рейтинги: `blitz_rating`, `rapid_rating`, `bullet_rating`
- История изменений сохраняется в `rating_history`

### puzzles_service

**Задачи (`/api/puzzles`):**
- `GET /api/puzzles/random` - получить случайную задачу (query params: rating_min, rating_max, themes, opening_tags)
- `GET /api/puzzles/` - список задач с пагинацией
- `GET /api/puzzles/{puzzle_id}` - получить задачу по ID

**Статистика (`/api/puzzles/stats`):**
- `GET /api/puzzles/stats/{user_id}` - статистика пользователя по задачам
- `POST /api/puzzles/stats/attempt` - зарегистрировать попытку решения

**Оптимизация выбора случайных задач:**
- Кэширование пула из 5000 задач на 5 минут
- Использование `TABLESAMPLE` для быстрого случайного выбора
- Асинхронное обновление кэша в фоне
- Fallback на случайное смещение при ошибках

### notifications_service

**Уведомления (`/api/notifications`):**
- `GET /api/notifications/me` - получить уведомления текущего пользователя
- `GET /api/notifications/me/unread-count` - количество непрочитанных

### auth_service

**Аутентификация (`/api/auth`):**
- `POST /api/auth/register` - регистрация
- `POST /api/auth/login` - вход
- `POST /api/auth/logout` - выход
- `GET /api/auth/me` - текущий пользователь
- `POST /api/auth/refresh` - обновить токен

## Frontend структура

### Основные страницы

**HTML страницы:**
- `index.html` - главная страница
- `login.html` / `register.html` - аутентификация
- `profile.html` - профиль пользователя
- `games.html` - список игр
- `match.html` - игровая доска
- `tasks.html` - страница задач
- `leaderboard.html` - таблица лидеров
- `course.html` - страница курса
- `couch.html` - страница тренера

### JavaScript модули

**Общие модули:**
- `auth.js` - управление аутентификацией, темами, кнопками входа/выхода
- `api.js` - базовые функции для API запросов
- `notifications.js` - система уведомлений

**Страница игр (`games.js`):**
- Управление игровой доской
- Обработка ходов
- WebSocket подключение для реального времени
- Таймеры игры

**Страница задач (`tasks/`):**
- `main.js` - основная логика страницы
- `api.js` - запросы к API задач
- `board.js` - отрисовка шахматной доски
- `moves.js` - обработка ходов
- `history.js` - история ходов
- `ui.js` - UI компоненты
- `animations.js` - анимации
- `constants.js` - константы и конфигурация
- `state.js` - управление состоянием
- `utils.js` - утилиты
- `lazy-loader.js` - ленивая загрузка модулей

**Оптимизации страницы задач:**
- Ленивая загрузка модулей (загружаются только при выборе режима)
- Прогрессивная загрузка (скелетоны во время загрузки)
- Оптимизация памяти (WeakMap для кэширования, ограничение истории ходов, очистка таймеров)
- Визуальные улучшения (плавные переходы, анимации фигур, индикаторы серий)
- Prefetch следующей задачи после успешного решения

**Профиль (`profile.js`):**
- Загрузка данных пользователя
- История игр
- Статистика по задачам
- Управление друзьями (поиск, добавление, удаление)
- История рейтингов

**Таблица лидеров (`leaderboard.js`):**
- Загрузка и отображение лидеров
- Фильтрация по формату игры
- Пагинация

### CSS структура

**Основные стили:**
- `variables.css` - CSS переменные для тем
- `common.css` - общие стили
- `header.css` - стили заголовка
- `tasks.css` - стили страницы задач
- `leaderboard.css` - стили таблицы лидеров
- `cabinet.css` - стили профиля
- `chess-board.css` - стили шахматной доски

**Темы:**
- Светлая и темная тема
- Переключение через localStorage
- CSS переменные для цветов

## Интеграции между сервисами

### HTTP вызовы между сервисами

**users_service → games_service:**
- Создание игры с приглашением друга

**puzzles_service → users (через raw SQL):**
- Синхронизация `puzzle_rating` из `puzzle_user_stats` в таблицу `users`

**notifications_service → users_service:**
- Проверка существования пользователя перед созданием уведомления

**auth_service → users_service:**
- Получение данных пользователя для внутренних операций

### Зависимости сервисов в Docker Compose

**Порядок запуска:**
1. `db` - база данных
2. `migrations` - миграции (завершается после выполнения)
3. Все остальные сервисы зависят от `migrations: condition: service_completed_successfully`

**Специфические зависимости:**
- `notifications_service` зависит от `users: condition: service_started`
- `api` зависит от всех сервисов: `condition: service_started`

## Оптимизации и улучшения

### База данных

**Индексы:**
- GIN индексы на массивы (`themes`, `opening_tags`) в таблице `puzzles`
- B-tree индексы на `rating` и `popularity` в таблице `puzzles`
- Индексы на `user_id`, `format_type`, `created_at` в `rating_history`

**Connection Pooling:**
- Настроен через `common/config.py`
- Параметры: `pool_size`, `max_overflow`, `pool_timeout`, `pool_recycle`

**Кэширование:**
- Кэш случайных задач в `puzzles_service` (5000 задач, TTL 5 минут)
- Использование `TABLESAMPLE` для быстрого случайного выбора

### Frontend оптимизации

**Производительность:**
- Ленивая загрузка модулей (динамический импорт)
- Prefetch следующей задачи
- Очистка таймеров и event listeners
- Ограничение размера истории ходов (100 записей)
- WeakMap для кэширования позиций

**UX улучшения:**
- Прогрессивная загрузка (скелетоны)
- Плавные переходы между задачами
- Анимации фигур при ходах
- Визуальные индикаторы серий решений

**HTTP кэширование:**
- `Cache-Control` и `Vary` заголовки для статических ресурсов
- Gzip сжатие ответов (GZipMiddleware)

## Nginx конфигурация

### Gateway (gateway.dev.conf / gateway.prod.conf)

**Маршрутизация:**
- `/api/auth/` → `auth:8000`
- `/api/users/` → `users:8000`
- `/api/ratings/` → `users:8000`
- `/api/games/` → `games:8000`
- `/api/puzzles/` → `puzzles:8000`
- `/api/notifications/` → `notifications:8000`
- `/api/courses/` → `courses:8000`
- `/api/lessons/` → `lessons:8000`
- `/api/enrollments/` → `enrollments:8000`
- `/api/payments/` → `payments:8000`
- `/profile` → `api:8000`
- `/` → `backend:8000` (статические файлы)

**Настройки прокси:**
- Таймауты, буферы, retry логика
- HTTP/2 поддержка (через nginx-proxy)

## Безопасность

**Аутентификация:**
- JWT токены (access + refresh)
- Токены хранятся в `auth_service`
- Проверка токенов через `get_current_user_id` dependency

**Валидация:**
- Pydantic модели для валидации запросов/ответов
- Query параметры с ограничениями (min/max значения)

**База данных:**
- Foreign key constraints
- Индексы для производительности
- Миграции для версионирования схемы

## Мониторинг и логирование

**Логирование:**
- Стандартное логирование Python через `logging`
- Логи FastAPI/Uvicorn для HTTP запросов

**Метрики:**
- Prometheus метрики через `prometheus-fastapi-instrumentator`
- Endpoint `/metrics` в каждом сервисе

## Известные особенности

**Миграции:**
- Централизованная система миграций через `migrations_service`
- Каждый сервис имеет свою таблицу версий для отслеживания миграций
- При первом запуске на существующей БД выполняется автоматический `stamp` начальной версии

**Рейтинги:**
- Elo система для игр (blitz, rapid, bullet)
- Отдельная система рейтинга для задач (puzzle_rating)
- История изменений рейтингов сохраняется в `rating_history`

**Задачи:**
- Два режима: "survival" (выживание) и "rated" (на рейтинг)
- Кэширование для быстрого доступа к случайным задачам
- Оптимизация через `TABLESAMPLE` для случайного выбора

**Друзья:**
- Статусы: "pending", "accepted", "declined"
- Возможность приглашения друга в игру

## TODO / Планы развития

(Здесь можно добавлять заметки о будущих улучшениях)

