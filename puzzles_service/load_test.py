#!/usr/bin/env python3
"""
Скрипт для нагрузочного тестирования endpoint /api/puzzles/random
Измеряет время ответа, пропускную способность и статистику
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


class LoadTestStats:
    def __init__(self):
        self.response_times: List[float] = []
        self.status_codes: Dict[int, int] = defaultdict(int)
        self.errors: List[str] = []
        self.start_time: float = 0
        self.end_time: float = 0
        # Метрики для оценки сетевых оптимизаций
        self.response_sizes: List[int] = []  # Размер ответа после сжатия (bytes)
        self.uncompressed_sizes: List[int] = []  # Размер ответа до сжатия (bytes)
        self.compression_types: Dict[str, int] = defaultdict(int)  # Тип сжатия
        self.transfer_times: List[float] = []  # Время передачи данных
        
    def add_response(
        self, 
        response_time: float, 
        status_code: int, 
        error: str = None,
        response_size: int = 0,
        uncompressed_size: int = 0,
        compression_type: str = None,
        transfer_time: float = 0
    ):
        self.response_times.append(response_time)
        self.status_codes[status_code] += 1
        if error:
            self.errors.append(error)
        if response_size > 0:
            self.response_sizes.append(response_size)
        if uncompressed_size > 0:
            self.uncompressed_sizes.append(uncompressed_size)
        if compression_type:
            self.compression_types[compression_type] += 1
        if transfer_time > 0:
            self.transfer_times.append(transfer_time)
    
    def print_stats(self):
        if not self.response_times:
            print("Нет данных для анализа")
            return
        
        total_time = self.end_time - self.start_time
        total_requests = len(self.response_times)
        successful = sum(1 for code in self.status_codes.keys() if 200 <= code < 300)
        
        print("\n" + "="*60)
        print("РЕЗУЛЬТАТЫ НАГРУЗОЧНОГО ТЕСТИРОВАНИЯ")
        print("="*60)
        print(f"\nОбщее время теста: {total_time:.2f} сек")
        print(f"Всего запросов: {total_requests}")
        successful = sum(count for code, count in self.status_codes.items() if 200 <= code < 300)
        print(f"Успешных запросов: {successful} ({successful/total_requests*100:.1f}%)")
        print(f"Пропускная способность: {total_requests/total_time:.2f} req/sec")
        
        print(f"\n--- Статус коды ---")
        for code, count in sorted(self.status_codes.items()):
            print(f"  {code}: {count} ({count/total_requests*100:.1f}%)")
        
        if self.errors:
            print(f"\n--- Ошибки ({len(self.errors)}) ---")
            error_counts = defaultdict(int)
            for error in self.errors:
                error_counts[error] += 1
            for error, count in error_counts.items():
                print(f"  {error}: {count}")
        
        print(f"\n--- Время ответа (мс) ---")
        times_ms = [t * 1000 for t in self.response_times]
        print(f"  Минимум: {min(times_ms):.2f} мс")
        print(f"  Максимум: {max(times_ms):.2f} мс")
        print(f"  Среднее: {statistics.mean(times_ms):.2f} мс")
        print(f"  Медиана: {statistics.median(times_ms):.2f} мс")
        
        if len(times_ms) > 1:
            print(f"  Стандартное отклонение: {statistics.stdev(times_ms):.2f} мс")
        
        # Процентили
        sorted_times = sorted(times_ms)
        percentiles = [50, 75, 90, 95, 99]
        print(f"\n--- Процентили ---")
        for p in percentiles:
            idx = int(len(sorted_times) * p / 100)
            idx = min(idx, len(sorted_times) - 1)
            print(f"  {p}%: {sorted_times[idx]:.2f} мс")
        
        # Метрики сетевых оптимизаций
        if self.response_sizes:
            print(f"\n--- Размер ответа (байты) ---")
            print(f"  Средний размер (сжатый): {statistics.mean(self.response_sizes):.0f} байт")
            print(f"  Медианный размер (сжатый): {statistics.median(self.response_sizes):.0f} байт")
            if self.uncompressed_sizes:
                avg_uncompressed = statistics.mean(self.uncompressed_sizes)
                avg_compressed = statistics.mean(self.response_sizes)
                compression_ratio = (1 - avg_compressed / avg_uncompressed) * 100 if avg_uncompressed > 0 else 0
                print(f"  Средний размер (несжатый): {avg_uncompressed:.0f} байт")
                print(f"  Коэффициент сжатия: {compression_ratio:.1f}%")
        
        if self.compression_types:
            print(f"\n--- Тип сжатия ---")
            total_compressed = sum(self.compression_types.values())
            for comp_type, count in sorted(self.compression_types.items()):
                print(f"  {comp_type or 'без сжатия'}: {count} ({count/total_compressed*100:.1f}%)")
        
        if self.transfer_times:
            transfer_times_ms = [t * 1000 for t in self.transfer_times]
            print(f"\n--- Время передачи данных (мс) ---")
            print(f"  Среднее: {statistics.mean(transfer_times_ms):.2f} мс")
            print(f"  Медиана: {statistics.median(transfer_times_ms):.2f} мс")
        
        print("="*60 + "\n")
    
    def to_dict(self) -> dict:
        """Экспортирует статистику в словарь для сравнения"""
        times_ms = [t * 1000 for t in self.response_times]
        sorted_times = sorted(times_ms)
        
        result = {
            "total_time": self.end_time - self.start_time,
            "total_requests": len(self.response_times),
            "successful_requests": sum(count for code, count in self.status_codes.items() if 200 <= code < 300),
            "throughput": len(self.response_times) / (self.end_time - self.start_time) if self.end_time > self.start_time else 0,
            "response_times_ms": {
                "min": min(times_ms) if times_ms else 0,
                "max": max(times_ms) if times_ms else 0,
                "mean": statistics.mean(times_ms) if times_ms else 0,
                "median": statistics.median(times_ms) if times_ms else 0,
                "stdev": statistics.stdev(times_ms) if len(times_ms) > 1 else 0,
            },
            "percentiles": {}
        }
        
        # Процентили
        percentiles = [50, 75, 90, 95, 99]
        for p in percentiles:
            if sorted_times:
                idx = int(len(sorted_times) * p / 100)
                idx = min(idx, len(sorted_times) - 1)
                result["percentiles"][f"p{p}"] = sorted_times[idx]
        
        # Сетевые метрики
        if self.response_sizes:
            result["response_size_bytes"] = {
                "mean": statistics.mean(self.response_sizes),
                "median": statistics.median(self.response_sizes),
            }
            if self.uncompressed_sizes:
                avg_uncompressed = statistics.mean(self.uncompressed_sizes)
                avg_compressed = statistics.mean(self.response_sizes)
                compression_ratio = (1 - avg_compressed / avg_uncompressed) * 100 if avg_uncompressed > 0 else 0
                result["response_size_bytes"]["uncompressed_mean"] = avg_uncompressed
                result["response_size_bytes"]["compression_ratio"] = compression_ratio
        
        if self.compression_types:
            result["compression_types"] = dict(self.compression_types)
        
        return result


async def make_request(
    client: httpx.AsyncClient,
    url: str,
    stats: LoadTestStats,
    token: str = None,
    request_num: int = 0
) -> None:
    """Выполняет один запрос и записывает статистику"""
    headers = {
        "Accept-Encoding": "gzip, deflate, br"  # Поддержка сжатия
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    # Добавляем уникальные параметры для каждого запроса чтобы избежать кеширования
    separator = "&" if "?" in url else "?"
    unique_url = f"{url}{separator}_t={int(time.time() * 1000) + request_num}&_r={request_num}"
    
    start = time.time()
    try:
        response = await client.get(unique_url, headers=headers, timeout=30.0)
        elapsed = time.time() - start
        
        # Измеряем метрики сетевых оптимизаций
        # httpx автоматически декомпрессирует ответ, поэтому response.content - это декомпрессированные данные
        uncompressed_size = len(response.content) if response.content else 0
        
        # Определяем тип сжатия из заголовков
        content_encoding = response.headers.get("Content-Encoding", "").lower()
        compression_type = None
        if "gzip" in content_encoding:
            compression_type = "gzip"
        elif "br" in content_encoding or "brotli" in content_encoding:
            compression_type = "brotli"
        elif "deflate" in content_encoding:
            compression_type = "deflate"
        
        # Размер сжатого ответа берем из заголовка Content-Length
        # Content-Length содержит размер сжатых данных, если применяется сжатие
        content_length = response.headers.get("Content-Length")
        if content_length:
            # Content-Length всегда указывает размер данных в байтах (сжатых или нет)
            response_size = int(content_length)
        else:
            # Если Content-Length не указан, используем размер декомпрессированного контента
            # (в этом случае сжатие скорее всего не применялось или размер неизвестен)
            response_size = uncompressed_size
        
        # Время передачи данных (примерная оценка)
        # Это время между началом запроса и получением первого байта ответа
        # Для более точного измерения нужен доступ к httpx internals
        transfer_time = elapsed  # Используем общее время как приближение
        
        stats.add_response(
            elapsed, 
            response.status_code,
            response_size=response_size,
            uncompressed_size=uncompressed_size if uncompressed_size > 0 else response_size,
            compression_type=compression_type,
            transfer_time=transfer_time
        )
    except httpx.TimeoutException:
        elapsed = time.time() - start
        stats.add_response(elapsed, 0, "Timeout")
    except Exception as e:
        elapsed = time.time() - start
        stats.add_response(elapsed, 0, str(e))


async def run_load_test(
    base_url: str,
    concurrent: int = 10,
    total_requests: int = 100,
    token: str = None,
    endpoint: str = "/api/puzzles/random"
) -> LoadTestStats:
    """Запускает нагрузочный тест"""
    stats = LoadTestStats()
    url = f"{base_url}{endpoint}"
    
    # Добавляем параметры для предотвращения кеширования
    url += f"?_t={int(time.time() * 1000)}&_r=test"
    
    print(f"Запуск нагрузочного теста:")
    print(f"  URL: {url}")
    print(f"  Конкурентных запросов: {concurrent}")
    print(f"  Всего запросов: {total_requests}")
    print(f"  Авторизация: {'Да' if token else 'Нет'}")
    print()
    
    stats.start_time = time.time()
    
    # Используем keep-alive соединения как в браузере
    async with httpx.AsyncClient(
        limits=httpx.Limits(max_keepalive_connections=concurrent, max_connections=concurrent * 2),
        timeout=httpx.Timeout(30.0, connect=10.0)
    ) as client:
        # Прогреваем кеш несколькими запросами перед основным тестом
        print("Прогревание кеша...")
        warmup_url = url.replace("_r=test", "_r=warmup")
        for i in range(min(10, concurrent)):
            try:
                await client.get(f"{warmup_url}&_t={int(time.time() * 1000) + i}", timeout=30.0)
            except:
                pass
        await asyncio.sleep(0.5)  # Даем время кешу обновиться
        print("Кеш прогрет, начинаем тест...\n")
        
        # Создаем семафор для ограничения конкурентности
        semaphore = asyncio.Semaphore(concurrent)
        request_counter = 0
        
        async def bounded_request():
            nonlocal request_counter
            async with semaphore:
                request_counter += 1
                await make_request(client, url, stats, token, request_counter)
        
        # Запускаем все запросы
        tasks = [bounded_request() for _ in range(total_requests)]
        await asyncio.gather(*tasks)
    
    stats.end_time = time.time()
    return stats


async def run_sustained_test(
    base_url: str,
    concurrent: int = 10,
    duration: int = 60,
    token: str = None,
    endpoint: str = "/api/puzzles/random"
) -> LoadTestStats:
    """Запускает тест с постоянной нагрузкой в течение указанного времени"""
    stats = LoadTestStats()
    url = f"{base_url}{endpoint}"
    
    print(f"Запуск теста с постоянной нагрузкой:")
    print(f"  URL: {url}")
    print(f"  Конкурентных запросов: {concurrent}")
    print(f"  Длительность: {duration} сек")
    print(f"  Авторизация: {'Да' if token else 'Нет'}")
    print()
    
    stats.start_time = time.time()
    end_time = stats.start_time + duration
    request_counter = 0
    
    async def worker(worker_id: int):
        """Воркер, который делает запросы пока не истечет время"""
        nonlocal request_counter
        async with httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=1, max_connections=2),
            timeout=httpx.Timeout(30.0, connect=10.0)
        ) as client:
            while time.time() < end_time:
                request_counter += 1
                await make_request(client, url, stats, token, request_counter)
                # Небольшая задержка между запросами одного воркера
                await asyncio.sleep(0.1)
    
    # Прогреваем кеш перед тестом
    print("Прогревание кеша...")
    async with httpx.AsyncClient() as warmup_client:
        for i in range(min(10, concurrent)):
            try:
                await warmup_client.get(f"{url}?_t={int(time.time() * 1000) + i}&_r=warmup", timeout=30.0)
            except:
                pass
    await asyncio.sleep(0.5)
    print("Кеш прогрет, начинаем тест...\n")
    
    # Запускаем воркеры
    workers = [worker(i) for i in range(concurrent)]
    await asyncio.gather(*workers)
    
    stats.end_time = time.time()
    return stats


def compare_results(before_file: Path, after_file: Path):
    """Сравнивает результаты двух тестов"""
    with open(before_file) as f:
        before = json.load(f)
    with open(after_file) as f:
        after = json.load(f)
    
    print("\n" + "="*60)
    print("СРАВНЕНИЕ РЕЗУЛЬТАТОВ")
    print("="*60)
    
    # Время ответа
    print("\n--- Время ответа (мс) ---")
    before_mean = before["response_times_ms"]["mean"]
    after_mean = after["response_times_ms"]["mean"]
    improvement = ((before_mean - after_mean) / before_mean * 100) if before_mean > 0 else 0
    print(f"  Среднее: {before_mean:.2f} мс → {after_mean:.2f} мс ({improvement:+.1f}%)")
    
    before_p99 = before["percentiles"].get("p99", 0)
    after_p99 = after["percentiles"].get("p99", 0)
    improvement_p99 = ((before_p99 - after_p99) / before_p99 * 100) if before_p99 > 0 else 0
    print(f"  99-й процентиль: {before_p99:.2f} мс → {after_p99:.2f} мс ({improvement_p99:+.1f}%)")
    
    # Пропускная способность
    print("\n--- Пропускная способность ---")
    before_tp = before["throughput"]
    after_tp = after["throughput"]
    improvement_tp = ((after_tp - before_tp) / before_tp * 100) if before_tp > 0 else 0
    print(f"  {before_tp:.2f} req/sec → {after_tp:.2f} req/sec ({improvement_tp:+.1f}%)")
    
    # Размер ответа
    if "response_size_bytes" in before and "response_size_bytes" in after:
        print("\n--- Размер ответа ---")
        before_size = before["response_size_bytes"]["mean"]
        after_size = after["response_size_bytes"]["mean"]
        improvement_size = ((before_size - after_size) / before_size * 100) if before_size > 0 else 0
        print(f"  Средний размер: {before_size:.0f} байт → {after_size:.0f} байт ({improvement_size:+.1f}%)")
        
        if "compression_ratio" in after["response_size_bytes"]:
            print(f"  Коэффициент сжатия: {after['response_size_bytes']['compression_ratio']:.1f}%")
    
    print("="*60 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Нагрузочное тестирование /api/puzzles/random")
    parser.add_argument("--url", default="http://localhost:8080", help="Базовый URL сервера")
    parser.add_argument("--endpoint", default="/api/puzzles/random", help="Endpoint для тестирования")
    parser.add_argument("--concurrent", type=int, default=10, help="Количество конкурентных запросов")
    parser.add_argument("--requests", type=int, default=100, help="Общее количество запросов (для режима --requests)")
    parser.add_argument("--duration", type=int, default=60, help="Длительность теста в секундах (для режима --duration)")
    parser.add_argument("--token", help="JWT токен для авторизации (опционально)")
    parser.add_argument("--mode", choices=["requests", "duration"], default="requests", 
                       help="Режим тестирования: requests (фиксированное количество) или duration (по времени)")
    parser.add_argument("--save", help="Сохранить результаты в JSON файл")
    parser.add_argument("--compare", nargs=2, metavar=("BEFORE", "AFTER"), 
                       help="Сравнить результаты двух тестов (пути к JSON файлам)")
    
    args = parser.parse_args()
    
    # Режим сравнения
    if args.compare:
        compare_results(Path(args.compare[0]), Path(args.compare[1]))
        return
    
    # Запуск теста
    if args.mode == "requests":
        stats = asyncio.run(run_load_test(
            args.url,
            concurrent=args.concurrent,
            total_requests=args.requests,
            token=args.token,
            endpoint=args.endpoint
        ))
    else:
        stats = asyncio.run(run_sustained_test(
            args.url,
            concurrent=args.concurrent,
            duration=args.duration,
            token=args.token,
            endpoint=args.endpoint
        ))
    
    stats.print_stats()
    
    # Сохранение результатов
    if args.save:
        results = stats.to_dict()
        with open(args.save, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"Результаты сохранены в {args.save}")


if __name__ == "__main__":
    main()

