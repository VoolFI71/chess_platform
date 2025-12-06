# 🚀 НАЧНИТЕ ЗДЕСЬ - Как протестировать

## Самый простой способ (1 команда)

Откройте PowerShell в директории `games_service_go` и выполните:

```powershell
python benchmark_games.py --endpoint /api/games/ --requests 1000 --concurrent 10
```

---

## Пошаговая инструкция

### 1. Откройте PowerShell в правильной директории

```powershell
cd D:\projects\ch\games_service_go
```

### 2. Проверьте, что сервис работает

```powershell
# Простой запрос
curl http://localhost:8080/api/games/

# Или в браузере откройте:
# http://localhost:8080/api/games/
```

Должен вернуться JSON (может быть пустой массив `[]`).

### 3. Установите зависимости (если нужно)

```powershell
pip install httpx
```

### 4. Запустите тест

**Вариант A: Простой тест (рекомендуется для начала)**
```powershell
python benchmark_games.py --endpoint /api/games/ --requests 1000 --concurrent 10
```

**Вариант B: С сохранением результатов**
```powershell
python benchmark_games.py --endpoint /api/games/ --requests 1000 --concurrent 10 --save results.json
```

**Вариант C: Используя скрипт (интерактивный)**
```powershell
.\run_test.ps1
```

---

## Что вы увидите

После запуска скрипт выведет:

```
========================================
[Go] Результаты теста
========================================
Всего запросов: 1000
Успешных: 1000
Время выполнения: 2.45 секунд
Запросов/сек: 408.16

Время ответа (мс):
  Минимум: 1.23
  Максимум: 15.67
  Среднее: 2.45
  Медиана: 2.10
  99-й процентиль: 8.90
```

---

## Сравнение Python vs Go

### Шаг 1: Тест Go версии (сейчас запущена)

```powershell
cd games_service_go
python benchmark_games.py --endpoint /api/games/ --requests 2000 --concurrent 20 --save results_go.json
```

### Шаг 2: Переключитесь на Python

1. Откройте файл `docker-compose.local.yml`
2. Найдите секцию `games:` (около строки 159)
3. Закомментируйте Go версию (строки 159-179):
```yaml
#  games:
#    build:
#      context: ./games_service_go
```

4. Раскомментируйте Python версию (строки 142-157):
```yaml
  games:
    build:
      context: .
      dockerfile: games_service/Dockerfile
```

5. Перезапустите:
```powershell
docker-compose -f docker-compose.local.yml up --build -d games
```

6. Подождите 10 секунд, затем запустите тест:
```powershell
cd games_service_go
python benchmark_games.py --endpoint /api/games/ --requests 2000 --concurrent 20 --save results_python.json
```

### Шаг 3: Сравните

Результаты автоматически выводятся в консоль. Также посмотрите файлы:
- `results_go.json`
- `results_python.json`

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

---

## Устранение проблем

### Ошибка: "python не найден"
```powershell
# Проверьте, что Python установлен
python --version

# Если не установлен, скачайте с python.org
```

### Ошибка: "ModuleNotFoundError: httpx"
```powershell
pip install httpx
```

### Ошибка: "Connection refused"
```powershell
# Проверьте, что сервис запущен
docker-compose -f docker-compose.local.yml ps games

# Если не запущен:
docker-compose -f docker-compose.local.yml up -d games

# Проверьте логи:
docker-compose -f docker-compose.local.yml logs games
```

### Скрипт не запускается (PowerShell)
```powershell
# Разрешите выполнение скриптов (один раз)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Затем запустите:
.\run_test.ps1
```

---

## Мониторинг во время теста

Откройте второе окно PowerShell:

```powershell
# Мониторинг ресурсов
docker stats games

# Логи в реальном времени
docker-compose -f docker-compose.local.yml logs -f games
```

---

## Что означают результаты?

- **Пропускная способность (req/s)** - больше = лучше
- **Время ответа (мс)** - меньше = лучше
- **99-й процентиль** - показывает худшие случаи

**Ожидаемые улучшения Go vs Python:**
- Пропускная способность: +50-200%
- Время ответа: -30-70%

---

## Нужна помощь?

Смотрите подробные инструкции:
- `TESTING_GUIDE.md` - быстрое руководство
- `HOW_TO_TEST.md` - подробная инструкция
- `BENCHMARK.md` - полная документация

