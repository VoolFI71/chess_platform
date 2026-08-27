# ChessMint

ChessMint — шахматная платформа на микросервисах: партии между игроками, игры против Stockfish, задачи, профили и уведомления.

## Архитектура

Стек: FastAPI и Go/Gin, Vanilla JS/HTML/CSS, PostgreSQL, Redis, MinIO и Prometheus/Grafana/Loki. Сервисы запускаются через Docker Compose.

```mermaid
graph TB
    Browser[Браузер] --> Gateway[Nginx Gateway]
    Gateway --> Backend[Backend API + Frontend]
    Gateway --> Auth[Auth]
    Gateway --> Users[Users]
    Gateway --> Payments[Payments]
    Gateway --> Puzzles[Puzzles]
    Gateway --> Notifications[Notifications]
    Gateway --> Games[Games]
    Gateway --> ComputerGames[Computer Games]
    Gateway --> Email[Email]

    Auth --> Users
    Auth --> Email
    Backend --> Notifications
    Games --> Redis[(Redis)]
    Auth --> DB[(PostgreSQL)]
    Users --> DB
    Payments --> DB
    Puzzles --> DB
    Notifications --> DB
    Games --> DB
    ComputerGames --> DB
    Prometheus[Prometheus] --> Grafana[Grafana]
    Services[Сервисы] -.-> Prometheus
    Loki[Loki] --> Grafana
```

## Сервисы

- `auth_service` — регистрация, вход, JWT, OAuth и восстановление пароля.
- `users_service` — профили, рейтинги, друзья и школьные организации.
- `payments_service` — заказы и webhook YooKassa.
- `puzzles_service` — шахматные задачи и дневные подборки.
- `notifications_service` — уведомления и WebSocket.
- `games_service_go` — партии между игроками, matchmaking и WebSocket.
- `computer_games_service` — партии против Stockfish.
- `email_service_go` — отправка писем через SMTP.
- `backend` — API-шлюз и статический фронтенд.
- `common`, `go_shared` — общие Python- и Go-компоненты.

## Быстрый старт

Нужны Docker и Docker Compose. Для локальной разработки также полезны Python 3.12+ и Go 1.24+.

1. Скопируйте `.env.example` в `.env` и замените секреты и SMTP-настройки.
2. Запустите production-профиль:

   ```bash
   docker compose up -d --build
   ```

3. Для локальной разработки используйте:

   ```bash
   docker compose -f docker-compose.local.yml up --build
   ```

Сервис `migrations` запускается до зависимых приложений и создаёт схему Python-сервисов, а также общие таблицы `games` и `moves`.

После запуска локальная точка входа — http://localhost:8080.

## Структура проекта

```text
.
├── auth_service/
├── users_service/
├── payments_service/
├── puzzles_service/
├── notifications_service/
├── migrations_service/       # централизованные Alembic и SQL-миграции
├── backend/                  # FastAPI API + frontend
├── games_service_go/         # игры между игроками
├── computer_games_service/   # Stockfish
├── email_service_go/         # SMTP
├── common/                   # общие Python-компоненты
├── go_shared/                # общие Go-компоненты
├── nginx/
├── monitoring/
├── docker-compose.yml
└── docker-compose.local.yml
```

## Конфигурация и безопасность

- JWT проверяется по `JWT_SECRET`, точному `JWT_ALGORITHM` и claim `type=access`.
- Внутренние HTTP-вызовы используют единый заголовок `X-Internal-Token`; отсутствие секрета считается ошибкой конфигурации.
- WebSocket-соединения принимаются только с origins из `WS_ALLOWED_ORIGINS`. Запросы без `Origin` разрешены для не-браузерных клиентов.
- Секреты должны храниться в `.env` или секрет-хранилище и не должны попадать в git.

Для production заполните `LETSENCRYPT_DOMAIN`, `LETSENCRYPT_EMAIL`, SMTP-параметры и `WS_ALLOWED_ORIGINS`. Для локального запуска в примере уже указаны origins `localhost` и `127.0.0.1`.

## Производительность

В `puzzles_service` используются выборка случайных страниц вместо постоянного `ORDER BY random()`, stale-while-revalidate для кеша и округление рейтинга в ключе кеша. Backend поддерживает ETag и ответы `304 Not Modified` для статических ресурсов.

## Проверки

```bash
cd games_service_go && go test ./... && go vet ./...
cd ../computer_games_service && go test ./... && go vet ./...
cd ../email_service_go && go test ./... && go vet ./...
```

Python-тесты запускаются из соответствующего сервиса командой `pytest tests/` после установки его requirements. Синтаксис JavaScript можно проверить командой `node --check <file.js>`.
