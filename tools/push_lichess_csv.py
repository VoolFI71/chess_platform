#!/usr/bin/env python3
"""
Читает CSV Lichess Puzzle Database локально и отправляет задачи на сервер по HTTP
(JSON, пакетами). Файл на сервер не загружается.

Требуется Python 3.10+ (stdlib only).

Пример:
  set PUZZLES_INTERNAL_TOKEN=...
  python tools/push_lichess_csv.py --base-url https://chessmint.ru lichess_db_puzzle.csv

  # тест на 100 строк
  python tools/push_lichess_csv.py --base-url http://localhost:8080 --limit 100 lichess_db_puzzle.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


def normalize_token(raw: str) -> str:
	"""Strip + убрать BOM; HTTP-заголовки только Latin-1."""
	s = (raw or "").strip()
	if s.startswith("\ufeff"):
		s = s[1:].strip()
	return s


def split_column(value: str | None) -> list[str]:
	if not value:
		return []
	if "," in value:
		parts = value.split(",")
	else:
		parts = value.split()
	return [p.strip() for p in parts if p.strip()]


def parse_csv_row(row: dict[str, str]) -> dict[str, Any] | None:
	"""Логика как в puzzles_service.app.services.importer.PuzzleCsvImporter._parse_row."""
	puzzle_id = row.get("PuzzleId")
	fen = row.get("FEN")
	moves_raw = row.get("Moves")
	if not puzzle_id or not fen or not moves_raw:
		return None
	moves = [m.strip() for m in moves_raw.split() if m.strip()]
	if not moves:
		return None
	return {
		"puzzle_id": puzzle_id,
		"fen": fen,
		"moves": moves,
		"rating": int(row.get("Rating", "0") or 0),
		"rating_deviation": int(row.get("RatingDeviation", "0") or 0),
		"popularity": int(row.get("Popularity", "0") or 0),
		"nb_plays": int(row.get("NbPlays", "0") or 0),
		"themes": split_column(row.get("Themes", "")),
		"opening_tags": split_column(row.get("OpeningTags", "")),
		"game_url": row.get("GameUrl") or None,
		"source": "lichess_csv",
	}


def post_batch(url: str, token: str, puzzles: list[dict[str, Any]]) -> dict[str, Any]:
	body = json.dumps({"puzzles": puzzles}).encode("utf-8")
	req = urllib.request.Request(
		url,
		data=body,
		method="POST",
		headers={
			"Content-Type": "application/json",
			"X-Internal-Token": token,
		},
	)
	with urllib.request.urlopen(req, timeout=600) as resp:
		return json.loads(resp.read().decode("utf-8"))


def main() -> int:
	parser = argparse.ArgumentParser(description="Push Lichess CSV puzzles to API (local read, JSON batches).")
	parser.add_argument("csv_file", help="Path to lichess_db_puzzle.csv")
	parser.add_argument(
		"--base-url",
		default=os.environ.get("PUZZLES_API_BASE_URL", "http://localhost:8080"),
		help="Gateway base URL without trailing slash (default: env PUZZLES_API_BASE_URL or localhost:8080)",
	)
	parser.add_argument(
		"--token",
		default=os.environ.get("PUZZLES_INTERNAL_TOKEN", ""),
		help="Internal token (default: env PUZZLES_INTERNAL_TOKEN)",
	)
	parser.add_argument("--batch-size", type=int, default=500, help="Puzzles per request (max 2000)")
	parser.add_argument("--limit", type=int, default=None, help="Max rows from CSV (after header)")
	parser.add_argument("--dry-run", action="store_true", help="Parse only, do not POST")
	args = parser.parse_args()
	token = normalize_token(args.token)

	if args.batch_size < 1 or args.batch_size > 2000:
		print("batch-size must be 1..2000", file=sys.stderr)
		return 2
	if not token and not args.dry_run:
		print("Set PUZZLES_INTERNAL_TOKEN or pass --token", file=sys.stderr)
		return 2
	if token and not token.isascii():
		print(
			"PUZZLES_INTERNAL_TOKEN must contain only ASCII (letters, digits, -_...). "
			"Remove Cyrillic, spaces, or «smart» quotes from .env — copy the same value as on the server.",
			file=sys.stderr,
		)
		return 2

	base = args.base_url.rstrip("/")
	url = f"{base}/api/puzzles/internal/import/batch"

	batch: list[dict[str, Any]] = []
	total_read = 0
	total_skipped = 0
	agg = {"imported": 0, "updated": 0, "skipped": 0, "total_rows": 0}

	with open(args.csv_file, newline="", encoding="utf-8") as f:
		reader = csv.DictReader(f)
		for row in reader:
			if args.limit is not None and total_read >= args.limit:
				break
			total_read += 1
			parsed = parse_csv_row(row)
			if not parsed:
				total_skipped += 1
				continue
			batch.append(parsed)
			if len(batch) >= args.batch_size:
				if args.dry_run:
					agg["total_rows"] += len(batch)
					batch = []
					continue
				try:
					out = post_batch(url, token, batch)
				except urllib.error.HTTPError as e:
					err_body = e.read().decode("utf-8", errors="replace")
					print(f"HTTP {e.code}: {err_body}", file=sys.stderr)
					return 1
				agg["imported"] += out.get("imported", 0)
				agg["updated"] += out.get("updated", 0)
				agg["skipped"] += out.get("skipped", 0)
				agg["total_rows"] += out.get("total_rows", len(batch))
				print(f"Batch OK: +{out.get('imported', 0)} new, {out.get('updated', 0)} updated")
				batch = []

		if batch:
			if args.dry_run:
				agg["total_rows"] += len(batch)
			else:
				try:
					out = post_batch(url, token, batch)
				except urllib.error.HTTPError as e:
					err_body = e.read().decode("utf-8", errors="replace")
					print(f"HTTP {e.code}: {err_body}", file=sys.stderr)
					return 1
				agg["imported"] += out.get("imported", 0)
				agg["updated"] += out.get("updated", 0)
				agg["skipped"] += out.get("skipped", 0)
				agg["total_rows"] += out.get("total_rows", len(batch))
				print(f"Batch OK: +{out.get('imported', 0)} new, {out.get('updated', 0)} updated")

	if args.dry_run:
		print(f"Dry run: parsed rows read={total_read}, bad/skipped lines={total_skipped}, would send={agg['total_rows']}")
		return 0

	print(
		f"Done. API totals: imported={agg['imported']}, updated={agg['updated']}, "
		f"skipped={agg['skipped']}, total_rows={agg['total_rows']} (local parse skips: {total_skipped})"
	)
	return 0


if __name__ == "__main__":
	sys.exit(main())
