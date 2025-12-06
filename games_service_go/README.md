# Games Service (Go)

Микросервис для управления шахматными партиями, портированный с Python/FastAPI на Go.

## Структура проекта

```
games_service_go/
├── cmd/
│   └── server/
│       └── main.go              # Точка входа
├── internal/
│   ├── config/
│   │   └── config.go            # Конфигурация из env
│   ├── database/
│   │   └── db.go                # Подключение к PostgreSQL (pgx)
│   ├── models/
│   │   ├── game.go              # Модель Game
│   │   └── move.go              # Модель Move
│   ├── handlers/
│   │   ├── router.go            # Настройка роутера (gin)
│   │   ├── games.go             # HTTP handlers
│   │   └── websocket.go         # WebSocket handler
│   ├── services/
│   │   └── game_service.go      # Бизнес-логика
│   ├── realtime/
│   │   └── manager.go           # WebSocket менеджер
│   └── watchdog/
│       └── watchdog.go          # Фоновые задачи (timeout check)
├── go.mod
├── go.sum
├── Dockerfile
└── README.md
```

## Технологии

- **HTTP/WebSocket**: gin-gonic/gin + gorilla/websocket
- **БД**: jackc/pgx/v5 (async PostgreSQL driver)
- **Шахматы**: notnil/chess
- **JWT**: golang-jwt/jwt/v5
- **Метрики**: prometheus/client_golang

## Запуск

### Локально:

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"
export JWT_SECRET="your-secret"
export GAMES_INTERNAL_TOKEN="internal-token"

go run cmd/server/main.go
```

### Docker:

```bash
docker build -t games-service-go .
docker run -p 8000:8000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  games-service-go
```

## API Endpoints

### HTTP:
- `POST /api/games` - создать игру
- `GET /api/games/:game_id` - получить игру
- `POST /api/games/:game_id/join` - присоединиться
- `POST /api/games/:game_id/resign` - сдаться
- `POST /api/games/:game_id/timeout` - заявить таймаут
- `GET /api/games/:game_id/moves` - список ходов
- `GET /api/games` - список игр

### WebSocket:
- `GET /ws/games/:game_id?token=<jwt>` - подключение к игре

### Internal:
- `GET /internal/stats/:user_id` - статистика пользователя
