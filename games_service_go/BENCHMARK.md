# Руководство по сравнению производительности Python и Go версий

## Быстрый старт

### 1. Установка зависимостей

```bash
pip install httpx asyncio
```

### 2. Базовое сравнение

```bash
# Тест с 1000 запросов, 10 параллельных
python benchmark_games.py \
  --python-url http://localhost:8080 \
  --go-url http://localhost:8080 \
  --endpoint /api/games/ \
  --requests 1000 \
  --concurrent 10
```

### 3. Тест с авторизацией

```bash
# Получите JWT токен из браузера (DevTools -> Application -> Local Storage -> access_token)
TOKEN="ваш_jwt_токен"

# Тест создания игры (требует авторизации)
python benchmark_games.py \
  --endpoint /api/games/ \
  --requests 100 \
  --concurrent 5 \
  --token $TOKEN
```

## Сценарии тестирования

### Сценарий 1: Получение списка игр (GET /api/games/)

```bash
python benchmark_games.py \
  --endpoint /api/games/ \
  --requests 2000 \
  --concurrent 20 \
  --save results_list_games.json
```

### Сценарий 2: Получение конкретной игры (GET /api/games/{id})

```bash
# Сначала получите ID игры из БД или создайте тестовую
GAME_ID="ваш-game-id"

python benchmark_games.py \
  --endpoint /api/games/$GAME_ID \
  --requests 2000 \
  --concurrent 20 \
  --save results_get_game.json
```

### Сценарий 3: Получение ходов (GET /api/games/{id}/moves)

```bash
GAME_ID="ваш-game-id"

python benchmark_games.py \
  --endpoint /api/games/$GAME_ID/moves \
  --requests 2000 \
  --concurrent 20 \
  --save results_get_moves.json
```

### Сценарий 4: Высокая нагрузка

```bash
python benchmark_games.py \
  --endpoint /api/games/ \
  --requests 5000 \
  --concurrent 50 \
  --save results_high_load.json
```

## Переключение между версиями

Для сравнения нужно тестировать каждую версию отдельно:

### Шаг 1: Тест Python версии

1. В `docker-compose.local.yml` закомментируйте Go версию и раскомментируйте Python:
```yaml
#  games:
#    build:
#      context: ./games_service_go
#      dockerfile: Dockerfile
  games:
    build:
      context: ./games_service
      dockerfile: Dockerfile
```

2. Перезапустите сервисы:
```bash
docker-compose -f docker-compose.local.yml up --build -d games
```

3. Запустите бенчмарк:
```bash
python benchmark_games.py \
  --endpoint /api/games/ \
  --requests 1000 \
  --concurrent 10 \
  --save results_python.json
```

### Шаг 2: Тест Go версии

1. В `docker-compose.local.yml` переключите на Go версию
2. Перезапустите сервисы
3. Запустите бенчмарк:
```bash
python benchmark_games.py \
  --endpoint /api/games/ \
  --requests 1000 \
  --concurrent 10 \
  --save results_go.json
```

### Шаг 3: Сравнение результатов

```python
import json

with open("results_python.json") as f:
    py = json.load(f)

with open("results_go.json") as f:
    go = json.load(f)

py_rps = py["requests_per_second"]
go_rps = go["requests_per_second"]
improvement = ((go_rps - py_rps) / py_rps) * 100

print(f"Python: {py_rps:.2f} req/s")
print(f"Go:     {go_rps:.2f} req/s")
print(f"Улучшение: {improvement:+.1f}%")
```

## Альтернативные инструменты

### 1. wrk (HTTP нагрузочный тестер)

```bash
# Установка (Linux/Mac)
# sudo apt-get install wrk  # Ubuntu/Debian
# brew install wrk          # macOS

# Тест списка игр
wrk -t12 -c400 -d30s http://localhost:8080/api/games/

# С токеном
wrk -t12 -c400 -d30s -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8080/api/games/
```

### 2. Apache Bench (ab)

```bash
# Тест с 1000 запросов, 10 параллельных
ab -n 1000 -c 10 http://localhost:8080/api/games/

# С токеном
ab -n 1000 -c 10 -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8080/api/games/
```

### 3. k6

```javascript
// benchmark.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  const res = http.get('http://localhost:8080/api/games/');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 100ms': (r) => r.timings.duration < 100,
  });
}
```

Запуск: `k6 run benchmark.js`

## Метрики для сравнения

### Ключевые метрики:
1. **Пропускная способность** (requests/second) - сколько запросов обрабатывается в секунду
2. **Среднее время ответа** - среднее время обработки запроса
3. **Медианное время ответа** - более стабильная метрика, не зависит от выбросов
4. **99-й процентиль** - время ответа для 99% запросов (показывает худшие случаи)
5. **Стандартное отклонение** - вариативность времени ответа

### Ожидаемые результаты:

**Python версия (FastAPI):**
- Среднее время ответа: 5-20 мс (в зависимости от запроса)
- Пропускная способность: 100-500 req/s (зависит от сложности)

**Go версия (Gin):**
- Среднее время ответа: 1-10 мс
- Пропускная способность: 500-2000+ req/s

### Интерпретация:
- **Улучшение > 50%** - отличный результат
- **Улучшение 20-50%** - хороший результат
- **Улучшение < 20%** - возможно, узкое место в БД, а не в коде приложения

## Мониторинг ресурсов

Во время тестирования следите за:

```bash
# CPU использование
docker stats

# Логи сервисов
docker-compose -f docker-compose.local.yml logs -f games

# Использование памяти
docker stats games
```

## Рекомендации

1. **Прогревайте кеш** перед основным тестом (первые несколько запросов медленнее)
2. **Тестируйте в одинаковых условиях** (одинаковая БД, данные, окружение)
3. **Делайте несколько прогонов** и усредняйте результаты
4. **Тестируйте разные endpoints** - производительность может отличаться
5. **Мониторьте ресурсы** - узкое место может быть не в коде, а в БД или сети

