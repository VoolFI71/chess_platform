# Инструкция по настройке и запуску

## Шаги для запуска

### 1. Установка зависимостей

```bash
cd computer_games_service
go mod tidy
```

### 2. Проверка компиляции

```bash
go build ./cmd/server
```

### 3. Запуск через Docker Compose

```bash
# Из корня проекта
docker-compose -f docker-compose.local.yml up --build computer_games
```

### 4. Проверка работы

```bash
# Health check
curl http://localhost:8080/api/computer-games/health

# Создание игры (пример)
curl -X POST http://localhost:8080/api/computer-games \
  -H "Content-Type: application/json" \
  -d '{
    "creator_color": "white",
    "ai_skill_level": 5,
    "time_control": {
      "initial_ms": 600000,
      "increment_ms": 0,
      "type": "blitz"
    }
  }'
```

## Переменные окружения

Убедитесь, что в `.env` файле есть:

```env
DATABASE_URL=postgresql://chess:chess@db:5432/chess?sslmode=disable
JWT_SECRET=your-secret-key
COMPUTER_GAMES_INTERNAL_TOKEN=your-internal-token
STOCKFISH_PATH=/usr/bin/stockfish
AI_DEFAULT_SKILL_LEVEL=5
AI_DEFAULT_TIME_LIMIT_MS=2000
```

## Известные проблемы

1. **Ошибки линтера** - исчезнут после `go mod tidy`
2. **WithContext** - метод доступен через встроенный *gorm.DB
3. **Stockfish** - должен быть установлен в Docker контейнере (уже добавлен в Dockerfile)

## Следующие шаги

1. Доработать логику применения ходов (проверка таймаутов)
2. Добавить обработку ошибок AI
3. Протестировать WebSocket соединения
4. Создать frontend страницу

