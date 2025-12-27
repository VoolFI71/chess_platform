# План подготовки к техническому собеседованию: Стажер Python-разработчик в X5 Tech

**Вакансия:** [Стажер Python-разработчик](https://nn.hh.ru/vacancy/128661064)

**Проект:** Икси - персональный ИИ-аналитик в кармане

## 📋 Требования из вакансии

### Обязательные навыки:
- ✅ Python 3.12
- ✅ FastAPI
- ✅ SQLAlchemy
- ✅ Alembic
- ✅ PostgreSQL
- ✅ REST API
- ✅ WebSockets
- ✅ Асинхронное программирование
- ✅ Redis (основы)

### Желательные навыки:
- ⭐ Golang (чтение и понимание кода)
- ⭐ S3 (работа с объектным хранилищем)

### Дополнительно:
- Unit-тесты и интеграционные тесты
- Поиск и исправление багов
- Ведение документации

---

## 🎯 План подготовки (по приоритетам)

### 1. Python 3.12 (ОБЯЗАТЕЛЬНО)

#### Что нужно знать:
- **Основы языка:**
  - Типы данных (list, dict, set, tuple)
  - Списковые включения (list comprehensions)
  - Генераторы и итераторы
  - Декораторы
  - Контекстные менеджеры (`with`)
  - Обработка исключений (`try/except/finally`)

- **ООП:**
  - Классы и объекты
  - Наследование
  - Инкапсуляция
  - Полиморфизм
  - Магические методы (`__init__`, `__str__`, `__repr__`, `__eq__`)

- **Новинки Python 3.12:**
  - Улучшенные сообщения об ошибках
  - Новый синтаксис типизации (type hints)
  - `match/case` (структурное сопоставление)

#### Вопросы для самопроверки:
1. В чем разница между `list` и `tuple`?
2. Что такое генератор и чем он отличается от обычной функции?
3. Как работают декораторы? Напишите пример декоратора.
4. Что такое `*args` и `**kwargs`?
5. В чем разница между `__str__` и `__repr__`?
6. Что такое GIL и как он влияет на многопоточность?

#### Практические задачи:
```python
# Задача 1: Написать декоратор для логирования времени выполнения функции
import time
from functools import wraps

def timing_decorator(func):
    @wraps(func)  # Важно! Сохраняет метаданные оригинальной функции
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f"{func.__name__} выполнилась за {end - start:.4f} секунд")
        return result
    return wrapper

@timing_decorator
def slow_function():
    """Функция, которая делает что-то медленно"""
    time.sleep(1)
    return "Done"

# Что такое @wraps и зачем он нужен?
# 
# @wraps(func) - это декоратор из модуля functools, который копирует метаданные
# (имя, документацию, аннотации) из оригинальной функции в функцию-обертку.
#
# БЕЗ @wraps:
#   slow_function.__name__ = "wrapper"  ❌ (неправильно!)
#   slow_function.__doc__ = None        ❌ (потеряна документация!)
#
# С @wraps:
#   slow_function.__name__ = "slow_function"  ✅ (правильно!)
#   slow_function.__doc__ = "Функция, которая..."  ✅ (документация сохранена!)
#
# Пример проблемы БЕЗ @wraps:
def bad_decorator(func):
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper  # Метаданные потеряны!

@bad_decorator
def my_function():
    """Это моя функция"""
    pass

print(my_function.__name__)  # Выведет: "wrapper" ❌
print(my_function.__doc__)   # Выведет: None ❌

# Пример С @wraps:
def good_decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper  # Метаданные сохранены!

@good_decorator
def my_function():
    """Это моя функция"""
    pass

print(my_function.__name__)  # Выведет: "my_function" ✅
print(my_function.__doc__)   # Выведет: "Это моя функция" ✅

# Задача 2: Реализовать класс для работы с банковским счетом
class BankAccount:
    def __init__(self, balance=0):
        self._balance = balance
    
    def deposit(self, amount):
        if amount > 0:
            self._balance += amount
            return self._balance
        raise ValueError("Amount must be positive")
    
    def withdraw(self, amount):
        if 0 < amount <= self._balance:
            self._balance -= amount
            return self._balance
        raise ValueError("Insufficient funds")
    
    @property
    def balance(self):
        return self._balance
```

---

### 2. Асинхронное программирование (ОБЯЗАТЕЛЬНО)

#### Что такое async/await?

**`async def`** — определяет асинхронную функцию (корутину). Такая функция возвращает корутину, а не результат напрямую.

**`await`** — приостанавливает выполнение корутины до завершения другой корутины. Пока одна корутина ждет, event loop может выполнять другие задачи.

```python
# Синхронная функция (блокирующая)
def sync_function():
    time.sleep(1)  # Блокирует весь поток
    return "Done"

# Асинхронная функция (неблокирующая)
async def async_function():
    await asyncio.sleep(1)  # Отдает управление event loop
    return "Done"
```

---

#### asyncio.run() — запуск асинхронного кода

**`asyncio.run(coro)`** — создает event loop, запускает корутину и закрывает loop после завершения.

**Важно:** Используйте `asyncio.run()` только в синхронном коде (например, в `if __name__ == "__main__"`). В асинхронном коде используйте `await`.

```python
import asyncio

async def main():
    print("Начало")
    await asyncio.sleep(1)
    print("Конец")

# Запуск асинхронной функции из синхронного кода
if __name__ == "__main__":
    asyncio.run(main())  # Создает event loop и запускает main()

# ❌ НЕПРАВИЛЬНО (внутри async функции):
async def some_function():
    asyncio.run(main())  # ❌ Ошибка! Event loop уже запущен

# ✅ ПРАВИЛЬНО (внутри async функции):
async def some_function():
    await main()  # ✅ Просто await
```

---

#### asyncio.sleep() vs time.sleep()

**`asyncio.sleep(seconds)`** — неблокирующая задержка. Отдает управление event loop, позволяя выполнять другие задачи.

**`time.sleep(seconds)`** — блокирующая задержка. Останавливает весь поток, блокируя выполнение других задач.

```python
import asyncio
import time

# ❌ ПЛОХО: time.sleep блокирует event loop
async def bad_example():
    print("Начало")
    time.sleep(2)  # ❌ Блокирует весь поток на 2 секунды!
    print("Конец")

# ✅ ХОРОШО: asyncio.sleep не блокирует
async def good_example():
    print("Начало")
    await asyncio.sleep(2)  # ✅ Отдает управление, другие задачи могут выполняться
    print("Конец")

# Демонстрация разницы:
async def task1():
    print("Task 1 началась")
    await asyncio.sleep(1)  # ✅ Не блокирует
    print("Task 1 завершилась")

async def task2():
    print("Task 2 началась")
    await asyncio.sleep(1)  # ✅ Не блокирует
    print("Task 2 завершилась")

async def run_parallel():
    # Обе задачи выполняются параллельно!
    await asyncio.gather(task1(), task2())
    # Вывод:
    # Task 1 началась
    # Task 2 началась
    # Task 1 завершилась  (через ~1 сек)
    # Task 2 завершилась  (через ~1 сек)
    # Общее время: ~1 секунда (а не 2!)

# ❌ Если бы использовали time.sleep:
async def bad_task1():
    print("Task 1 началась")
    time.sleep(1)  # ❌ Блокирует!
    print("Task 1 завершилась")

async def bad_task2():
    print("Task 2 началась")
    time.sleep(1)  # ❌ Блокирует!
    print("Task 2 завершилась")

async def run_sequential():
    await asyncio.gather(bad_task1(), bad_task2())
    # Вывод:
    # Task 1 началась
    # Task 1 завершилась  (через 1 сек)
    # Task 2 началась
    # Task 2 завершилась  (через еще 1 сек)
    # Общее время: 2 секунды (последовательно!)
```

**Вывод:** В асинхронном коде **всегда** используйте `await asyncio.sleep()`, никогда не используйте `time.sleep()`!

---

#### asyncio.create_task() — создание задач

**`asyncio.create_task(coro)`** — оборачивает корутину в Task и планирует её выполнение в event loop. Задача начинает выполняться сразу (не дожидаясь await).

**Зачем нужно:** Когда вы хотите запустить корутину "в фоне" и продолжить выполнение текущего кода.

```python
import asyncio

async def background_task(name, delay):
    print(f"{name} началась")
    await asyncio.sleep(delay)
    print(f"{name} завершилась")
    return f"{name} done"

async def main():
    # Создаем задачи (они начинают выполняться сразу!)
    task1 = asyncio.create_task(background_task("Task 1", 2))
    task2 = asyncio.create_task(background_task("Task 2", 1))
    
    print("Задачи созданы, продолжаем выполнение...")
    
    # Делаем что-то еще
    await asyncio.sleep(0.5)
    print("Делаем что-то еще...")
    
    # Ждем завершения задач
    result1 = await task1
    result2 = await task2
    
    print(f"Результаты: {result1}, {result2}")

# Вывод:
# Задачи созданы, продолжаем выполнение...
# Task 1 началась
# Task 2 началась
# Делаем что-то еще...
# Task 2 завершилась  (через 1 сек)
# Task 1 завершилась  (через 2 сек)
# Результаты: Task 1 done, Task 2 done

asyncio.run(main())
```

**Разница между `create_task()` и просто вызовом корутины:**

```python
async def task():
    await asyncio.sleep(1)
    return "Done"

async def wrong_way():
    # ❌ Корутины не выполняются параллельно!
    result1 = await task()  # Ждем 1 сек
    result2 = await task()  # Ждем еще 1 сек
    # Итого: 2 секунды

async def right_way():
    # ✅ Задачи выполняются параллельно!
    task1 = asyncio.create_task(task())  # Начинает выполняться
    task2 = asyncio.create_task(task())  # Начинает выполняться
    result1 = await task1  # Ждем завершения (уже почти готово)
    result2 = await task2  # Ждем завершения (уже почти готово)
    # Итого: ~1 секунда (выполняются параллельно!)
```

---

#### asyncio.gather() — параллельное выполнение

**`asyncio.gather(*coros)`** — запускает несколько корутин параллельно и ждет завершения всех. Возвращает список результатов в том же порядке.

**Преимущества:**
- Все корутины выполняются параллельно
- Ждет завершения всех
- Возвращает результаты в правильном порядке
- Если одна упадет с ошибкой, остальные продолжают выполняться (если не указан `return_exceptions=True`)

```python
import asyncio

async def fetch_data(url, delay):
    print(f"Начинаем загрузку {url}")
    await asyncio.sleep(delay)  # Имитация загрузки
    print(f"Загружено {url}")
    return f"Data from {url}"

async def main():
    # Последовательное выполнение (медленно)
    print("=== Последовательно ===")
    result1 = await fetch_data("url1", 1)
    result2 = await fetch_data("url2", 1)
    result3 = await fetch_data("url3", 1)
    # Время: 3 секунды
    
    # Параллельное выполнение с gather (быстро!)
    print("\n=== Параллельно с gather ===")
    results = await asyncio.gather(
        fetch_data("url1", 1),
        fetch_data("url2", 1),
        fetch_data("url3", 1)
    )
    # Время: ~1 секунда (все выполняются одновременно!)
    # results = ["Data from url1", "Data from url2", "Data from url3"]
    
    print(f"\nРезультаты: {results}")

asyncio.run(main())
```

**Обработка ошибок в gather:**

```python
async def task_ok():
    await asyncio.sleep(1)
    return "OK"

async def task_error():
    await asyncio.sleep(1)
    raise ValueError("Ошибка!")

async def main():
    # По умолчанию: если одна задача упадет, gather тоже упадет
    try:
        results = await asyncio.gather(task_ok(), task_error())
    except ValueError as e:
        print(f"Ошибка: {e}")  # Выполнится здесь
    
    # С return_exceptions=True: ошибки возвращаются как результаты
    results = await asyncio.gather(
        task_ok(), 
        task_error(), 
        return_exceptions=True
    )
    # results = ["OK", ValueError("Ошибка!")]
    print(results)

asyncio.run(main())
```

**gather с разными задержками:**

```python
async def task(name, delay):
    print(f"{name} началась")
    await asyncio.sleep(delay)
    print(f"{name} завершилась")
    return f"{name} done"

async def main():
    # Все задачи начинаются одновременно
    results = await asyncio.gather(
        task("Быстрая", 1),
        task("Средняя", 2),
        task("Медленная", 3)
    )
    # Вывод:
    # Быстрая началась
    # Средняя началась
    # Медленная началась
    # Быстрая завершилась  (через 1 сек)
    # Средняя завершилась  (через 2 сек)
    # Медленная завершилась (через 3 сек)
    # Общее время: 3 секунды (а не 6!)
    
    print(results)  # ["Быстрая done", "Средняя done", "Медленная done"]

asyncio.run(main())
```

---

#### Сравнение: create_task vs gather

| Характеристика | `create_task()` | `gather()` |
|----------------|-----------------|------------|
| **Назначение** | Запустить задачу в фоне | Запустить несколько задач и дождаться всех |
| **Когда использовать** | Нужно продолжить выполнение, не дожидаясь задачи | Нужны результаты всех задач |
| **Возвращает** | Task объект | Список результатов |
| **Параллельность** | Да | Да |

```python
# create_task - когда нужна фоновая задача
async def main_with_create_task():
    task = asyncio.create_task(long_running_task())
    # Продолжаем делать что-то еще
    do_something_else()
    # Потом ждем задачу
    result = await task

# gather - когда нужны результаты нескольких задач
async def main_with_gather():
    results = await asyncio.gather(
        task1(),
        task2(),
        task3()
    )
    # Все результаты готовы
    process_results(results)
```

---

#### Что нужно знать:
- **Основы `asyncio`:**
  - `async/await` синтаксис
  - Создание и запуск корутин
  - `asyncio.run()` — запуск из синхронного кода
  - `asyncio.create_task()` — создание фоновых задач
  - `asyncio.gather()` — параллельное выполнение нескольких задач
  - `asyncio.sleep()` вместо `time.sleep()` (всегда!)

- **Асинхронные контекстные менеджеры:**
  - `async with`
  - `aenter` и `aexit`

- **Асинхронные итераторы:**
  - `async for`
  - `aiter` и `anext`

#### Наглядный пример асинхронности корутин

**Демонстрация параллельного выполнения:**

```python
import asyncio
import time

# Корутина - асинхронная функция
async def download_file(filename, delay):
    """Имитация загрузки файла"""
    print(f"[{time.strftime('%H:%M:%S')}] Начало загрузки {filename}")
    await asyncio.sleep(delay)  # Имитация сетевой задержки
    print(f"[{time.strftime('%H:%M:%S')}] Загрузка {filename} завершена")
    return f"Содержимое {filename}"

# ❌ СИНХРОННЫЙ ПОДХОД (последовательно)
def sync_download():
    """Синхронная загрузка - файлы загружаются один за другим"""
    print("=== СИНХРОННАЯ ЗАГРУЗКА (последовательно) ===")
    start = time.time()
    
    # Загружаем файлы последовательно
    file1 = download_file("file1.txt", 2)  # ❌ Это корутина, не выполнится!
    file2 = download_file("file2.txt", 2)
    file3 = download_file("file3.txt", 2)
    
    # Правильный синхронный подход (если бы это были обычные функции):
    # time.sleep(2)  # file1
    # time.sleep(2)  # file2
    # time.sleep(2)  # file3
    # Итого: 6 секунд
    
    end = time.time()
    print(f"Время выполнения: {end - start:.2f} секунд\n")

# ✅ АСИНХРОННЫЙ ПОДХОД (параллельно)
async def async_download():
    """Асинхронная загрузка - файлы загружаются параллельно"""
    print("=== АСИНХРОННАЯ ЗАГРУЗКА (параллельно) ===")
    start = time.time()
    
    # Загружаем файлы параллельно с gather
    results = await asyncio.gather(
        download_file("file1.txt", 2),
        download_file("file2.txt", 2),
        download_file("file3.txt", 2)
    )
    
    end = time.time()
    print(f"Время выполнения: {end - start:.2f} секунд")
    print(f"Результаты: {results}\n")

# Запуск
if __name__ == "__main__":
    asyncio.run(async_download())

# Вывод:
# === АСИНХРОННАЯ ЗАГРУЗКА (параллельно) ===
# [14:30:00] Начало загрузки file1.txt
# [14:30:00] Начало загрузки file2.txt
# [14:30:00] Начало загрузки file3.txt
# [14:30:02] Загрузка file1.txt завершена  (через 2 сек)
# [14:30:02] Загрузка file2.txt завершена  (через 2 сек)
# [14:30:02] Загрузка file3.txt завершена  (через 2 сек)
# Время выполнения: 2.00 секунд  ✅ (а не 6 секунд!)
# Результаты: ['Содержимое file1.txt', 'Содержимое file2.txt', 'Содержимое file3.txt']
```

**Пример с разными задержками:**

```python
import asyncio
import time

async def task(name, delay):
    """Корутина с задержкой"""
    print(f"[{time.strftime('%H:%M:%S')}] {name}: начало")
    await asyncio.sleep(delay)
    print(f"[{time.strftime('%H:%M:%S')}] {name}: завершено")
    return f"{name} выполнена"

async def demonstrate_async():
    """Демонстрация асинхронности"""
    print("Запускаем 3 корутины с разными задержками...\n")
    
    start = time.time()
    
    # Все корутины начинают выполняться одновременно!
    results = await asyncio.gather(
        task("Быстрая задача", 1),   # 1 секунда
        task("Средняя задача", 2),    # 2 секунды
        task("Медленная задача", 3)   # 3 секунды
    )
    
    elapsed = time.time() - start
    
    print(f"\nВсе задачи завершены за {elapsed:.2f} секунд")
    print(f"Результаты: {results}")

asyncio.run(demonstrate_async())

# Вывод:
# Запускаем 3 корутины с разными задержками...
# 
# [14:30:00] Быстрая задача: начало
# [14:30:00] Средняя задача: начало
# [14:30:00] Медленная задача: начало
# [14:30:01] Быстрая задача: завершено    (через 1 сек)
# [14:30:02] Средняя задача: завершено  (через 2 сек)
# [14:30:03] Медленная задача: завершено (через 3 сек)
# 
# Все задачи завершены за 3.00 секунд  ✅
# (А не 1+2+3=6 секунд!)
# Результаты: ['Быстрая задача выполнена', 'Средняя задача выполнена', 'Медленная задача выполнена']
```

**Пример с create_task - фоновая задача:**

```python
import asyncio
import time

async def background_monitor():
    """Фоновая задача - мониторинг"""
    for i in range(5):
        print(f"[{time.strftime('%H:%M:%S')}] Мониторинг: проверка #{i+1}")
        await asyncio.sleep(1)

async def process_request(request_id):
    """Обработка запроса"""
    print(f"[{time.strftime('%H:%M:%S')}] Обработка запроса {request_id}")
    await asyncio.sleep(2)
    print(f"[{time.strftime('%H:%M:%S')}] Запрос {request_id} обработан")
    return f"Результат запроса {request_id}"

async def server_with_background():
    """Сервер с фоновым мониторингом"""
    print("Запуск сервера...\n")
    
    # Запускаем фоновую задачу (не ждем её!)
    monitor_task = asyncio.create_task(background_monitor())
    
    # Обрабатываем запросы (мониторинг работает параллельно!)
    print("Обработка запросов (мониторинг работает в фоне)...\n")
    results = await asyncio.gather(
        process_request(1),
        process_request(2),
        process_request(3)
    )
    
    # Ждем завершения мониторинга
    await monitor_task
    
    print(f"\nВсе запросы обработаны: {results}")

asyncio.run(server_with_background())

# Вывод показывает параллельное выполнение:
# [14:30:00] Мониторинг: проверка #1
# [14:30:00] Обработка запроса 1
# [14:30:00] Обработка запроса 2
# [14:30:00] Обработка запроса 3
# [14:30:01] Мониторинг: проверка #2
# [14:30:02] Запрос 1 обработан
# [14:30:02] Запрос 2 обработан
# [14:30:02] Запрос 3 обработан
# [14:30:02] Мониторинг: проверка #3
# [14:30:03] Мониторинг: проверка #4
# [14:30:04] Мониторинг: проверка #5
# 
# Все запросы обработаны: ['Результат запроса 1', 'Результат запроса 2', 'Результат запроса 3']
```

**Ключевые моменты асинхронности:**

1. **Корутины выполняются параллельно** - когда одна ждет (await), event loop выполняет другие
2. **Общее время = время самой долгой задачи** (при использовании gather)
3. **Не блокируют друг друга** - пока одна ждет сетевого ответа, другие продолжают работать
4. **Эффективно для I/O операций** - загрузка файлов, запросы к БД, API вызовы

---

#### Вопросы для самопроверки:
1. В чем разница между синхронным и асинхронным кодом?
2. Что такое корутина?
3. Как работает `await`?
4. Что такое event loop?
5. Когда использовать `asyncio.gather()` вместо последовательного выполнения?
6. В чем разница между `asyncio.sleep()` и `time.sleep()`?
7. Когда использовать `create_task()`, а когда `gather()`?

#### Практические задачи:
```python
import asyncio
import aiohttp

# Задача 1: Асинхронная загрузка нескольких URL
async def fetch_url(session, url):
    async with session.get(url) as response:
        return await response.text()

async def fetch_multiple_urls(urls):
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_url(session, url) for url in urls]
        results = await asyncio.gather(*tasks)  # Параллельная загрузка
        return results

# Задача 2: Асинхронный счетчик с задержкой
async def async_counter(n):
    for i in range(n):
        print(i)
        await asyncio.sleep(1)  # ✅ Используем asyncio.sleep

# Задача 3: Параллельное выполнение нескольких задач
async def task1():
    await asyncio.sleep(1)
    return "Task 1 done"

async def task2():
    await asyncio.sleep(2)
    return "Task 2 done"

async def run_parallel():
    # Выполняются параллельно, общее время ~2 секунды
    results = await asyncio.gather(task1(), task2())
    return results

# Задача 4: Фоновая задача с create_task
async def background_processor():
    while True:
        await process_queue()
        await asyncio.sleep(5)

async def api_server():
    # Запускаем фоновую задачу
    bg_task = asyncio.create_task(background_processor())
    
    # Обрабатываем API запросы
    while True:
        await handle_request()
    
    # bg_task продолжает работать в фоне

# Задача 5: Комбинирование create_task и gather
async def main():
    # Запускаем фоновую задачу
    monitor_task = asyncio.create_task(monitor_system())
    
    # Параллельно обрабатываем несколько запросов
    results = await asyncio.gather(
        process_request(1),
        process_request(2),
        process_request(3)
    )
    
    # Мониторинг продолжает работать
    # results содержит результаты обработки запросов
```

---

### 3. FastAPI (ОБЯЗАТЕЛЬНО)

#### Что нужно знать:
- **Основы FastAPI:**
  - Создание приложения (`FastAPI()`)
  - Определение роутов (`@app.get()`, `@app.post()`, `@app.put()`, `@app.delete()`)
  - Path parameters и Query parameters
  - Request body (Pydantic models)
  - Response models
  - Status codes

- **Зависимости (Dependencies):**
  - `Depends()`
  - Dependency injection
  - Подключение к БД через зависимости

- **Middleware:**
  - CORS
  - Аутентификация через middleware

- **Асинхронные эндпоинты:**
  - `async def` для роутов

#### Вопросы для самопроверки:
1. Как создать REST API endpoint в FastAPI?
2. Что такое Pydantic и зачем он нужен?
3. Как валидировать входные данные?
4. Как обрабатывать ошибки в FastAPI?
5. Что такое dependency injection в FastAPI?

#### Практические задачи:
```python
from fastapi import FastAPI, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

app = FastAPI()

# Модели данных
class UserCreate(BaseModel):
    name: str
    email: str
    age: int

class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    age: int
    created_at: datetime

# In-memory хранилище (для примера)
users_db = []
next_id = 1

# Задача 1: CRUD операции для пользователей
@app.post("/users", response_model=UserResponse, status_code=201)
async def create_user(user: UserCreate):
    global next_id
    new_user = UserResponse(
        id=next_id,
        name=user.name,
        email=user.email,
        age=user.age,
        created_at=datetime.now()
    )
    users_db.append(new_user)
    next_id += 1
    return new_user

@app.get("/users", response_model=List[UserResponse])
async def get_users(skip: int = Query(0, ge=0), limit: int = Query(10, ge=1, le=100)):
    return users_db[skip:skip+limit]

@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: int):
    user = next((u for u in users_db if u.id == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: int):
    global users_db
    user = next((u for u in users_db if u.id == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    users_db = [u for u in users_db if u.id != user_id]

# Задача 2: Dependency для проверки авторизации
def get_current_user(token: str = Query(...)):
    if token != "secret-token":
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"user_id": 1, "username": "admin"}

@app.get("/protected")
async def protected_route(current_user: dict = Depends(get_current_user)):
    return {"message": f"Hello, {current_user['username']}"}
```

---

### 4. SQLAlchemy (ОБЯЗАТЕЛЬНО)

#### Что нужно знать:
- **Основы ORM:**
  - Определение моделей (классы с `Base`)
  - Типы колонок (`Integer`, `String`, `DateTime`, `Boolean`, `Text`)
  - Отношения (`relationship`, `ForeignKey`)
  - Создание сессии (`Session`)

- **CRUD операции:**
  - `session.add()` - добавление
  - `session.query()` - запросы
  - `session.commit()` - сохранение
  - `session.delete()` - удаление

- **Запросы:**
  - Фильтрация (`.filter()`)
  - Сортировка (`.order_by()`)
  - Лимиты (`.limit()`, `.offset()`)
  - Join операции

- **Асинхронный SQLAlchemy:**
  - `AsyncSession`
  - `async with` для сессий
  - `await` для запросов

#### Вопросы для самопроверки:
1. Что такое ORM и зачем он нужен?
2. В чем разница между `session.add()` и `session.commit()`?
3. Как работают отношения между таблицами в SQLAlchemy?
4. Что такое lazy loading и eager loading?
5. Как выполнить JOIN запрос?

#### Практические задачи:
```python
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

Base = declarative_base()

# Модели
class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    
    # Отношение один-ко-многим
    posts = relationship("Post", back_populates="author")

class Post(Base):
    __tablename__ = 'posts'
    
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    content = Column(Text)
    author_id = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.now)
    
    author = relationship("User", back_populates="posts")

# Подключение к БД
engine = create_engine('postgresql://user:password@localhost/dbname')
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)

# CRUD операции
def create_user(name: str, email: str):
    session = Session()
    user = User(name=name, email=email)
    session.add(user)
    session.commit()
    session.refresh(user)
    session.close()
    return user

def get_user_by_id(user_id: int):
    session = Session()
    user = session.query(User).filter(User.id == user_id).first()
    session.close()
    return user

def get_users_with_posts():
    session = Session()
    users = session.query(User).join(Post).all()
    session.close()
    return users
```

---

### 5. Alembic (ОБЯЗАТЕЛЬНО)

#### Что нужно знать:
- **Миграции:**
  - Что такое миграции и зачем они нужны
  - Создание миграции (`alembic revision`)
  - Применение миграций (`alembic upgrade`)
  - Откат миграций (`alembic downgrade`)

- **Основные команды:**
  - `alembic init` - инициализация
  - `alembic revision --autogenerate -m "message"` - авто-генерация миграции
  - `alembic upgrade head` - применить все миграции
  - `alembic downgrade -1` - откатить последнюю миграцию
  - `alembic current` - текущая версия
  - `alembic history` - история миграций

#### Вопросы для самопроверки:
1. Что такое миграции базы данных?
2. Зачем нужен Alembic?
3. Как создать миграцию?
4. Как применить миграцию?
5. Что делать, если миграция не применилась?

#### Практические задачи:
```bash
# Инициализация Alembic
alembic init alembic

# Создание миграции
alembic revision --autogenerate -m "Add users table"

# Применение миграции
alembic upgrade head

# Откат миграции
alembic downgrade -1

# Просмотр текущей версии
alembic current
```

**Пример миграции:**
```python
"""Add users table

Revision ID: abc123
Revises: 
Create Date: 2024-01-01 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('email', sa.String(100), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

def downgrade():
    op.drop_table('users')
```

---

### 6. PostgreSQL (ОБЯЗАТЕЛЬНО)

#### Что нужно знать:
- **Основы SQL:**
  - `SELECT`, `INSERT`, `UPDATE`, `DELETE`
  - `WHERE`, `ORDER BY`, `LIMIT`, `OFFSET`
  - `JOIN` (INNER, LEFT, RIGHT)
  - Агрегатные функции (`COUNT`, `SUM`, `AVG`, `MAX`, `MIN`)
  - `GROUP BY`, `HAVING`

- **Типы данных:**
  - `INTEGER`, `BIGINT`
  - `VARCHAR`, `TEXT`
  - `BOOLEAN`
  - `TIMESTAMP`, `DATE`
  - `JSON`, `JSONB`

- **Индексы:**
  - Зачем нужны индексы
  - `CREATE INDEX`
  - Уникальные индексы

- **Транзакции:**
  - `BEGIN`, `COMMIT`, `ROLLBACK`
  - ACID свойства

#### Вопросы для самопроверки:
1. В чем разница между `INNER JOIN` и `LEFT JOIN`?
2. Что такое транзакция?
3. Зачем нужны индексы?
4. Что такое нормализация БД?
5. В чем разница между `VARCHAR` и `TEXT`?

#### Практические задачи:
```sql
-- Задача 1: Создание таблицы
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Задача 2: Запросы
SELECT * FROM users WHERE age > 18 ORDER BY created_at DESC LIMIT 10;

SELECT u.name, COUNT(p.id) as post_count
FROM users u
LEFT JOIN posts p ON u.id = p.user_id
GROUP BY u.id, u.name
HAVING COUNT(p.id) > 5;

-- Задача 3: Транзакция
BEGIN;
INSERT INTO users (name, email) VALUES ('John', 'john@example.com');
UPDATE users SET name = 'John Doe' WHERE email = 'john@example.com';
COMMIT;
```

---

### 7. REST API (ОБЯЗАТЕЛЬНО)

#### Что нужно знать:
- **HTTP методы:**
  - `GET` - получение данных
  - `POST` - создание ресурса
  - `PUT` - полное обновление
  - `PATCH` - частичное обновление
  - `DELETE` - удаление

- **HTTP статус коды:**
  - `200 OK` - успех
  - `201 Created` - ресурс создан
  - `204 No Content` - успех без тела ответа
  - `400 Bad Request` - неверный запрос
  - `401 Unauthorized` - не авторизован
  - `403 Forbidden` - запрещено
  - `404 Not Found` - не найдено
  - `500 Internal Server Error` - ошибка сервера

- **REST принципы:**
  - Ресурсы (ресурсы имеют URL)
  - HTTP методы для операций
  - Статус коды для результатов
  - JSON для обмена данными

#### Вопросы для самопроверки:
1. Что такое REST API?
2. В чем разница между PUT и PATCH?
3. Какие HTTP методы идут на изменение данных?
4. Как правильно вернуть ошибку в REST API?
5. Что такое idempotency (идемпотентность)?

---

### 8. WebSockets (ОБЯЗАТЕЛЬНО)

#### Что нужно знать:
- **Основы WebSockets:**
  - Что такое WebSocket и зачем он нужен
  - Отличие от HTTP (двусторонняя связь)
  - Когда использовать WebSockets

- **WebSockets в FastAPI:**
  - `@app.websocket("/ws")`
  - `WebSocket` объект
  - `await websocket.accept()`
  - `await websocket.receive_text()` / `receive_json()`
  - `await websocket.send_text()` / `send_json()`
  - `await websocket.close()`

#### Вопросы для самопроверки:
1. В чем разница между HTTP и WebSocket?
2. Когда использовать WebSocket вместо REST API?
3. Как обработать подключение клиента?
4. Как отправить сообщение клиенту?

#### Практические задачи:
```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import List

app = FastAPI()

# Хранилище активных соединений
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)
    
    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: int):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.send_personal_message(f"Message: {data}", websocket)
            await manager.broadcast(f"Client {client_id} says: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast(f"Client {client_id} left")
```

---

### 9. Redis (ОБЯЗАТЕЛЬНО - основы)

**См. подробный файл:** `REDIS_INTERVIEW_QUESTIONS.md`

#### Краткий чеклист:
- ✅ Подключение к Redis
- ✅ Базовые операции (GET, SET, DELETE)
- ✅ TTL (время жизни ключей)
- ✅ Типы данных (Strings, Lists, Sets, Hashes)
- ✅ Использование для кэширования
- ✅ Pipeline для производительности

---

### 10. Тестирование (ОБЯЗАТЕЛЬНО)

#### Что такое Unit-тесты?

**Unit-тест (модульный тест)** — это тест, который проверяет работу **одной изолированной единицы кода** (функции, метода, класса) в отрыве от остальной системы.

**Характеристики unit-тестов:**
- ✅ Тестируют одну функцию/метод/класс
- ✅ Быстрые (выполняются за миллисекунды)
- ✅ Изолированные (не зависят от БД, файловой системы, сети)
- ✅ Используют моки (заглушки) для внешних зависимостей
- ✅ Легко отлаживать (если тест упал, проблема в конкретной функции)

**Пример unit-теста:**
```python
# Функция для тестирования
def calculate_total(items, discount=0):
    """Рассчитывает общую стоимость товаров с учетом скидки"""
    total = sum(item['price'] * item['quantity'] for item in items)
    return total * (1 - discount)

# Unit-тест
def test_calculate_total():
    items = [
        {'price': 100, 'quantity': 2},
        {'price': 50, 'quantity': 3}
    ]
    assert calculate_total(items) == 350  # 200 + 150
    
def test_calculate_total_with_discount():
    items = [{'price': 100, 'quantity': 1}]
    assert calculate_total(items, discount=0.1) == 90  # 100 * 0.9
    
def test_calculate_total_empty():
    assert calculate_total([]) == 0
```

**Unit-тест с моками (заглушками):**
```python
from unittest.mock import Mock, patch

def send_email(to, subject, body):
    # Предположим, что эта функция отправляет email через внешний сервис
    email_service = EmailService()
    return email_service.send(to, subject, body)

# Unit-тест с моком (не отправляем реальный email)
@patch('module.EmailService')
def test_send_email(mock_email_service):
    # Создаем мок объекта
    mock_instance = Mock()
    mock_instance.send.return_value = True
    mock_email_service.return_value = mock_instance
    
    # Тестируем функцию
    result = send_email('user@example.com', 'Test', 'Body')
    
    # Проверяем, что метод был вызван
    mock_instance.send.assert_called_once_with('user@example.com', 'Test', 'Body')
    assert result is True
```

---

#### Что такое Интеграционные тесты?

**Интеграционный тест** — это тест, который проверяет работу **нескольких компонентов системы вместе** (например, API endpoint + база данных + Redis).

**Характеристики интеграционных тестов:**
- ✅ Тестируют взаимодействие нескольких компонентов
- ✅ Медленнее unit-тестов (используют реальные зависимости)
- ✅ Используют тестовую БД, тестовый Redis и т.д.
- ✅ Проверяют реальные сценарии использования
- ✅ Могут использовать реальные сервисы (в тестовом окружении)

**Пример интеграционного теста для FastAPI:**
```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db

# Создаем тестовую БД в памяти
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Фикстура для тестовой БД
@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
    Base.metadata.drop_all(bind=engine)

# Фикстура для переопределения зависимости БД
@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            db_session.close()
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

# Интеграционный тест - проверяет весь flow: запрос -> БД -> ответ
def test_create_user_integration(client):
    """Тест создания пользователя через API с сохранением в БД"""
    response = client.post(
        "/users",
        json={"name": "John", "email": "john@example.com", "age": 30}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "John"
    assert data["email"] == "john@example.com"
    assert "id" in data
    
    # Проверяем, что пользователь действительно сохранился в БД
    get_response = client.get(f"/users/{data['id']}")
    assert get_response.status_code == 200
    assert get_response.json()["name"] == "John"

def test_user_flow_integration(client):
    """Полный flow: создание -> получение -> обновление -> удаление"""
    # Создание
    create_response = client.post(
        "/users",
        json={"name": "Alice", "email": "alice@example.com", "age": 25}
    )
    user_id = create_response.json()["id"]
    
    # Получение
    get_response = client.get(f"/users/{user_id}")
    assert get_response.status_code == 200
    
    # Обновление
    update_response = client.put(
        f"/users/{user_id}",
        json={"name": "Alice Updated", "email": "alice@example.com", "age": 26}
    )
    assert update_response.status_code == 200
    
    # Удаление
    delete_response = client.delete(f"/users/{user_id}")
    assert delete_response.status_code == 204
    
    # Проверка, что пользователь удален
    get_response = client.get(f"/users/{user_id}")
    assert get_response.status_code == 404
```

---

#### Сравнение Unit и Интеграционных тестов

| Характеристика | Unit-тесты | Интеграционные тесты |
|----------------|------------|---------------------|
| **Что тестируют** | Одна функция/метод | Несколько компонентов вместе |
| **Скорость** | Очень быстрые (мс) | Медленнее (секунды) |
| **Зависимости** | Используют моки | Используют реальные сервисы (тестовые) |
| **Изоляция** | Полная изоляция | Тестируют взаимодействие |
| **Количество** | Много (80-90% тестов) | Меньше (10-20% тестов) |
| **Когда писать** | Для каждой функции | Для критических сценариев |

**Пирамида тестирования:**
```
        /\
       /  \      E2E тесты (мало)
      /____\
     /      \    Интеграционные тесты (средне)
    /________\
   /          \  Unit-тесты (много)
  /____________\
```

---

#### Что нужно знать:

- **Unit-тесты:**
  - `pytest` - фреймворк для тестирования
  - `assert` - проверки
  - Фикстуры (`@pytest.fixture`)
  - Параметризация (`@pytest.mark.parametrize`)
  - Моки (`unittest.mock`, `pytest-mock`)

- **Интеграционные тесты:**
  - Тестирование API endpoints
  - `TestClient` из FastAPI
  - Тестовая БД (SQLite в памяти или отдельная тестовая PostgreSQL)
  - Тестовый Redis
  - Очистка данных после тестов

- **Покрытие кода:**
  - `pytest-cov` для проверки покрытия
  - Цель: 70-80% покрытия кода

#### Вопросы для самопроверки:
1. Что такое unit-тест?
2. В чем разница между unit и integration тестами?
3. Что такое моки (mocks) и зачем они нужны?
4. Как тестировать асинхронный код?
5. Как организовать тестовую БД для интеграционных тестов?

#### Практические задачи:

**Unit-тесты:**
```python
import pytest
from unittest.mock import Mock, patch

# Задача 1: Unit-тест простой функции
def validate_email(email):
    """Проверяет корректность email"""
    if not email or '@' not in email:
        return False
    parts = email.split('@')
    return len(parts) == 2 and '.' in parts[1]

def test_validate_email():
    assert validate_email('user@example.com') is True
    assert validate_email('invalid') is False
    assert validate_email('') is False
    assert validate_email('user@domain') is False

# Задача 2: Unit-тест класса с моками
class UserService:
    def __init__(self, db):
        self.db = db
    
    def get_user(self, user_id):
        return self.db.query_user(user_id)
    
    def create_user(self, name, email):
        if self.db.user_exists(email):
            raise ValueError("User already exists")
        return self.db.create_user(name, email)

def test_user_service_get_user():
    # Создаем мок БД
    mock_db = Mock()
    mock_db.query_user.return_value = {"id": 1, "name": "John"}
    
    service = UserService(mock_db)
    user = service.get_user(1)
    
    assert user["name"] == "John"
    mock_db.query_user.assert_called_once_with(1)

def test_user_service_create_user_duplicate():
    mock_db = Mock()
    mock_db.user_exists.return_value = True
    
    service = UserService(mock_db)
    
    with pytest.raises(ValueError, match="User already exists"):
        service.create_user("John", "john@example.com")

# Задача 3: Параметризация тестов
@pytest.mark.parametrize("input,expected", [
    (2, 4),
    (3, 9),
    (4, 16),
    (5, 25),
])
def test_square(input, expected):
    assert input ** 2 == expected
```

**Интеграционные тесты:**
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# Интеграционный тест API endpoint
def test_create_user_integration():
    """Тест создания пользователя через API"""
    response = client.post(
        "/users",
        json={"name": "John", "email": "john@example.com", "age": 30}
    )
    assert response.status_code == 201
    assert response.json()["name"] == "John"

def test_get_user_not_found():
    """Тест получения несуществующего пользователя"""
    response = client.get("/users/999")
    assert response.status_code == 404

# Фикстура для переиспользования данных
@pytest.fixture
def sample_user():
    return {"name": "Test", "email": "test@example.com", "age": 25}

def test_user_fixture(sample_user):
    """Тест с использованием фикстуры"""
    assert sample_user["name"] == "Test"
    
# Интеграционный тест с Redis
def test_cache_integration(client, redis_client):
    """Тест кэширования данных в Redis"""
    # Первый запрос - данные из БД
    response1 = client.get("/users/1")
    assert response1.status_code == 200
    
    # Проверяем, что данные попали в кэш
    cached = redis_client.get("user:1")
    assert cached is not None
    
    # Второй запрос - данные из кэша
    response2 = client.get("/users/1")
    assert response2.status_code == 200
    assert response1.json() == response2.json()
```

**Тестирование асинхронного кода:**
```python
import pytest
import asyncio
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_async_endpoint():
    """Тест асинхронного endpoint"""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/async-endpoint")
        assert response.status_code == 200
```

**Запуск тестов:**
```bash
# Запуск всех тестов
pytest

# Запуск только unit-тестов
pytest tests/unit/

# Запуск только интеграционных тестов
pytest tests/integration/

# С покрытием кода
pytest --cov=app --cov-report=html

# С подробным выводом
pytest -v

# Остановка на первой ошибке
pytest -x
```

---

### 11. Golang (ЖЕЛАТЕЛЬНО)

#### Что нужно знать (минимум):
- **Базовый синтаксис:**
  - Объявление переменных (`var`, `:=`)
  - Типы данных (`int`, `string`, `bool`)
  - Функции (`func`)
  - Структуры (`struct`)
  - Методы (`func (s Struct) Method()`)

- **Чтение кода:**
  - Понимание основных конструкций
  - Работа с пакетами (`package`, `import`)
  - Обработка ошибок (`error`)

#### Примеры для понимания:
```go
package main

import "fmt"

type User struct {
    ID    int
    Name  string
    Email string
}

func (u User) GetInfo() string {
    return fmt.Sprintf("User %s (%d)", u.Name, u.ID)
}

func main() {
    user := User{
        ID:    1,
        Name:  "John",
        Email: "john@example.com",
    }
    fmt.Println(user.GetInfo())
}
```

---

### 12. S3 (ЖЕЛАТЕЛЬНО)

#### Что нужно знать:
- **Основы S3:**
  - Что такое объектное хранилище
  - Бакеты (buckets)
  - Объекты и ключи
  - Загрузка и скачивание файлов

- **Работа с S3 в Python:**
  - Библиотека `boto3`
  - Загрузка файла (`upload_file()`, `put_object()`)
  - Скачивание файла (`download_file()`, `get_object()`)
  - Удаление файла (`delete_object()`)
  - Генерация presigned URL

#### Практические задачи:
```python
import boto3
from botocore.exceptions import ClientError

s3_client = boto3.client(
    's3',
    aws_access_key_id='your_key',
    aws_secret_access_key='your_secret',
    region_name='us-east-1'
)

# Загрузка файла
def upload_file(file_path, bucket, object_name):
    try:
        s3_client.upload_file(file_path, bucket, object_name)
        return True
    except ClientError as e:
        print(f"Error: {e}")
        return False

# Скачивание файла
def download_file(bucket, object_name, file_path):
    try:
        s3_client.download_file(bucket, object_name, file_path)
        return True
    except ClientError as e:
        print(f"Error: {e}")
        return False

# Генерация presigned URL
def generate_presigned_url(bucket, object_name, expiration=3600):
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': object_name},
            ExpiresIn=expiration
        )
        return url
    except ClientError as e:
        print(f"Error: {e}")
        return None
```

---

## 🎯 Типичные вопросы на собеседовании

### Теоретические вопросы:

1. **"Расскажите о своем опыте работы с FastAPI"**
   - Готовьте примеры проектов
   - Упомяните асинхронность, Pydantic, dependency injection

2. **"Как вы работаете с базой данных в Python?"**
   - SQLAlchemy ORM
   - Миграции через Alembic
   - Асинхронные запросы

3. **"Зачем нужен Redis в проекте?"**
   - Кэширование
   - Сессии
   - Очереди задач
   - Rate limiting

4. **"Как вы тестируете свой код?"**
   - Unit-тесты с pytest
   - Интеграционные тесты
   - Покрытие кода

5. **"Что такое асинхронное программирование?"**
   - Объясните `async/await`
   - Когда использовать
   - Преимущества и недостатки

### Практические задачи:

1. **Создать простой REST API для управления задачами (TODO)**
   - CRUD операции
   - Валидация данных
   - Обработка ошибок

2. **Реализовать кэширование с Redis**
   - Кэш для часто запрашиваемых данных
   - TTL для кэша

3. **Написать тесты для API endpoint**
   - Unit-тесты
   - Тесты с моками

4. **Реализовать WebSocket для real-time обновлений**
   - Подключение клиентов
   - Отправка сообщений

---

## 📚 Рекомендуемые ресурсы для подготовки

### Документация:
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [Alembic Documentation](https://alembic.sqlalchemy.org/)
- [Python asyncio](https://docs.python.org/3/library/asyncio.html)
- [Redis Documentation](https://redis.io/docs/)

### Практика:
- Создайте небольшой проект с FastAPI + PostgreSQL + Redis
- Реализуйте CRUD API
- Добавьте WebSocket для real-time обновлений
- Напишите тесты
- Используйте миграции Alembic

### Пример проекта для практики:
```python
# Проект: Система управления задачами с real-time обновлениями
# Технологии: FastAPI, SQLAlchemy, PostgreSQL, Redis, WebSockets
# Функционал:
# - CRUD для задач
# - Кэширование списка задач в Redis
# - WebSocket для уведомлений о новых задачах
# - Unit и интеграционные тесты
```

---

## ✅ Чеклист перед собеседованием

- [ ] Повторил основы Python 3.12
- [ ] Изучил FastAPI (создание API, валидация, зависимости)
- [ ] Разобрался с асинхронным программированием
- [ ] Повторил SQLAlchemy (модели, запросы, отношения)
- [ ] Изучил Alembic (миграции)
- [ ] Повторил SQL (PostgreSQL)
- [ ] Разобрался с REST API принципами
- [ ] Изучил WebSockets в FastAPI
- [ ] Повторил Redis (основы, кэширование)
- [ ] Изучил тестирование (pytest)
- [ ] Посмотрел базовый синтаксис Golang (если время есть)
- [ ] Изучил основы S3 (если время есть)
- [ ] Создал небольшой проект для практики
- [ ] Подготовил примеры кода из своих проектов

---

## 💡 Советы для собеседования

1. **Будьте честны** - если чего-то не знаете, скажите об этом
2. **Думайте вслух** - покажите процесс решения задачи
3. **Задавайте вопросы** - уточняйте требования к задаче
4. **Приводите примеры** - из своего опыта или проектов
5. **Покажите интерес** - задайте вопросы о проекте, команде, технологиях

---

**Удачи на собеседовании! 🚀**

