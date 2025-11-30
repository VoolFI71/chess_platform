from __future__ import annotations

import csv
import logging
from pathlib import Path
from typing import Any, Callable

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import Puzzle
from ..schemas import PuzzleImportResult

logger = logging.getLogger(__name__)


async def upsert_puzzles(session: AsyncSession, rows: list[dict[str, Any]]) -> dict[str, int]:
	if not rows:
		return {"imported": 0, "updated": 0, "skipped": 0, "total": 0}

	puzzle_ids = [row["puzzle_id"] for row in rows]
	existing = await session.execute(
		select(Puzzle.puzzle_id).where(Puzzle.puzzle_id.in_(puzzle_ids))
	)
	existing_ids = set(existing.scalars().all())

	stmt = insert(Puzzle).values(rows)
	update_columns = {
		"fen": stmt.excluded.fen,
		"moves": stmt.excluded.moves,
		"move_count": stmt.excluded.move_count,
		"rating": stmt.excluded.rating,
		"rating_deviation": stmt.excluded.rating_deviation,
		"popularity": stmt.excluded.popularity,
		"nb_plays": stmt.excluded.nb_plays,
		"themes": stmt.excluded.themes,
		"opening_tags": stmt.excluded.opening_tags,
		"game_url": stmt.excluded.game_url,
		"source": stmt.excluded.source,
		"updated_at": func.now(),
	}
	# solved_count обновляем только если оно передано в запросе
	if any("solved_count" in row for row in rows):
		update_columns["solved_count"] = stmt.excluded.solved_count

	stmt = stmt.on_conflict_do_update(
		index_elements=[Puzzle.puzzle_id],
		set_=update_columns,
	)
	await session.execute(stmt)
	await session.commit()

	return {
		"imported": len(rows) - len(existing_ids),
		"updated": len(existing_ids),
		"skipped": 0,
		"total": len(rows),
	}


class PuzzleCsvImporter:
	def __init__(
		self,
		session: AsyncSession,
		*,
		chunk_size: int | None = None,
		progress_callback: Callable[[int, int, dict[str, int]], None] | None = None,
	) -> None:
		self.session = session
		self.settings = get_settings()
		self.chunk_size = chunk_size or self.settings.import_chunk_size
		self.progress_callback = progress_callback

	async def import_file(self, file_path: str, *, limit: int | None = None) -> PuzzleImportResult:
		path = Path(file_path)
		if not path.exists():
			raise HTTPException(status_code=400, detail=f"CSV файл {file_path} не найден")

		# Подсчитываем общее количество строк для прогресса (опционально, для больших файлов может быть медленно)
		total_lines = limit if limit else 0
		if not limit:
			# Для больших файлов пропускаем точный подсчет, будем показывать только текущий прогресс
			try:
				# Пытаемся быстро оценить размер файла
				file_size_mb = path.stat().st_size / (1024 * 1024)
				if file_size_mb < 100:  # Только для файлов меньше 100MB считаем строки
					with path.open("r", encoding="utf-8") as f:
						total_lines = sum(1 for _ in f) - 1  # -1 для заголовка
					logger.info(f"Начинаем импорт из {file_path}. Всего {total_lines} строк для обработки.")
				else:
					logger.info(f"Начинаем импорт из {file_path}. Размер файла: {file_size_mb:.1f} MB. Прогресс будет отображаться по количеству обработанных строк.")
			except Exception:
				logger.info(f"Начинаем импорт из {file_path}. Прогресс будет отображаться по количеству обработанных строк.")
		else:
			logger.info(f"Начинаем импорт из {file_path}. Будет обработано до {total_lines} строк.")

		stats = {"total": 0, "imported": 0, "updated": 0, "skipped": 0}
		buffer: list[dict[str, Any]] = []
		chunk_count = 0
		last_logged_chunk = 0

		with path.open("r", encoding="utf-8") as csv_file:
			reader = csv.DictReader(csv_file)
			for row in reader:
				stats["total"] += 1
				if limit and stats["total"] > limit:
					break
				parsed = self._parse_row(row)
				if not parsed:
					stats["skipped"] += 1
					continue
				buffer.append(parsed)
				if len(buffer) >= self.chunk_size:
					chunk_count += 1
					chunk_stats = await self._flush(buffer)
					for key, value in chunk_stats.items():
						stats[key] += value
					buffer = []
					
					# Логируем прогресс каждые 10 чанков или каждые 5% (если известен total_lines)
					should_log = False
					if total_lines > 0:
						progress_pct = (stats["total"] * 100) // total_lines
						should_log = (
							chunk_count - last_logged_chunk >= 10
							or progress_pct % 5 == 0
						)
					else:
						# Если total_lines неизвестен, логируем каждые 10 чанков
						should_log = chunk_count - last_logged_chunk >= 10
					
					if should_log:
						if total_lines > 0:
							progress_pct = (stats["total"] * 100) // total_lines
							logger.info(
								f"Прогресс импорта: {stats['total']}/{total_lines} строк "
								f"({progress_pct}%) | Импортировано: {stats['imported']}, "
								f"Обновлено: {stats['updated']}, Пропущено: {stats['skipped']}"
							)
						else:
							logger.info(
								f"Прогресс импорта: обработано {stats['total']} строк | "
								f"Импортировано: {stats['imported']}, "
								f"Обновлено: {stats['updated']}, Пропущено: {stats['skipped']}"
							)
						last_logged_chunk = chunk_count
						
						# Вызываем callback если есть
						if self.progress_callback:
							self.progress_callback(stats["total"], total_lines, stats)

		if buffer:
			chunk_count += 1
			chunk_stats = await self._flush(buffer)
			for key, value in chunk_stats.items():
				stats[key] += value

		logger.info(
			f"Импорт завершен: обработано {stats['total']} строк, "
			f"импортировано {stats['imported']}, обновлено {stats['updated']}, "
			f"пропущено {stats['skipped']}"
		)

		return PuzzleImportResult(
			total_rows=stats["total"],
			imported=stats["imported"],
			updated=stats["updated"],
			skipped=stats["skipped"],
		)

	def _parse_row(self, row: dict[str, str]) -> dict[str, Any] | None:
		puzzle_id = row.get("PuzzleId")
		fen = row.get("FEN")
		moves_raw = row.get("Moves")
		if not puzzle_id or not fen or not moves_raw:
			return None

		moves = [move.strip() for move in moves_raw.split() if move.strip()]
		if not moves:
			return None

		themes = self._split_column(row.get("Themes", ""))
		opening_tags = self._split_column(row.get("OpeningTags", ""))

		return {
			"puzzle_id": puzzle_id,
			"fen": fen,
			"moves": moves,
			"move_count": len(moves),
			"rating": int(row.get("Rating", "0") or 0),
			"rating_deviation": int(row.get("RatingDeviation", "0") or 0),
			"popularity": int(row.get("Popularity", "0") or 0),
			"nb_plays": int(row.get("NbPlays", "0") or 0),
			"themes": themes,
			"opening_tags": opening_tags,
			"game_url": row.get("GameUrl") or None,
			"source": "lichess_csv",
		}

	def _split_column(self, value: str | None) -> list[str]:
		if not value:
			return []
		if "," in value:
			parts = value.split(",")
		else:
			parts = value.split()
		return [part.strip() for part in parts if part.strip()]

	async def _flush(self, rows: list[dict[str, Any]]) -> dict[str, int]:
		return await upsert_puzzles(self.session, rows)

