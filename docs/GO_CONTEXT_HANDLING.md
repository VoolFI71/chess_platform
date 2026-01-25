# Обработка контекстов и соединений в Go сервисах

## Принципы работы с контекстами

### 1. Использование контекста из HTTP запроса

Все HTTP handlers должны передавать контекст запроса в сервисы:

```go
func getGame(service *services.GameService) gin.HandlerFunc {
	return func(c *gin.Context) {
		game, err := service.GetGame(c.Request.Context(), gameID)
		// ...
	}
}
```

**Реализация**: [`games_service_go/internal/handlers/games.go`](games_service_go/internal/handlers/games.go#L74)

### 2. Контекст с таймаутом для фоновых задач

Для фоновых операций (например, ход AI) используется контекст с таймаутом:

```go
go func() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := s.MakeComputerMove(ctx, gameID); err != nil {
		// обработка ошибки
	}
}()
```

**Реализация**: [`computer_games_service/internal/services/computer_game_service.go`](computer_games_service/internal/services/computer_game_service.go#L174-L180)

### 3. Контекст для WebSocket соединений

WebSocket handlers создают контекст с таймаутом на основе контекста запроса:

```go
ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
defer cancel()
```

**Реализация**: [`computer_games_service/internal/handlers/websocket.go`](computer_games_service/internal/handlers/websocket.go#L50)

### 4. Контекст для watchdog операций

Фоновые задачи (watchdog) используют контекст с таймаутом:

```go
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()
```

**Реализация**: [`games_service_go/internal/watchdog/watchdog.go`](games_service_go/internal/watchdog/watchdog.go#L59)

## Закрытие соединений с БД

### 1. Graceful shutdown

Все сервисы правильно закрывают соединения при завершении:

```go
defer db.Close()
```

**Реализация**: 
- [`games_service_go/cmd/server/main.go`](games_service_go/cmd/server/main.go#L90)
- [`computer_games_service/cmd/server/main.go`](computer_games_service/cmd/server/main.go#L33)

### 2. Настройка пула соединений

Пул соединений настроен для предотвращения утечек:

```go
sqlDB.SetMaxOpenConns(20)
sqlDB.SetMaxIdleConns(5)
sqlDB.SetConnMaxLifetime(time.Hour)
sqlDB.SetConnMaxIdleTime(30 * time.Minute)
```

**Реализация**: [`games_service_go/internal/database/db.go`](games_service_go/internal/database/db.go#L30-L33)

### 3. Использование WithContext для всех запросов

Все запросы к БД используют контекст:

```go
if err := s.db.WithContext(ctx).First(&game, "id = ?", gameID).Error; err != nil {
	// обработка ошибки
}
```

**Реализация**: [`games_service_go/internal/services/game_service.go`](games_service_go/internal/services/game_service.go#L131)

## Graceful shutdown HTTP сервера

Серверы корректно завершают работу с таймаутом:

```go
ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()

if err := srv.Shutdown(ctx); err != nil {
	log.Fatalf("Server forced to shutdown: %v", err)
}
```

**Реализация**: [`games_service_go/cmd/server/main.go`](games_service_go/cmd/server/main.go#L143-L148)
