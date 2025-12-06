# ⚡ БЫСТРЫЙ СТАРТ - Тестирование производительности

## ✅ Правильная команда (скопируйте и выполните)

```powershell
# 1. Перейдите в правильную директорию
cd D:\projects\ch\games_service_go

# 2. Запустите тест (самый простой способ)
python benchmark_games.py --endpoint /api/games/ --requests 1000 --concurrent 10
```

**Вот и всё!** Результаты появятся через 30-60 секунд.

---

## 🔧 Если скрипт не запускается

### Проблема: "python не найден"
```powershell
# Проверьте установку
python --version

# Если не установлен, скачайте с python.org
```

### Проблема: "ModuleNotFoundError: httpx"
```powershell
pip install httpx
```

### Проблема: "Connection refused"
```powershell
# Проверьте, что сервис запущен
docker-compose -f docker-compose.local.yml ps games

# Если не запущен:
docker-compose -f docker-compose.local.yml up -d games

# Подождите 10 секунд и проверьте:
curl http://localhost:8080/api/games/
```

### Проблема: PowerShell скрипт не запускается
```powershell
# Разрешите выполнение скриптов (один раз)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Затем запустите:
cd D:\projects\ch\games_service_go
.\run_test.ps1
```

---

## 📊 Что вы увидите

После выполнения команды вы увидите примерно такое:

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

## 🔄 Сравнение Python vs Go

### Тест 1: Go версия (сейчас запущена)

```powershell
cd D:\projects\ch\games_service_go
python benchmark_games.py --endpoint /api/games/ --requests 2000 --concurrent 20 --save results_go.json
```

### Тест 2: Python версия

1. Откройте `docker-compose.local.yml`
2. Найдите строки 142-179
3. Закомментируйте Go (строки 159-179), раскомментируйте Python (строки 142-157)
4. Выполните:
```powershell
docker-compose -f docker-compose.local.yml up --build -d games
# Подождите 10 секунд
cd D:\projects\ch\games_service_go
python benchmark_games.py --endpoint /api/games/ --requests 2000 --concurrent 20 --save results_python.json
```

---

## 💡 Полезные команды

### Проверка работоспособности
```powershell
curl http://localhost:8080/api/games/
```

### Мониторинг ресурсов (во время теста)
```powershell
docker stats games
```

### Просмотр логов
```powershell
docker-compose -f docker-compose.local.yml logs -f games
```

---

## 📝 Примеры тестов

**Быстрый (30 сек):**
```powershell
python benchmark_games.py --endpoint /api/games/ --requests 500 --concurrent 10
```

**Средний (1-2 мин):**
```powershell
python benchmark_games.py --endpoint /api/games/ --requests 2000 --concurrent 20 --save results.json
```

**Нагрузочный (3-5 мин):**
```powershell
python benchmark_games.py --endpoint /api/games/ --requests 5000 --concurrent 50 --save stress.json
```

---

**Готово!** Начните с первой команды выше. 🚀

