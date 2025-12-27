# Деплой функциональности "Задача дня"

## Обзор

Функциональность "Задача дня" позволяет всем пользователям решать одну и ту же задачу в течение календарных суток. Задача выбирается случайным образом из диапазона рейтинга 2700-3000.

## Компоненты

### Backend

1. **Модель данных**: `puzzles_service/app/models/daily_puzzle.py`
   - Таблица `daily_puzzles` хранит выбранные задачи по датам
   - Уникальный constraint на поле `date` предотвращает дубликаты

2. **Сервис**: `puzzles_service/app/services/daily_puzzle.py`
   - `DailyPuzzleService.get_or_create_for_date()` - основная логика
   - Использует atomic upsert для предотвращения race conditions
   - Интегрирован с `PuzzleCache` для получения задач

3. **API Endpoint**: `GET /api/puzzles/daily`
   - Возвращает задачу дня с метаданными (дата, рейтинг, chosen_at)
   - Использует схему `DailyPuzzleResponse`

### Frontend

1. **HTML страница**: `backend/web/daily.html`
   - Отображает задачу дня с доской
   - Показывает дату, рейтинг и счетчик до следующей задачи

2. **JavaScript**: `backend/web/scripts/daily.js`
   - Загружает задачу через API
   - Рендерит доску используя существующие модули
   - Управляет показом/скрытием решения

3. **Стили**: `backend/web/styles/pages/daily.css`

## Миграции

Миграция создает таблицу `daily_puzzles`:
- `puzzles_service/alembic/versions/0005_add_daily_puzzles.py`

Выполнить миграцию:
```bash
# Миграции выполняются автоматически через migrations_service при старте контейнеров
# Или вручную:
cd puzzles_service
alembic upgrade head
```

## Warm-up кеша

**ВАЖНО**: Для корректной работы функциональности необходимо заполнить кеш задач для диапазона рейтинга 2700-3000 при старте сервиса.

### Рекомендация: Warm-up при старте

Добавить в `puzzles_service/app/main.py` в функцию `on_startup()`:

```python
@app.on_event("startup")
async def on_startup() -> None:
    logger.info("Puzzles service startup initiated")
    
    # Warm-up кеша для задачи дня (рейтинг 2700-3000)
    try:
        from ..services.puzzle_cache import get_puzzle_cache
        from ..schemas import PuzzleFilters
        
        cache = get_puzzle_cache()
        filters = PuzzleFilters(rating_min=2700, rating_max=3000)
        
        # Запускаем обновление кеша в фоне (не блокируем старт)
        asyncio.create_task(cache.get_random_puzzle(filters))
        logger.info("Started warm-up cache for daily puzzle (rating 2700-3000)")
    except Exception as exc:
        logger.warning("Failed to warm-up cache for daily puzzle: %s", exc)
    
    logger.info("Puzzles service startup completed")
```

### Альтернатива: Ручной warm-up

Если warm-up не добавлен в код, можно выполнить вручную после деплоя:

```bash
# Выполнить запрос к API для создания первой задачи дня
curl http://localhost:8000/api/puzzles/daily
```

Это создаст запись в `daily_puzzles` и заполнит кеш.

## Мониторинг

### Логирование

Сервис логирует следующие события:
- Создание новой задачи дня: `INFO` уровень
- Загрузка существующей задачи: `INFO` уровень
- Ошибки получения задачи из кеша: `WARNING` / `ERROR` уровень
- Race conditions при параллельных запросах: `INFO` уровень

### Метрики

Метрики собираются автоматически через `prometheus-fastapi-instrumentator`:
- `http_requests_total` - общее количество запросов к `/api/puzzles/daily`
- `http_request_duration_seconds` - время ответа endpoint'а

### Проверка работоспособности

1. Проверить наличие записи в таблице:
```sql
SELECT * FROM daily_puzzles ORDER BY date DESC LIMIT 1;
```

2. Проверить API endpoint:
```bash
curl http://localhost:8000/api/puzzles/daily
```

3. Проверить фронтенд:
```bash
curl http://localhost:8000/daily
```

## Troubleshooting

### Проблема: Endpoint возвращает 404

**Причина**: Кеш пуст для диапазона рейтинга 2700-3000

**Решение**: 
1. Убедиться, что в базе есть задачи с рейтингом 2700-3000
2. Выполнить warm-up кеша (см. выше)
3. Проверить логи сервиса на наличие ошибок

### Проблема: Race condition при параллельных запросах

**Причина**: Несколько запросов одновременно создают задачу дня

**Решение**: Уже обработано в коде через `IntegrityError` handling. При обнаружении конфликта запрос автоматически загружает существующую запись.

### Проблема: Задача не обновляется каждый день

**Причина**: Логика использует текущую дату (`date.today()`), проверьте часовой пояс сервера

**Решение**: Убедиться, что сервер использует UTC или корректный часовой пояс

## Тестирование

Unit тесты: `puzzles_service/tests/test_daily_puzzle.py`

Запуск тестов:
```bash
cd puzzles_service
pytest tests/test_daily_puzzle.py -v
```

## Производительность

- Endpoint должен отвечать быстро (<100ms) при наличии записи в БД
- Первый запрос дня может быть медленнее из-за создания записи и загрузки из кеша
- Race conditions обрабатываются корректно без блокировок

