import asyncio
import aiohttp
import random
import time
from asyncio import Semaphore

base = "https://chessmint.ru"
endpoints = [
    "/games", "/api/games/",
    "/api/games/?status=ACTIVE", "/api/games/?limit=10&offset=0",
    "/api/puzzles/", "/api/users/"
]

total_requests = 100_000
concurrency = 160  # одновременных запросов
# ВНИМАНИЕ: При такой высокой конкурентности убедитесь, что пул соединений БД достаточно большой
# Для puzzles_service рекомендуется: pool_size=50, max_overflow=100 (итого 150 соединений)
timeout = aiohttp.ClientTimeout(total=15, connect=5)

# Предварительно создаем все URL для избежания повторных операций
base_clean = base.rstrip("/")
urls = [base_clean + ep for ep in endpoints]

sem = Semaphore(concurrency)

async def fetch(session, url):
    async with sem:
        try:
            async with session.get(url) as resp:
                # Читаем только статус, не тело ответа для экономии памяти
                status = resp.status
                # Сбрасываем тело ответа, чтобы не загружать его в память
                await resp.release()
                return status
        except Exception:
            return None

async def worker(session, queue, results):
    """Воркер, который берет задачи из очереди"""
    while True:
        try:
            url = await asyncio.wait_for(queue.get(), timeout=0.1)
        except asyncio.TimeoutError:
            break
        
        status = await fetch(session, url)
        if status and status < 400:
            results[0] += 1
        else:
            results[1] += 1
        
        queue.task_done()
        
        # Прогресс каждые 1000 запросов
        completed = results[0] + results[1]
        if completed % 1000 == 0:
            print(f"Sent {completed}/{total_requests} — successes: {results[0]}, errors: {results[1]}")

async def main():
    results = [0, 0]  # [success, errors]
    start = time.time()
    
    # Оптимизированный коннектор с пулом соединений
    connector = aiohttp.TCPConnector(
        limit=concurrency * 2,  # Пул соединений больше конкурентности
        limit_per_host=concurrency,
        ttl_dns_cache=300,  # Кэш DNS на 5 минут
        force_close=False,  # Переиспользование соединений
        enable_cleanup_closed=True
    )
    
    async with aiohttp.ClientSession(
        timeout=timeout,
        connector=connector,
        skip_auto_headers=['User-Agent'],  # Убираем лишние заголовки
    ) as session:
        # Используем очередь для батчинга задач
        queue = asyncio.Queue(maxsize=concurrency * 2)
        
        # Запускаем воркеры
        workers = [
            asyncio.create_task(worker(session, queue, results))
            for _ in range(concurrency)
        ]
        
        # Добавляем задачи в очередь
        for _ in range(total_requests):
            url = random.choice(urls)
            await queue.put(url)
        
        # Ждем завершения всех задач
        await queue.join()
        
        # Останавливаем воркеры
        for w in workers:
            w.cancel()
        await asyncio.gather(*workers, return_exceptions=True)
    
    duration = time.time() - start
    print(f"Done: {total_requests} requests — successes: {results[0]}, errors: {results[1]}, time: {duration:.1f}s")
    print(f"RPS: {total_requests / duration:.0f} requests/second")

asyncio.run(main())
