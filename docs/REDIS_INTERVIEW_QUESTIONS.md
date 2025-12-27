# Базовые вопросы по Redis для Python Junior разработчика

## 1. Основы Redis

### Что такое Redis?
**Ответ:** Redis (Remote Dictionary Server) — это in-memory структура данных, используемая как база данных, кэш и брокер сообщений. Redis хранит данные в оперативной памяти, что обеспечивает очень высокую производительность.

### Какие основные типы данных поддерживает Redis?
**Ответ:**
- **Strings** — строки
- **Lists** — списки (двусторонние очереди)
- **Sets** — множества (неупорядоченные коллекции уникальных элементов)
- **Sorted Sets** — отсортированные множества
- **Hashes** — хеш-таблицы (словари)
- **Bitmaps** — битовые массивы
- **HyperLogLog** — для подсчета уникальных элементов
- **Streams** — потоки данных (для pub/sub и очередей)

### В чем разница между Redis и обычной реляционной БД?
**Ответ:**
- Redis хранит данные в памяти (RAM), а не на диске
- Redis — NoSQL база данных (ключ-значение)
- Redis очень быстрый (микросекунды), но ограничен размером RAM
- Redis не поддерживает сложные JOIN-запросы
- Redis лучше подходит для кэширования, сессий, очередей

## 2. Работа с Redis в Python

### Какие библиотеки используются для работы с Redis в Python?
**Ответ:**
- **redis-py** — официальная библиотека для Python
- **hiredis** — быстрый парсер протокола Redis (опционально)
- **redis-cluster** — для работы с Redis Cluster

### Как подключиться к Redis в Python?
**Ответ:**
```python
import redis

# Простое подключение
r = redis.Redis(host='localhost', port=6379, db=0)

# С пулом соединений (рекомендуется)
pool = redis.ConnectionPool(host='localhost', port=6379, db=0)
r = redis.Redis(connection_pool=pool)

# С паролем
r = redis.Redis(host='localhost', port=6379, password='your_password')
```

### Как установить и получить значение в Redis через Python?
**Ответ:**
```python
import redis
r = redis.Redis(host='localhost', port=6379, db=0)

# Установить значение
r.set('key', 'value')

# Получить значение
value = r.get('key')  # Возвращает bytes
value_str = r.get('key').decode('utf-8')  # Преобразовать в строку

# Установить с TTL (время жизни)
r.setex('key', 60, 'value')  # 60 секунд

# Установить только если ключ не существует
r.setnx('key', 'value')
```

## 3. Операции с данными

### Как работать со списками (Lists) в Redis через Python?
**Ответ:**
```python
# Добавить элемент в начало списка
r.lpush('mylist', 'item1', 'item2')

# Добавить элемент в конец списка
r.rpush('mylist', 'item3')

# Получить элементы списка
items = r.lrange('mylist', 0, -1)  # Все элементы

# Получить длину списка
length = r.llen('mylist')

# Удалить и вернуть первый элемент
item = r.lpop('mylist')

# Удалить и вернуть последний элемент
item = r.rpop('mylist')
```

### Как работать с множествами (Sets) в Redis через Python?
**Ответ:**
```python
# Добавить элементы в множество
r.sadd('myset', 'member1', 'member2', 'member3')

# Получить все элементы множества
members = r.smembers('myset')

# Проверить принадлежность элемента
exists = r.sismember('myset', 'member1')

# Получить количество элементов
count = r.scard('myset')

# Удалить элемент
r.srem('myset', 'member1')

# Пересечение множеств
intersection = r.sinter('set1', 'set2')

# Объединение множеств
union = r.sunion('set1', 'set2')
```

### Как работать с хешами (Hashes) в Redis через Python?
**Ответ:**
```python
# Установить поле в хеше
r.hset('user:1', 'name', 'John')
r.hset('user:1', 'age', 30)

# Установить несколько полей сразу
r.hmset('user:1', {'name': 'John', 'age': 30, 'city': 'Moscow'})

# Получить значение поля
name = r.hget('user:1', 'name')

# Получить все поля и значения
user_data = r.hgetall('user:1')  # Возвращает словарь

# Получить все значения
values = r.hvals('user:1')

# Получить все поля
fields = r.hkeys('user:1')

# Удалить поле
r.hdel('user:1', 'age')
```

### Как работать с отсортированными множествами (Sorted Sets) в Redis через Python?
**Ответ:**
```python
# Добавить элемент с оценкой (score)
r.zadd('leaderboard', {'player1': 100, 'player2': 200, 'player3': 150})

# Получить элементы по диапазону оценок
top_players = r.zrange('leaderboard', 0, -1, withscores=True)

# Получить элементы в обратном порядке (от большего к меньшему)
top_players = r.zrevrange('leaderboard', 0, 2, withscores=True)  # Топ-3

# Получить ранг элемента
rank = r.zrank('leaderboard', 'player2')

# Получить оценку элемента
score = r.zscore('leaderboard', 'player1')

# Увеличить оценку элемента
r.zincrby('leaderboard', 10, 'player1')
```

## 4. TTL и управление ключами

### Что такое TTL в Redis?
**Ответ:** TTL (Time To Live) — время жизни ключа в секундах. После истечения TTL ключ автоматически удаляется из Redis.

### Как установить TTL для ключа в Python?
**Ответ:**
```python
# Установить значение с TTL
r.setex('key', 60, 'value')  # 60 секунд

# Установить TTL для существующего ключа
r.expire('key', 60)

# Установить TTL в миллисекундах
r.pexpire('key', 60000)

# Получить оставшееся время жизни
ttl = r.ttl('key')  # Возвращает секунды или -1 если нет TTL, -2 если ключ не существует

# Удалить TTL (сделать ключ постоянным)
r.persist('key')
```

### Как проверить существование ключа и удалить его?
**Ответ:**
```python
# Проверить существование ключа
exists = r.exists('key')

# Удалить ключ
r.delete('key')

# Удалить несколько ключей
r.delete('key1', 'key2', 'key3')

# Удалить все ключи в текущей БД (осторожно!)
r.flushdb()

# Удалить все ключи во всех БД
r.flushall()
```

## 5. Транзакции и атомарность

### Что такое транзакции в Redis?
**Ответ:** Транзакции в Redis позволяют выполнить несколько команд атомарно (все или ничего). Redis использует команды MULTI, EXEC, DISCARD, WATCH.

### Как выполнить транзакцию в Python?
**Ответ:**
```python
# Простая транзакция
pipe = r.pipeline()
pipe.set('key1', 'value1')
pipe.set('key2', 'value2')
pipe.execute()  # Все команды выполняются атомарно

# Транзакция с проверкой (WATCH)
pipe = r.pipeline()
try:
    pipe.watch('balance')
    balance = int(r.get('balance') or 0)
    pipe.multi()
    pipe.set('balance', balance - 10)
    pipe.execute()
except redis.WatchError:
    print("Ключ был изменен другой транзакцией")
```

### Что такое атомарные операции в Redis?
**Ответ:** Атомарные операции выполняются полностью или не выполняются вообще. Примеры:
- `INCR`, `DECR` — инкремент/декремент
- `INCRBY`, `DECRBY` — увеличение/уменьшение на число
- `APPEND` — добавление к строке
- `SETNX` — установка только если не существует

## 6. Паттерны и Pub/Sub

### Что такое Pub/Sub в Redis?
**Ответ:** Pub/Sub (Publisher/Subscriber) — паттерн для отправки сообщений подписчикам. Издатель отправляет сообщения в канал, а подписчики получают их.

### Как использовать Pub/Sub в Python?
**Ответ:**
```python
import redis
import threading

# Издатель (Publisher)
r = redis.Redis()
r.publish('channel', 'Hello, subscribers!')

# Подписчик (Subscriber)
def subscriber():
    r = redis.Redis()
    pubsub = r.pubsub()
    pubsub.subscribe('channel')
    
    for message in pubsub.listen():
        if message['type'] == 'message':
            print(f"Получено: {message['data']}")

# Запустить в отдельном потоке
thread = threading.Thread(target=subscriber)
thread.start()
```

## 7. Кэширование

### Как использовать Redis для кэширования в Python веб-приложении?
**Ответ:**
```python
import redis
import json
from functools import wraps

r = redis.Redis(host='localhost', port=6379, db=0)

def cache_result(ttl=300):
    """Декоратор для кэширования результатов функции"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Создать ключ кэша из аргументов функции
            cache_key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            
            # Попытаться получить из кэша
            cached = r.get(cache_key)
            if cached:
                return json.loads(cached)
            
            # Выполнить функцию и сохранить результат
            result = func(*args, **kwargs)
            r.setex(cache_key, ttl, json.dumps(result))
            return result
        return wrapper
    return decorator

# Использование
@cache_result(ttl=600)
def expensive_function(user_id):
    # Дорогая операция (например, запрос к БД)
    return {"user_id": user_id, "data": "..."}
```

### Как реализовать кэш-асайд паттерн?
**Ответ:**
```python
def get_user(user_id):
    cache_key = f"user:{user_id}"
    
    # Попытаться получить из кэша
    cached = r.get(cache_key)
    if cached:
        return json.loads(cached)
    
    # Если нет в кэше, получить из БД
    user = db.get_user(user_id)
    
    # Сохранить в кэш
    if user:
        r.setex(cache_key, 3600, json.dumps(user))
    
    return user
```

## 8. Производительность и оптимизация

### Что такое pipeline в Redis?
**Ответ:** Pipeline позволяет отправить несколько команд за один раз без ожидания ответа на каждую команду, что значительно увеличивает производительность.

### Как использовать pipeline в Python?
**Ответ:**
```python
# Обычный способ (медленно)
for i in range(1000):
    r.set(f'key{i}', f'value{i}')

# С pipeline (быстро)
pipe = r.pipeline()
for i in range(1000):
    pipe.set(f'key{i}', f'value{i}')
pipe.execute()  # Все команды отправляются за один раз
```

### Что такое connection pooling и зачем он нужен?
**Ответ:** Connection Pool — пул соединений, который переиспользует TCP-соединения вместо создания нового для каждого запроса. Это повышает производительность.

```python
from redis import ConnectionPool

# Создать пул соединений
pool = ConnectionPool(host='localhost', port=6379, max_connections=50)

# Использовать пул
r = redis.Redis(connection_pool=pool)
```

## 9. Персистентность данных

### Какие способы персистентности данных есть в Redis?
**Ответ:**
1. **RDB (Redis Database Backup)** — моментальные снимки данных на диск
2. **AOF (Append Only File)** — логирование каждой команды
3. **RDB + AOF** — комбинация обоих методов

### В чем разница между RDB и AOF?
**Ответ:**
- **RDB**: Быстрое восстановление, меньший размер файла, но возможна потеря данных между снимками
- **AOF**: Более надежно (меньше потерь данных), но медленнее восстановление и больший размер файла

## 10. Безопасность

### Как защитить Redis от несанкционированного доступа?
**Ответ:**
- Установить пароль (`requirepass` в конфиге)
- Ограничить доступ по IP (`bind` в конфиге)
- Использовать SSL/TLS для соединений
- Переименовать опасные команды (`rename-command FLUSHDB ""`)
- Использовать отдельного пользователя для запуска Redis

### Как подключиться к Redis с паролем в Python?
**Ответ:**
```python
r = redis.Redis(
    host='localhost',
    port=6379,
    password='your_password',
    decode_responses=True  # Автоматически декодировать bytes в строки
)
```

## 11. Практические задачи

### Как реализовать счетчик посещений страницы?
**Ответ:**
```python
def increment_page_views(page_id):
    key = f"page_views:{page_id}"
    return r.incr(key)

def get_page_views(page_id):
    key = f"page_views:{page_id}"
    return int(r.get(key) or 0)
```

### Как реализовать rate limiting (ограничение частоты запросов)?
**Ответ:**
```python
def rate_limit(user_id, limit=10, window=60):
    """Ограничение: limit запросов за window секунд"""
    key = f"rate_limit:{user_id}"
    current = r.incr(key)
    
    if current == 1:
        r.expire(key, window)
    
    return current <= limit
```

### Как реализовать сессии пользователей?
**Ответ:**
```python
import json
import secrets

def create_session(user_id):
    session_id = secrets.token_urlsafe(32)
    session_data = {
        'user_id': user_id,
        'created_at': time.time()
    }
    r.setex(f"session:{session_id}", 3600, json.dumps(session_data))
    return session_id

def get_session(session_id):
    data = r.get(f"session:{session_id}")
    if data:
        return json.loads(data)
    return None
```

### Как реализовать простую очередь задач?
**Ответ:**
```python
# Добавить задачу в очередь
def enqueue_task(task_data):
    r.lpush('task_queue', json.dumps(task_data))

# Получить задачу из очереди
def dequeue_task():
    task = r.brpop('task_queue', timeout=10)  # Блокирующее получение
    if task:
        return json.loads(task[1])
    return None
```

## 12. Обработка ошибок

### Как обрабатывать ошибки при работе с Redis в Python?
**Ответ:**
```python
import redis
from redis.exceptions import ConnectionError, TimeoutError, RedisError

try:
    r = redis.Redis(host='localhost', port=6379)
    r.ping()  # Проверить соединение
    r.set('key', 'value')
except ConnectionError:
    print("Не удалось подключиться к Redis")
except TimeoutError:
    print("Таймаут при работе с Redis")
except RedisError as e:
    print(f"Ошибка Redis: {e}")
```

## 13. Мониторинг и отладка

### Как проверить, что Redis работает?
**Ответ:**
```python
# Проверка соединения
r.ping()  # Должно вернуть True

# Получить информацию о сервере
info = r.info()
print(info['redis_version'])
print(info['used_memory_human'])

# Получить количество ключей
key_count = r.dbsize()
```

### Как найти ключи по паттерну?
**Ответ:**
```python
# Найти все ключи по паттерну (осторожно на продакшене!)
keys = r.keys('user:*')  # Может быть медленно на больших БД

# Использовать SCAN для больших БД (рекомендуется)
for key in r.scan_iter(match='user:*', count=100):
    print(key)
```

## 14. Частые ошибки и best practices

### Какие частые ошибки делают при работе с Redis?
**Ответ:**
1. Использование `KEYS` на продакшене (медленно)
2. Не установка TTL для кэша (утечка памяти)
3. Не использование connection pooling
4. Не обработка ошибок соединения
5. Хранение больших объектов в одном ключе
6. Не использование pipeline для множественных операций

### Best practices для работы с Redis в Python
**Ответ:**
1. Всегда используйте connection pooling
2. Используйте `SCAN` вместо `KEYS`
3. Устанавливайте разумные TTL для кэша
4. Используйте pipeline для множественных операций
5. Обрабатывайте ошибки соединения
6. Используйте `decode_responses=True` для удобства работы со строками
7. Не храните слишком большие значения (оптимально < 100KB)
8. Используйте префиксы для ключей (`user:123`, `session:abc`)

## 15. Вопросы для углубленного изучения

### Что такое Redis Cluster?
**Ответ:** Redis Cluster — это способ горизонтального масштабирования Redis, где данные распределяются между несколькими узлами.

### Что такое Redis Sentinel?
**Ответ:** Redis Sentinel — система мониторинга и автоматического failover для Redis в режиме master-slave репликации.

### Что такое Lua scripts в Redis?
**Ответ:** Redis позволяет выполнять Lua скрипты на сервере, что позволяет выполнять сложные операции атомарно.

```python
# Пример Lua скрипта
script = """
local current = redis.call('GET', KEYS[1])
if current == false then
    redis.call('SET', KEYS[1], ARGV[1])
    return ARGV[1]
else
    return current
end
"""
sha = r.script_load(script)
result = r.evalsha(sha, 1, 'key', 'value')
```

---

## Полезные ресурсы для изучения

1. Официальная документация Redis: https://redis.io/docs/
2. Документация redis-py: https://redis-py.readthedocs.io/
3. Redis команды: https://redis.io/commands/
4. Redis University (бесплатные курсы)

---

**Примечание:** Эти вопросы покрывают базовый уровень для Python Junior разработчика. Для более глубокого понимания рекомендуется практиковаться с реальными проектами и изучать продвинутые темы (кластеризация, репликация, оптимизация производительности).

