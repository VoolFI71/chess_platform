# Computer Games Service

Микросервис для управления шахматными партиями против искусственного интеллекта (компьютера).

## Структура проекта

```
computer_games_service/
├── internal/
│   ├── config/
│   │   └── config.go
│   ├── database/
│   │   └── db.go
│   ├── ai/
│   │   ├── engine.go
│   │   ├── stockfish.go
│   │   └── stockfish_pool.go
│   ├── models/
│   │   └── computer_game.go
│   ├── handlers/
│   │   ├── router.go
│   │   ├── games.go
│   │   ├── games_test.go
│   │   ├── middleware.go
│   │   ├── metrics_middleware.go
│   │   └── websocket.go
│   ├── services/
│   │   ├── computer_game_service.go
│   │   └── ai_service.go
│   └── realtime/
│       └── manager.go
├── Dockerfile
├── go.mod
├── go.sum
└── README.md
```

Точка входа в репозитории отсутствует. Dockerfile собирает бинарник из пакета `./cmd/server` — для успешной сборки нужен каталог `cmd/server` с `main.go`.

## Технологии

- **HTTP/WebSocket**: gin-gonic/gin + gorilla/websocket
- **БД**: gorm.io/gorm + gorm.io/driver/postgres
- **Шахматы**: notnil/chess
- **AI**: Stockfish (через UCI протокол)
- **JWT**: golang-jwt/jwt/v5
- **Метрики**: prometheus/client_golang

## Переменные окружения

```env
PORT=8000
DATABASE_URL=postgresql://user:pass@localhost:5432/chess
JWT_SECRET=your-secret-key
COMPUTER_GAMES_INTERNAL_TOKEN=internal-token
STOCKFISH_PATH=/usr/bin/stockfish
AI_DEFAULT_SKILL_LEVEL=5
AI_DEFAULT_TIME_LIMIT_MS=2000
```

## API Endpoints

### POST /api/computer-games
Создает новую игру с компьютером.

**Request:**
```json
{
  "creator_color": "white" | "black" | "random",
  "ai_skill_level": 0-20,
  "time_control": {
    "initial_ms": 600000,
    "increment_ms": 0,
    "type": "blitz"
  }
}
```

**Response:**
```json
{
  "id": "uuid",
  "white_id": 123,
  "black_id": null,
  "status": "CREATED",
  "next_turn": "w",
  "metadata": {
    "game_type": "computer",
    "ai_level": 5,
    "ai_color": "black"
  }
}
```

### GET /api/computer-games/:game_id
Получает информацию об игре.

### GET /api/computer-games/:game_id/moves
Получает список ходов игры.

### WebSocket: /ws/computer-games/:game_id
Подключение для real-time обновлений игры.

## Уровни сложности AI

| Skill Level | Примерный ELO | Описание |
|-------------|---------------|----------|
| 1 | ~800 | Новичок |
| 5 | ~1200 | Любитель |
| 10 | ~1600 | Продвинутый |
| 15 | ~2000 | Мастер |
| 20 | ~2800+ | Гроссмейстер |

## Запуск

Точка входа (`cmd/server/main.go`) в репозитории пока не добавлена. После её появления:

**Локально:**
```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/chess"
export JWT_SECRET="your-secret"
export STOCKFISH_PATH="/usr/bin/stockfish"

go run ./cmd/server
```

**Docker** (сборка идёт из `./cmd/server`):
```bash
docker build -t computer-games-service .
docker run -p 8000:8000 \
  -e DATABASE_URL="postgresql://user:pass@db:5432/chess" \
  -e JWT_SECRET="your-secret" \
  computer-games-service
```

