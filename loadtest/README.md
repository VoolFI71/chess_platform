# Нагрузочное тестирование (ChessMint)

Базовый домен продакшена: **`https://chessmint.ru`**. Для стейджа задайте свой URL через переменные окружения.

## Перед тестом («патроны»)

1. В БД должны быть задачи в таблице `puzzles` — иначе `/api/puzzles/random` вернёт **404** и тест бессмысленен.
2. Один раз «прогреть» кеш: откройте в браузере или выполните:
   ```bash
   curl -sS -o /dev/null -w "%{http_code}\n" "https://chessmint.ru/api/puzzles/random?rating_min=800&rating_max=2000"
   ```
3. **Не гоняйте прод** без согласования: используйте стейдж или низкие `-c` / `stages` в k6.

## k6

Установка: https://k6.io/docs/get-started/installation/

```bash
# Прод (осторожно)
k6 run loadtest/k6/puzzles-random.js

# Стейдж / локальный gateway
set BASE_URL=https://staging.chessmint.ru
k6 run -e BASE_URL=%BASE_URL% loadtest/k6/puzzles-random.js
```

Переменные:

| Переменная   | По умолчанию              | Описание |
|--------------|---------------------------|----------|
| `BASE_URL`   | `https://chessmint.ru`    | Без завершающего `/` |
| `RATING_MIN` | `800`                     | query `rating_min` |
| `RATING_MAX` | `2000`                    | query `rating_max` |

Лёгкий смоук без нагрузки:

```bash
k6 run loadtest/k6/smoke.js
```

## wrk

Установка: собрать [wg/wrk](https://github.com/wg/wrk) или пакет дистрибутива.

Из корня репозитория (Git Bash / WSL / Linux):

```bash
chmod +x loadtest/wrk/random_puzzle.sh
BASE_URL=https://chessmint.ru ./loadtest/wrk/random_puzzle.sh
```

Переменные: `BASE_URL`, `RATING_MIN`, `RATING_MAX`, `THREADS`, `CONNECTIONS`, `DURATION` (см. скрипт).

На Windows (PowerShell) через Git Bash или WSL:

```powershell
$env:BASE_URL="https://chessmint.ru"; bash ./loadtest/wrk/random_puzzle.sh
```

Файл `wrk/random_puzzle.lua` не используется: wrk вызывается с **полным URL** одним аргументом.

## Что смотреть в отчёте

- k6: `http_req_duration`, `http_req_failed`, stages.
- На сервере: CPU/RAM, PostgreSQL, при необходимости Redis/кеш задач.

## Эндпоинт

Публичный путь за gateway: **`GET /api/puzzles/random`**  
Параметры: `rating_min`, `rating_max` (см. `puzzles_service/app/routers/puzzles.py`).

---

## Импорт: читать CSV локально, отправлять JSON (без загрузки файла)

Скрипт из репозитория читает файл на ноутбуке и шлёт пакеты **`POST /api/puzzles/internal/import/batch`** (до **2000** задач за запрос).

```bash
set PUZZLES_INTERNAL_TOKEN=...
python tools/push_lichess_csv.py --base-url https://chessmint.ru lichess_db_puzzle.csv

# смок: первые 500 строк
python tools/push_lichess_csv.py --base-url http://localhost:8080 --limit 500 lichess_db_puzzle.csv
```

Одиночная задача (если нужно вручную): **`POST /api/puzzles/internal/puzzle`** — тело как в `PuzzleUpsertRequest` (`puzzles_service/app/schemas/importer.py`).

---

## Импорт CSV с ноутбука на сервер (multipart — весь файл на API)

Эндпоинт: **`POST /api/puzzles/internal/import/upload`**  
Заголовок: **`X-Internal-Token: <PUZZLES_INTERNAL_TOKEN>`**  
Тело: **`multipart/form-data`** — поле **`file`** (файл `.csv` в формате Lichess), опционально **`limit`**, **`chunk_size`**.

Пример (curl с ноутбука на прод — только если осознанно; лучше стейдж):

```bash
curl -sS -X POST "https://chessmint.ru/api/puzzles/internal/import/upload" \
  -H "X-Internal-Token: ВАШ_ТОКЕН" \
  -F "file=@lichess_db_puzzle.csv"
```

Локально через gateway:

```bash
curl -sS -X POST "http://localhost:8080/api/puzzles/internal/import/upload" \
  -H "X-Internal-Token: $PUZZLES_INTERNAL_TOKEN" \
  -F "file=@./lichess_db_puzzle.csv"
```

Ограничение размера тела на nginx: **512 MB** (см. `gateway.dev.conf` / `gateway.prod.conf`).
