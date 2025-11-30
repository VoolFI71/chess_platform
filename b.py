#!/usr/bin/env python3
"""
upload_puzzles.py — многопоточный аплоадер задач в /api/puzzles/internal/puzzle

Перед запуском:
    pip install requests python-dotenv

CSV ожидается в формате официального lichess (PuzzleId,FEN,Moves,...).
"""

import argparse
import csv
import os
import sys
import threading
import time
from pathlib import Path
from queue import Queue
from typing import Optional

import requests
from dotenv import load_dotenv

DEFAULT_BASE_URL = "https://power-chess.ru"
API_PATH = "/api/puzzles/internal/puzzle"
DEFAULT_WORKERS = 16
DEFAULT_SLEEP = 0.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload puzzles to power-chess.ru")
    parser.add_argument("csv_path", type=Path, help="Путь к CSV файлу (формат lichess_db_puzzle.csv)")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"Базовый URL (по умолчанию {DEFAULT_BASE_URL})")
    parser.add_argument(
        "--token",
        default=None,
        help="Значение X-Internal-Token (можно задать через переменную окружения PUZZLES_INTERNAL_TOKEN)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Импортировать только первые N задач",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Только показать, что бы отправили, без реальных запросов",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=DEFAULT_SLEEP,
        help="Пауза (сек) между запросами в одном потоке (по умолчанию 0)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=DEFAULT_WORKERS,
        help=f"Количество параллельных потоков (по умолчанию {DEFAULT_WORKERS})",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=3,
        help="Количество повторов при ошибке запроса (по умолчанию 3)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="Таймаут HTTP-запроса в секундах (по умолчанию 15)",
    )
    parser.add_argument(
        "--log-every",
        type=int,
        default=1000,
        help="Печатать прогресс каждые N успешных задач (по умолчанию 1000)",
    )
    return parser.parse_args()


def row_to_payload(row: dict[str, str]) -> dict:
    moves = [move.strip() for move in row.get("Moves", "").split() if move.strip()]
    return {
        "puzzle_id": row.get("PuzzleId", "").strip(),
        "fen": row.get("FEN", "").strip(),
        "moves": moves,
        "rating": int(row.get("Rating", 0) or 0),
        "rating_deviation": int(row.get("RatingDeviation", 0) or 0),
        "popularity": int(row.get("Popularity", 0) or 0),
        "nb_plays": int(row.get("NbPlays", 0) or 0),
        "themes": _split_tags(row.get("Themes")),
        "opening_tags": _split_tags(row.get("OpeningTags")),
        "game_url": row.get("GameUrl") or None,
        "source": "manual-upload",
    }


def _split_tags(value: Optional[str]) -> list[str]:
    if not value:
        return []
    parts = value.split(",") if "," in value else value.split()
    return [part.strip() for part in parts if part.strip()]


class Stats:
    def __init__(self, log_every: int) -> None:
        self.lock = threading.Lock()
        self.sent = 0
        self.imported = 0
        self.updated = 0
        self.errors = 0
        self.log_every = max(1, log_every)

    def success(self, imported: int, updated: int) -> None:
        with self.lock:
            self.sent += 1
            self.imported += imported
            self.updated += updated
            if self.sent % self.log_every == 0:
                print(
                    f"[INFO] processed={self.sent} imported={self.imported} "
                    f"updated={self.updated} errors={self.errors}"
                )

    def error(self, message: str) -> None:
        with self.lock:
            self.errors += 1
            print(f"[ERROR] {message}", file=sys.stderr)


def worker(
    worker_id: int,
    queue: Queue,
    base_url: str,
    token: str,
    stats: Stats,
    timeout: float,
    retries: int,
    sleep_between: float,
) -> None:
    session = requests.Session()
    session.headers.update({"X-Internal-Token": token, "Content-Type": "application/json"})
    url = base_url + API_PATH

    while True:
        item = queue.get()
        if item is None:
            queue.task_done()
            break

        idx, payload = item
        attempt = 0
        while attempt < max(1, retries):
            attempt += 1
            try:
                response = session.post(url, json=payload, timeout=timeout)
                if response.status_code not in (200, 201):
                    stats.error(
                        f"worker#{worker_id} line={idx} status={response.status_code} body={response.text}"
                    )
                else:
                    data = response.json()
                    stats.success(
                        data.get("imported", 0),
                        data.get("updated", 0),
                    )
                break
            except requests.RequestException as exc:
                if attempt >= retries:
                    stats.error(f"worker#{worker_id} line={idx} exception={exc}")
                else:
                    time.sleep(0.5 * attempt)

        if sleep_between:
            time.sleep(sleep_between)
        queue.task_done()


def main() -> None:
    load_dotenv()
    args = parse_args()

    if not args.csv_path.exists():
        print(f"CSV файл не найден: {args.csv_path}", file=sys.stderr)
        sys.exit(1)

    token = args.token or os.getenv("PUZZLES_INTERNAL_TOKEN")
    if not token:
        print(
            "Нужно указать X-Internal-Token (аргумент --token или переменная окружения PUZZLES_INTERNAL_TOKEN).",
            file=sys.stderr,
        )
        sys.exit(1)

    base_url = args.base_url.rstrip("/")
    print(f"Будем отправлять данные на {base_url + API_PATH}")

    if args.dry_run:
        with args.csv_path.open("r", encoding="utf-8") as csv_file:
            reader = csv.DictReader(csv_file)
            for idx, row in enumerate(reader, start=1):
                if args.limit and idx > args.limit:
                    break
                payload = row_to_payload(row)
                if not payload["puzzle_id"] or not payload["fen"] or not payload["moves"]:
                    print(f"[WARN] Строка {idx}: пропуск — неполные данные", file=sys.stderr)
                else:
                    print(f"[DRY-RUN] #{idx} -> {payload['puzzle_id']} ({payload['rating']})")
        return

    workers_count = max(1, args.workers)
    queue: Queue = Queue(maxsize=workers_count * 4)
    stats = Stats(args.log_every)

    threads: list[threading.Thread] = []
    for worker_id in range(workers_count):
        thread = threading.Thread(
            target=worker,
            args=(
                worker_id + 1,
                queue,
                base_url,
                token,
                stats,
                args.timeout,
                args.retries,
                args.sleep,
            ),
            daemon=True,
        )
        thread.start()
        threads.append(thread)

    with args.csv_path.open("r", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for idx, row in enumerate(reader, start=1):
            if args.limit and idx > args.limit:
                break
            payload = row_to_payload(row)
            if not payload["puzzle_id"] or not payload["fen"] or not payload["moves"]:
                stats.error(f"line={idx} пропуск — неполные данные")
                continue
            queue.put((idx, payload))

    for _ in threads:
        queue.put(None)

    queue.join()
    for thread in threads:
        thread.join()

    print(
        f"Завершено. processed={stats.sent} imported={stats.imported} "
        f"updated={stats.updated} errors={stats.errors}"
    )


if __name__ == "__main__":
    main()