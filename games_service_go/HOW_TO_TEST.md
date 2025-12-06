# Пошаговая инструкция по тестированию производительности

## Быстрый старт (5 минут)

### Шаг 1: Проверка текущей версии

Проверьте, какая версия запущена:
```bash
docker-compose -f docker-compose.local.yml ps games
```

### Шаг 2: Тест текущей версии

```bash
# Перейдите в директорию проекта
cd D:\projects\ch\games_service_go

# Запустите простой тест (1000 запросов, 10 параллельных)
python benchmark_games.py --endpoint /api/games/ --requests 1000 --concurrent 10
```

---

## Полное сравнение Python vs Go

### Вариант 1: Тестирование каждой версии отдельно (рекомендуется)

#### Тест 1: Python версия

1. **Включите Python версию в docker-compose.local.yml:**

Найдите строки около 145-175 и закомментируйте Go, раскомментируйте Python:

```yaml
  games:
    build:
      context: ./games_service
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgresql://chess:chess@db:5432/chess
      PORT: 8000
      JWT_SECRET: ${JWT_SECRET}
      GAMES_INTERNAL_TOKEN: ${GAMES_INTERNAL_TOKEN}
      METRICS_ENABLED: "true"
    depends_on:
      db:
        condition: service_started

#  games:
#    build:
#      context: ./games_service_go
#      dockerfile: Dockerfile
#    environment:
#      DATABASE_URL: postgresql://postgresql://chess:chess@db:5432/chess
#      PORT: 8000
#      JWT_SECRET: ${JWT_SECRET}
#      GAMES_INTERNAL_TOKEN: ${GAMES_INTERNAL_TOKEN}
#      METRICS_ENABLED: "true"
```

2. **Перезапустите games service:**
```bash
docker-compose -f docker-compose.local.yml up --build -d games
```

3. **Дождитесь запуска (5-10 секунд):**
```bash
docker-compose -f docker-compose.local.yml logs -f games
# Нажмите Ctrl+C когда увидите "Application startup complete"
```

4. **Запустите тест:**
```bash
cd games_service_go
python benchmark_games.py --endpoint /api/games/ --requests 2000 --concurrent 20 --save results_python.json
```

5. **Сохраните результаты** - они будут в файле `results_python.json`

---

#### Тест 2: Go версия

1. **Включите Go версию в docker-compose.local.yml:**

Закомментируйте Python, раскомментируйте Go:

```yaml
#  games:
#    build:
#      context: ./games_service
#      dockerfile: Dockerfile
#    environment:
#      DATABASE_URL: postgresql://chess:chess@db:5432/chess
#      PORT: 8000
#      JWT_SECRET: ${JWT_SECRET}
#      GAMES_INTERNAL_TOKEN: ${GAMES_INTERNAL_TOKEN}
#      METRICS_ENABLED: "true"
#    depends_on:
#      db:
#        condition: service_started

  games:
    build:
      context: ./games_service_go
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgresql://chess:chess@db:5432/chess
      PORT: 8000
      JWT_SECRET: ${JWT_SECRET}
      GAMES_INTERNAL_TOKEN: ${GAMES_INTERNAL_TOKEN}
      METRICS_ENABLED: "true"
```

2. **Перезапустите games service:**
```bash
docker-compose -f docker-compose.local.yml up --build -d games
```

3. **Дождитесь запуска:**
```bash
docker-compose -f docker-compose.local.yml logs -f games
# Нажмите Ctrl+C когда увидите "Games service (Go) starting"
```

4. **Запустите тест:**
```bash
cd games_service_go
python benchmark_games.py --endpoint /api/games/ --requests 2000 --concurrent 20 --save results_go.json
```

---

#### Сравнение результатов

Результаты автоматически выводятся в консоль. Также они сохранены в JSON файлах.

Для просмотра сохраненных результатов:
```bash
# Windows PowerShell
Get-Content results_python.json | ConvertFrom-Json | ConvertTo-Json -Depth 10
Get-Content results_go.json | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

---

## Примеры тестов

### 1. Быстрый тест (30 секунд)
```bash
python benchmark_games.py --endpoint /api/games/ --requests 500 --concurrent 10
```

### 2. Средний тест (1-2 минуты)
```bash
python benchmark_games.py --endpoint /api/games/ --requests 2000 --concurrent 20 --save results.json
```

### 3. Нагрузочный тест (3-5 минут)
```bash
python benchmark_games.py --endpoint /api/games/ --requests 5000 --concurrent 50 --save stress_test.json
```

### 4. Тест получения конкретной игры
```bash
# Сначала получите ID игры из БД или создайте тестовую
GAME_ID="ваш-game-id-из-бд"
python benchmark_games.py --endpoint "/api/games/$GAME_ID" --requests 1000 --concurrent 10
```

### 5. Тест с авторизацией (создание игр)

1. **Получите JWT токен:**
   - Откройте сайт в браузере
   - Войдите в аккаунт
   - Откройте DevTools (F12) -> Application -> Local Storage
   - Скопируйте значение `access_token`

2. **Запустите тест:**
```bash
python benchmark_games.py --endpoint /api/games/ --requests 100 --concurrent 5 --token "ваш_jwt_токен"
```

---

## Мониторинг во время теста

Откройте отдельное окно PowerShell и следите за ресурсами:

```powershell
# Мониторинг использования ресурсов
docker stats games

# Просмотр логов в реальном времени
docker-compose -f docker-compose.local.yml logs -f games
```

---

## Интерпретация результатов

### Ключевые метрики:

1. **Пропускная способность (req/s)** - больше = лучше
   - Python: обычно 100-500 req/s
   - Go: обычно 500-2000+ req/s

2. **Среднее время ответа (мс)** - меньше = лучше
   - Хорошо: < 10 мс
   - Отлично: < 5 мс

3. **99-й процентиль (мс)** - показывает худшие случаи
   - Хорошо: < 50 мс
   - Отлично: < 20 мс

4. **Стандартное отклонение (мс)** - стабильность
   - Хорошо: < 5 мс
   - Отлично: < 2 мс

### Ожидаемые улучшения Go vs Python:

- **Пропускная способность:** +50-200%
- **Время ответа:** -30-70%
- **Использование памяти:** -50-80%
- **Использование CPU:** -20-50%

---

## Устранение проблем

### Ошибка: "Connection refused"
```bash
# Проверьте, что сервис запущен
docker-compose -f docker-compose.local.yml ps games

# Проверьте логи
docker-compose -f docker-compose.local.yml logs games
```

### Ошибка: "ModuleNotFoundError: No module named 'httpx'"
```bash
pip install httpx
```

### Ошибка: "401 Unauthorized"
- Для публичных endpoints (GET /api/games/) токен не нужен
- Для защищенных endpoints (POST /api/games/) нужен токен

### Медленные результаты
- Убедитесь, что БД не перегружена
- Проверьте сеть между контейнерами
- Уменьшите `--concurrent` для стабильности

---

## Скрипт для автоматического переключения версий

Создайте файл `switch_games_version.ps1`:

```powershell
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("python", "go")]
    [string]$Version
)

$composeFile = "docker-compose.local.yml"
$content = Get-Content $composeFile -Raw

if ($Version -eq "python") {
    Write-Host "Переключаю на Python версию..."
    # Раскомментируйте Python, закомментируйте Go
    $content = $content -replace '#  games:\s+\(Python\)', '  games: # (Python)'
    $content = $content -replace '  games:\s+\(Go\)', '#  games: # (Go)'
} else {
    Write-Host "Переключаю на Go версию..."
    # Раскомментируйте Go, закомментируйте Python
    $content = $content -replace '#  games:\s+\(Go\)', '  games: # (Go)'
    $content = $content -replace '  games:\s+\(Python\)', '#  games: # (Python)'
}

Set-Content $composeFile $content
Write-Host "Перезапускаю сервис..."
docker-compose -f $composeFile up --build -d games
Write-Host "Готово!"
```

Использование:
```powershell
.\switch_games_version.ps1 python
.\switch_games_version.ps1 go
```

---

## Быстрая проверка работоспособности

Перед тестом убедитесь, что endpoint работает:

```bash
# Простой запрос
curl http://localhost:8080/api/games/

# Или в браузере
# http://localhost:8080/api/games/
```

Должен вернуться JSON с массивом игр или пустым массивом `[]`.

