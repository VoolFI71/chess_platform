# 🚀 Быстрое руководство по тестированию

## Самый простой способ (1 команда)

```powershell
cd games_service_go
python benchmark_games.py --endpoint /api/games/ --requests 1000 --concurrent 10
```

---

## Пошаговая инструкция

### Шаг 1: Проверьте, что сервис запущен

```powershell
# Проверка статуса
docker-compose -f docker-compose.local.yml ps games

# Если не запущен, запустите:
docker-compose -f docker-compose.local.yml up -d games

# Проверьте, что endpoint работает:
curl http://localhost:8080/api/games/
# Должен вернуть JSON (может быть пустой массив [])
```

### Шаг 2: Установите зависимости (если нужно)

```powershell
pip install httpx
```

### Шаг 3: Запустите тест

```powershell
cd games_service_go
python benchmark_games.py --endpoint /api/games/ --requests 1000 --concurrent 10
```

**Параметры:**
- `--endpoint` - какой endpoint тестировать (по умолчанию `/api/games/`)
- `--requests` - сколько запросов сделать (рекомендуется: 1000-5000)
- `--concurrent` - сколько параллельных запросов (рекомендуется: 10-50)
- `--save` - сохранить результаты в JSON файл (опционально)

### Шаг 4: Посмотрите результаты

Скрипт автоматически выведет:
- Пропускную способность (запросов/сек)
- Среднее/медианное время ответа
- Процентили (50, 75, 90, 95, 99)
- Коды ответов

---

## Сравнение Python vs Go

### Вариант 1: Ручное переключение

**1. Тест Python версии:**

Откройте `docker-compose.local.yml`, найдите секцию `games:` (около строки 145) и убедитесь, что используется Python версия:

```yaml
  games:
    build:
      context: ./games_service  # ← Python версия
```

Запустите:
```powershell
docker-compose -f docker-compose.local.yml up --build -d games
# Подождите 10 секунд
cd games_service_go
python benchmark_games.py --endpoint /api/games/ --requests 2000 --concurrent 20 --save results_python.json
```

**2. Тест Go версии:**

Измените в `docker-compose.local.yml`:

```yaml
  games:
    build:
      context: ./games_service_go  # ← Go версия
```

Запустите:
```powershell
docker-compose -f docker-compose.local.yml up --build -d games
# Подождите 10 секунд
cd games_service_go
python benchmark_games.py --endpoint /api/games/ --requests 2000 --concurrent 20 --save results_go.json
```

**3. Сравните результаты:**

Результаты автоматически выводятся в консоль. Также посмотрите файлы:
- `results_python.json`
- `results_go.json`

---

## Примеры команд

### Быстрый тест (30 секунд)
```powershell
python benchmark_games.py --endpoint /api/games/ --requests 500 --concurrent 10
```

### Средний тест (1-2 минуты)
```powershell
python benchmark_games.py --endpoint /api/games/ --requests 2000 --concurrent 20 --save results.json
```

### Нагрузочный тест (3-5 минут)
```powershell
python benchmark_games.py --endpoint /api/games/ --requests 5000 --concurrent 50 --save stress.json
```

### Тест конкретной игры
```powershell
# Замените GAME_ID на реальный ID из БД
python benchmark_games.py --endpoint "/api/games/ваш-game-id" --requests 1000 --concurrent 10
```

### Тест получения ходов
```powershell
python benchmark_games.py --endpoint "/api/games/ваш-game-id/moves" --requests 1000 --concurrent 10
```

---

## Использование готового скрипта (Windows)

```powershell
cd games_service_go
.\quick_test.ps1
```

Скрипт сам:
- Проверит зависимости
- Проверит доступность сервиса
- Предложит выбрать тест
- Запустит бенчмарк
- Покажет результаты

---

## Что означают результаты?

### Пропускная способность (req/s)
**Больше = лучше**
- Python: обычно 100-500 req/s
- Go: обычно 500-2000+ req/s

### Время ответа (мс)
**Меньше = лучше**
- < 5 мс - отлично
- 5-10 мс - хорошо
- 10-50 мс - приемлемо
- > 50 мс - медленно

### 99-й процентиль (мс)
Показывает время ответа для 99% запросов (худшие случаи)
- < 20 мс - отлично
- 20-50 мс - хорошо
- > 50 мс - нужно оптимизировать

---

## Мониторинг ресурсов

Во время теста откройте второе окно PowerShell:

```powershell
# Мониторинг CPU и памяти
docker stats games

# Логи в реальном времени
docker-compose -f docker-compose.local.yml logs -f games
```

---

## Устранение проблем

### "Connection refused"
```powershell
# Проверьте, что сервис запущен
docker-compose -f docker-compose.local.yml ps games

# Запустите, если не запущен
docker-compose -f docker-compose.local.yml up -d games

# Проверьте логи
docker-compose -f docker-compose.local.yml logs games
```

### "ModuleNotFoundError: httpx"
```powershell
pip install httpx
```

### Медленные результаты
- Уменьшите `--concurrent` (например, до 5)
- Уменьшите `--requests` (например, до 500)
- Проверьте, что БД не перегружена: `docker stats db`

---

## Рекомендуемые тесты

Для **быстрого сравнения:**
```powershell
python benchmark_games.py --endpoint /api/games/ --requests 2000 --concurrent 20 --save results.json
```

Для **нагрузочного тестирования:**
```powershell
python benchmark_games.py --endpoint /api/games/ --requests 5000 --concurrent 50 --save stress.json
```

Для **стабильности:**
```powershell
# Запустите тест 3 раза и усредните результаты
python benchmark_games.py --endpoint /api/games/ --requests 1000 --concurrent 10 --save run1.json
python benchmark_games.py --endpoint /api/games/ --requests 1000 --concurrent 10 --save run2.json
python benchmark_games.py --endpoint /api/games/ --requests 1000 --concurrent 10 --save run3.json
```

---

## Следующие шаги

После получения результатов:
1. Сравните метрики Python vs Go
2. Проверьте использование ресурсов (CPU, память)
3. Протестируйте разные endpoints
4. Протестируйте под разной нагрузкой

Подробная документация: `BENCHMARK.md` или `HOW_TO_TEST.md`

