# Проблема: Заброшенные партии не удаляются из БД

## Описание проблемы

Партии, которые созданы анонимными или авторизованными пользователями, но не нашли второго игрока, не удаляются из БД даже после суток ожидания. Они остаются в статусе `CREATED` и продолжают отображаться в зале ожидания.

## Текущая реализация

**Файл:** `games_service_go/internal/watchdog/watchdog.go`

**Проблемы:**

1. **Слишком строгое условие `move_count = 0`**
   - Удаляются только партии, где `move_count = 0`
   - Если по какой-то причине `move_count > 0`, партия не удалится
   - Для партий в статусе `CREATED` без обоих игроков это условие избыточно

2. **Сложная проверка metadata через JSONB**
   - Условие проверки может работать некорректно с NULL значениями
   - Может быть проблема с типами данных в JSONB

3. **Таймаут 10 минут может быть слишком коротким**
   - Но пользователь сообщает о партиях, висящих сутки, значит они не удаляются вообще

## Текущий код

```go
const (
    watchdogIntervalSeconds     = 15
    abandonedGameTimeoutMinutes = 10  // ← Слишком короткий таймаут
    recentMovesLimit            = 120
)

func (w *Watchdog) cleanupAbandonedGames(ctx context.Context) {
    cutoffTime := time.Now().UTC().Add(-abandonedGameTimeoutMinutes * time.Minute)

    whereClause := `status = ? AND move_count = ? AND created_at < ? AND (
        (white_id IS NULL AND (metadata->>'white_session_id' IS NULL OR metadata->>'white_session_id' = '')) OR
        (black_id IS NULL AND (metadata->>'black_session_id' IS NULL OR metadata->>'black_session_id' = ''))
    )`

    // ...
    Where(whereClause, models.GameStatusCreated, 0, cutoffTime).
    // ...
}
```

## Решение

### 1. Упростить условие удаления

Убрать проверку `move_count = 0` или сделать её менее строгой. Если партия в статусе `CREATED` и нет обоих игроков, она должна удаляться независимо от `move_count`.

### 2. Упростить проверку игроков

Использовать более простую и надежную проверку:

```go
func (w *Watchdog) cleanupAbandonedGames(ctx context.Context) {
    // Увеличиваем таймаут до 1 часа (или 24 часов по требованию)
    cutoffTime := time.Now().UTC().Add(-24 * time.Hour) // 24 часа вместо 10 минут

    // Упрощенное условие:
    // 1. Статус = CREATED
    // 2. Создана более N часов назад
    // 3. Нет обоих игроков (проверяем через COALESCE для упрощения)
    
    whereClause := `status = ? AND created_at < ? AND (
        (white_id IS NULL AND COALESCE(metadata->>'white_session_id', '') = '') OR
        (black_id IS NULL AND COALESCE(metadata->>'black_session_id', '') = '')
    )`

    var abandonedGames []models.Game
    if err := w.db.WithContext(ctx).
        Where(whereClause, models.GameStatusCreated, cutoffTime).
        Find(&abandonedGames).Error; err != nil {
        log.Printf("[Watchdog] Failed to query abandoned games: %v", err)
        return
    }

    if len(abandonedGames) == 0 {
        return
    }

    // Удаляем заброшенные игры
    result := w.db.WithContext(ctx).
        Where(whereClause, models.GameStatusCreated, cutoffTime).
        Delete(&models.Game{})

    if result.Error != nil {
        log.Printf("[Watchdog] Failed to delete abandoned games: %v", result.Error)
        return
    }

    deletedCount := int(result.RowsAffected)
    log.Printf("[Watchdog] Deleted %d abandoned game(s)", deletedCount)

    // Broadcast отмены для каждой игры
    for _, game := range abandonedGames {
        w.wsManager.Broadcast(game.ID, map[string]interface{}{
            "type":    "game_cancelled",
            "game_id": game.ID.String(),
        })
    }
}
```

### 3. Альтернативный вариант (еще проще)

Если нужно удалять ВСЕ партии в статусе CREATED без обоих игроков старше N часов:

```go
func (w *Watchdog) cleanupAbandonedGames(ctx context.Context) {
    cutoffTime := time.Now().UTC().Add(-24 * time.Hour) // 24 часа

    // Удаляем партии, где:
    // - статус CREATED
    // - созданы более 24 часов назад
    // - нет хотя бы одного игрока (белых ИЛИ черных)
    whereClause := `status = ? AND created_at < ? AND (
        (white_id IS NULL AND (metadata->>'white_session_id' IS NULL OR metadata->>'white_session_id' = '')) OR
        (black_id IS NULL AND (metadata->>'black_session_id' IS NULL OR metadata->>'black_session_id' = ''))
    )`

    result := w.db.WithContext(ctx).
        Where(whereClause, models.GameStatusCreated, cutoffTime).
        Delete(&models.Game{})

    if result.Error != nil {
        log.Printf("[Watchdog] Failed to delete abandoned games: %v", result.Error)
        return
    }

    deletedCount := int(result.RowsAffected)
    if deletedCount > 0 {
        log.Printf("[Watchdog] Deleted %d abandoned game(s) older than 24 hours", deletedCount)
    }
}
```

### 4. Обновить константу таймаута

```go
const (
    watchdogIntervalSeconds     = 15
    abandonedGameTimeoutMinutes = 24 * 60  // 24 часа вместо 10 минут
    recentMovesLimit            = 120
)
```

## Рекомендации

1. **Убрать условие `move_count = 0`** - оно избыточно для партий в статусе CREATED
2. **Увеличить таймаут до 1 часа** (или другое разумное значение)
3. **Упростить проверку metadata** - использовать COALESCE для надежности
4. **Добавить логирование** для отладки - логировать количество найденных и удаленных партий

## Приоритет

**Критический** - партии накапливаются в БД и засоряют зал ожидания.

## Проверка

После исправления проверить:
1. Удаляются ли партии старше 1 часа без обоих игроков
2. Не удаляются ли активные партии
3. Работает ли проверка для анонимных пользователей (session_id)
4. Работает ли проверка для авторизованных пользователей (user_id)
