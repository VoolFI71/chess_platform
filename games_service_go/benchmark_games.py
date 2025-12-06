#!/usr/bin/env python3
"""
Скрипт для сравнения производительности Python и Go версий games микросервиса
Измеряет время ответа, пропускную способность и статистику для различных endpoints
"""

import asyncio
import time
import statistics
import json
from collections import defaultdict
from typing import List, Dict, Optional
from pathlib import Path
import httpx
import argparse


class BenchmarkStats:
    def __init__(self):
        self.response_times: List[float] = []
        self.status_codes: Dict[int, int] = defaultdict(int)
        self.errors: List[str] = []
        self.start_time: float = 0
        self.end_time: float = 0
        self.response_sizes: List[int] = []
        
    def add_response(self, response_time: float, status_code: int, error: str = None, response_size: int = 0):
        self.response_times.append(response_time)
        self.status_codes[status_code] += 1
        if error:
            self.errors.append(error)
        if response_size > 0:
            self.response_sizes.append(response_size)
    
    def print_stats(self, service_name: str):
        if not self.response_times:
            print(f"\n[{service_name}] Нет данных для отображения")
            return
            
        duration = self.end_time - self.start_time
        total_requests = len(self.response_times)
        successful = sum(1 for code in self.status_codes.keys() if 200 <= code < 300)
        failed = total_requests - successful
        
        print(f"\n{'='*60}")
        print(f"[{service_name}] Результаты теста")
        print(f"{'='*60}")
        print(f"Всего запросов: {total_requests}")
        print(f"Успешных: {successful}")
        print(f"Ошибок: {failed}")
        print(f"Время выполнения: {duration:.2f} секунд")
        print(f"Запросов/сек: {total_requests/duration:.2f}")
        
        if self.response_times:
            sorted_times = sorted(self.response_times)
            print(f"\nВремя ответа (мс):")
            print(f"  Минимум: {min(self.response_times)*1000:.2f}")
            print(f"  Максимум: {max(self.response_times)*1000:.2f}")
            print(f"  Среднее: {statistics.mean(self.response_times)*1000:.2f}")
            print(f"  Медиана: {statistics.median(self.response_times)*1000:.2f}")
            if len(sorted_times) >= 10:
                print(f"  50-й процентиль: {sorted_times[len(sorted_times)//2]*1000:.2f}")
                print(f"  75-й процентиль: {sorted_times[int(len(sorted_times)*0.75)]*1000:.2f}")
                print(f"  90-й процентиль: {sorted_times[int(len(sorted_times)*0.90)]*1000:.2f}")
                print(f"  95-й процентиль: {sorted_times[int(len(sorted_times)*0.95)]*1000:.2f}")
                print(f"  99-й процентиль: {sorted_times[int(len(sorted_times)*0.99)]*1000:.2f}")
            if len(self.response_times) > 1:
                print(f"  Стандартное отклонение: {statistics.stdev(self.response_times)*1000:.2f}")
        
        if self.response_sizes:
            avg_size = statistics.mean(self.response_sizes)
            print(f"\nРазмер ответа (байт):")
            print(f"  Средний: {avg_size:.0f}")
            print(f"  Минимальный: {min(self.response_sizes)}")
            print(f"  Максимальный: {max(self.response_sizes)}")
        
        if self.status_codes:
            print(f"\nКоды ответов:")
            for code, count in sorted(self.status_codes.items()):
                print(f"  {code}: {count}")
        
        if self.errors:
            print(f"\nОшибки (первые 5):")
            for error in self.errors[:5]:
                print(f"  {error}")
    
    def to_dict(self):
        if not self.response_times:
            return {}
            
        sorted_times = sorted(self.response_times)
        duration = self.end_time - self.start_time
        
        return {
            "total_requests": len(self.response_times),
            "successful": sum(1 for code in self.status_codes.keys() if 200 <= code < 300),
            "failed": len(self.response_times) - sum(1 for code in self.status_codes.keys() if 200 <= code < 300),
            "duration_seconds": duration,
            "requests_per_second": len(self.response_times) / duration if duration > 0 else 0,
            "response_times_ms": {
                "min": min(self.response_times) * 1000,
                "max": max(self.response_times) * 1000,
                "mean": statistics.mean(self.response_times) * 1000,
                "median": statistics.median(self.response_times) * 1000,
                "p50": sorted_times[len(sorted_times)//2] * 1000 if len(sorted_times) >= 2 else 0,
                "p75": sorted_times[int(len(sorted_times)*0.75)] * 1000 if len(sorted_times) >= 10 else 0,
                "p90": sorted_times[int(len(sorted_times)*0.90)] * 1000 if len(sorted_times) >= 10 else 0,
                "p95": sorted_times[int(len(sorted_times)*0.95)] * 1000 if len(sorted_times) >= 10 else 0,
                "p99": sorted_times[int(len(sorted_times)*0.99)] * 1000 if len(sorted_times) >= 10 else 0,
                "stdev": statistics.stdev(self.response_times) * 1000 if len(self.response_times) > 1 else 0,
            },
            "status_codes": dict(self.status_codes),
            "errors": self.errors[:10],
        }


async def make_request(client: httpx.AsyncClient, url: str, stats: BenchmarkStats, token: str = None, request_num: int = 0):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    start = time.time()
    try:
        response = await client.get(url, headers=headers, timeout=30.0)
        elapsed = time.time() - start
        
        response_size = len(response.content)
        stats.add_response(elapsed, response.status_code, response_size=response_size)
        
        if request_num > 0 and request_num % 100 == 0:
            print(f"Выполнено запросов: {request_num}")
            
    except Exception as e:
        elapsed = time.time() - start
        stats.add_response(elapsed, 0, error=str(e))


async def benchmark_endpoint(
    base_url: str,
    endpoint: str,
    concurrent: int = 10,
    total_requests: int = 100,
    token: str = None
) -> BenchmarkStats:
    """Бенчмарк конкретного endpoint"""
    
    url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"
    if "?" in url:
        url += f"&_t={int(time.time() * 1000)}"
    else:
        url += f"?_t={int(time.time() * 1000)}"
    
    stats = BenchmarkStats()
    
    print(f"Тестируем: {url}")
    print(f"Конкурентность: {concurrent}, Всего запросов: {total_requests}")
    
    stats.start_time = time.time()
    
    async with httpx.AsyncClient(
        limits=httpx.Limits(max_keepalive_connections=concurrent, max_connections=concurrent * 2),
        timeout=httpx.Timeout(30.0, connect=10.0)
    ) as client:
        # Прогреваем кеш
        print("Прогревание...")
        for i in range(min(5, concurrent)):
            try:
                await client.get(url.replace("_t=", f"_warmup={i}&_t="), timeout=30.0)
            except:
                pass
        await asyncio.sleep(0.2)
        print("Начинаем тест...\n")
        
        semaphore = asyncio.Semaphore(concurrent)
        request_counter = 0
        
        async def bounded_request():
            nonlocal request_counter
            async with semaphore:
                request_counter += 1
                await make_request(client, url, stats, token, request_counter)
        
        tasks = [bounded_request() for _ in range(total_requests)]
        await asyncio.gather(*tasks)
    
    stats.end_time = time.time()
    return stats


def compare_results(python_stats: BenchmarkStats, go_stats: BenchmarkStats):
    """Сравнение результатов Python и Go версий"""
    
    print(f"\n{'='*60}")
    print("СРАВНЕНИЕ ПРОИЗВОДИТЕЛЬНОСТИ")
    print(f"{'='*60}\n")
    
    py_dict = python_stats.to_dict()
    go_dict = go_stats.to_dict()
    
    if not py_dict or not go_dict:
        print("Недостаточно данных для сравнения")
        return
    
    print("Пропускная способность (запросов/сек):")
    py_rps = py_dict["requests_per_second"]
    go_rps = go_dict["requests_per_second"]
    print(f"  Python: {py_rps:.2f}")
    print(f"  Go:     {go_rps:.2f}")
    if py_rps > 0:
        improvement = ((go_rps - py_rps) / py_rps) * 100
        print(f"  Изменение: {improvement:+.1f}%")
    print()
    
    print("Среднее время ответа (мс):")
    py_mean = py_dict["response_times_ms"]["mean"]
    go_mean = go_dict["response_times_ms"]["mean"]
    print(f"  Python: {py_mean:.2f}")
    print(f"  Go:     {go_mean:.2f}")
    if py_mean > 0:
        improvement = ((py_mean - go_mean) / py_mean) * 100
        print(f"  Изменение: {improvement:+.1f}%")
    print()
    
    print("Медианное время ответа (мс):")
    py_median = py_dict["response_times_ms"]["median"]
    go_median = go_dict["response_times_ms"]["median"]
    print(f"  Python: {py_median:.2f}")
    print(f"  Go:     {go_median:.2f}")
    if py_median > 0:
        improvement = ((py_median - go_median) / py_median) * 100
        print(f"  Изменение: {improvement:+.1f}%")
    print()
    
    print("99-й процентиль (мс):")
    py_p99 = py_dict["response_times_ms"].get("p99", 0)
    go_p99 = go_dict["response_times_ms"].get("p99", 0)
    print(f"  Python: {py_p99:.2f}")
    print(f"  Go:     {go_p99:.2f}")
    if py_p99 > 0:
        improvement = ((py_p99 - go_p99) / py_p99) * 100
        print(f"  Изменение: {improvement:+.1f}%")
    print()


async def main():
    parser = argparse.ArgumentParser(description="Бенчмарк для сравнения Python и Go версий games микросервиса")
    parser.add_argument("--python-url", default="http://localhost:8080", help="URL Python версии")
    parser.add_argument("--go-url", default="http://localhost:8080", help="URL Go версии")
    parser.add_argument("--endpoint", default="/api/games/", help="Endpoint для тестирования")
    parser.add_argument("--requests", type=int, default=1000, help="Количество запросов")
    parser.add_argument("--concurrent", type=int, default=10, help="Количество параллельных запросов")
    parser.add_argument("--token", help="JWT токен для авторизованных запросов")
    parser.add_argument("--save", help="Сохранить результаты в JSON файл")
    
    args = parser.parse_args()
    
    print("="*60)
    print("БЕНЧМАРК: Python vs Go - Games Service")
    print("="*60)
    
    # Тест Python версии (если доступна)
    print("\n[1/2] Тестируем Python версию...")
    python_stats = await benchmark_endpoint(
        args.python_url,
        args.endpoint,
        args.concurrent,
        args.requests,
        args.token
    )
    python_stats.print_stats("Python")
    
    print("\n\nОжидание 2 секунды перед тестом Go версии...")
    await asyncio.sleep(2)
    
    # Тест Go версии
    print("\n[2/2] Тестируем Go версию...")
    go_stats = await benchmark_endpoint(
        args.go_url,
        args.endpoint,
        args.concurrent,
        args.requests,
        args.token
    )
    go_stats.print_stats("Go")
    
    # Сравнение
    compare_results(python_stats, go_stats)
    
    # Сохранение результатов
    if args.save:
        results = {
            "python": python_stats.to_dict(),
            "go": go_stats.to_dict(),
            "timestamp": time.time(),
        }
        with open(args.save, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nРезультаты сохранены в {args.save}")


if __name__ == "__main__":
    asyncio.run(main())

