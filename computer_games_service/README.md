# Computer Games Service

Микросервис для управления шахматными партиями против искусственного интеллекта (компьютера).

## Структура проекта

```
computer_games_service/
├── cmd/
│   └── server/
│       └── main.go              # Точка входа
├── internal/
│   ├── config/
│   │   └── config.go            # Конфигурация из env
│   ├── database/
│   │   └── db.go                # Подключение к PostgreSQL
│   ├── ai/
│   │   ├── engine.go            # Интерфейс для AI движков
│   │   └── stockfish.go         # Реализация Stockfish через UCI
│   ├── models/
│   │   └── computer_game.go     # Модели Game и Move
│   ├── handlers/
│   │   ├── router.go            # Настройка роутера
│   │   ├── games.go             # HTTP handlers
│   │   ├── middleware.go        # Middleware для аутентификации
│   │   └── websocket.go         # WebSocket handler
│   ├── services/
│   │   ├── computer_game_service.go  # Бизнес-логика игр
│   │   └── ai_service.go        # Обертка над AI движком
│   └── realtime/
│       └── manager.go           # WebSocket менеджер
├── Dockerfile
├── go.mod
└── README.md
```

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

### Локально:

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/chess"
export JWT_SECRET="your-secret"
export STOCKFISH_PATH="/usr/bin/stockfish"

go run cmd/server/main.go
```

### Docker:

```bash
docker build -t computer-games-service .
docker run -p 8000:8000 \
  -e DATABASE_URL="postgresql://user:pass@db:5432/chess" \
  -e JWT_SECRET="your-secret" \
  computer-games-service
```

## Статус разработки

- ✅ Базовая структура микросервиса
- ✅ AI модуль (Stockfish)
- ✅ HTTP handlers
- ✅ WebSocket поддержка
- ⏳ Логика применения ходов (в разработке)
- ⏳ Интеграция в docker-compose
- ⏳ Nginx routing

