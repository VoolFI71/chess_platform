# Утилиты

## `push_lichess_csv.py`

Импорт задач Lichess: CSV читается **локально**, на сервер уходят только JSON-пакеты (`/api/puzzles/internal/import/batch`). Удобно, когда не хотите заливать большой файл на VPS.

Требования: Python 3.10+ из коробки (без `pip install`).

См. также `loadtest/README.md` → раздел про локальный импорт.
