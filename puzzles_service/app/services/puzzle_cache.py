from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import Puzzle
from ..schemas import PuzzleFilters

logger = logging.getLogger(__name__)


class PuzzleCache:
	"""Сервис для кэширования случайных задач с использованием TABLESAMPLE"""

	_cache: dict[str, list[Puzzle]] = {}
	_cache_timestamps: dict[str, datetime] = {}
	_cache_lock = asyncio.Lock()

	def __init__(self, session: AsyncSession):
		self.session = session
		self.settings = get_settings()
		self._cache_ttl = timedelta(minutes=5)

	@classmethod
	def _get_cache(cls, key: str) -> list[Puzzle] | None:
		return cls._cache.get(key)

	@classmethod
	def _set_cache(cls, key: str, items: list[Puzzle]) -> None:
		cls._cache[key] = items
		cls._cache_timestamps[key] = datetime.now(timezone.utc)

	@classmethod
	def _should_refresh(cls, key: str, ttl: timedelta) -> bool:
		if key not in cls._cache:
			return True
		timestamp = cls._cache_timestamps.get(key)
		if not timestamp:
			return True
		age = datetime.now(timezone.utc) - timestamp
		return age > ttl or not cls._cache.get(key)

	async def get_random_puzzle(
		self,
		filters: PuzzleFilters | None = None,
	) -> Puzzle | None:
		"""Получает случайную задачу, используя кэш или TABLESAMPLE."""
		cache_key = self._build_cache_key(filters)

		async with self._cache_lock:
			if self._should_refresh(cache_key, self._cache_ttl):
				await self._refresh_cache(cache_key, filters)

			cached = self._get_cache(cache_key)
			if cached:
				return random.choice(cached)

		# Кэш пуст или фильтры сложные – используем прямую выборку
		return await self._get_random_with_tablesample(filters)

	async def _get_random_with_tablesample(
		self,
		filters: PuzzleFilters | None = None,
	) -> Puzzle | None:
		"""Использует TABLESAMPLE/offset стратегии для выборки пазла."""
		conditions = self._build_filter_conditions(filters) if filters else []
		try:
			query = select(Puzzle).where(
				text(
					"puzzles.id IN ("
					"SELECT id FROM puzzles TABLESAMPLE SYSTEM (0.5) LIMIT 200"
					")"
				)
			)
			if conditions:
				query = query.where(*conditions)
			query = query.order_by(func.random()).limit(1)
			result = await self.session.execute(query)
			puzzle = result.scalar_one_or_none()
			if puzzle:
				return puzzle
		except Exception as e:  # pragma: no cover - fallback
			logger.warning("TABLESAMPLE failed, fallback to index-based random: %s", e)

		# Fallback: используем случайные значения первичного ключа
		min_max_stmt = select(func.min(Puzzle.id), func.max(Puzzle.id)).select_from(Puzzle)
		if conditions:
			min_max_stmt = min_max_stmt.where(*conditions)
		min_max_result = await self.session.execute(min_max_stmt)
		min_id, max_id = min_max_result.one()
		if min_id is None or max_id is None:
			return None

		for _ in range(10):
			candidate = random.randint(min_id, max_id)
			query = select(Puzzle)
			if conditions:
				query = query.where(*conditions)
			query = query.where(Puzzle.id >= candidate).order_by(Puzzle.id).limit(1)
			result = await self.session.execute(query)
			puzzle = result.scalar_one_or_none()
			if puzzle:
				return puzzle

		# Обход по кругу, если ничего не нашли
		query = select(Puzzle)
		if conditions:
			query = query.where(*conditions)
		query = query.order_by(Puzzle.id).limit(1)
		result = await self.session.execute(query)
		return result.scalar_one_or_none()

	async def _refresh_cache(
		self,
		cache_key: str,
		filters: PuzzleFilters | None = None,
	) -> None:
		"""Обновляет кэш случайных задач."""
		conditions = self._build_filter_conditions(filters) if filters else []
		items: list[Puzzle] | None = None

		# Пробуем TABLESAMPLE
		try:
			query = select(Puzzle).where(
				text(
					"puzzles.id IN ("
					f"SELECT id FROM puzzles TABLESAMPLE SYSTEM (1.0) LIMIT {self.settings.random_pool_size * 3}"
					")"
				)
			)
			if conditions:
				query = query.where(*conditions)
			query = query.order_by(func.random()).limit(self.settings.random_pool_size)
			result = await self.session.execute(query)
			items = list(result.scalars().all())
		except Exception as e:  # pragma: no cover - fallback
			logger.warning("TABLESAMPLE failed during cache refresh: %s", e)

		# Если TABLESAMPLE не дал результата – fallback с random primary key
		if not items:
			min_max_stmt = select(func.min(Puzzle.id), func.max(Puzzle.id)).select_from(Puzzle)
			if conditions:
				min_max_stmt = min_max_stmt.where(*conditions)
			min_max_result = await self.session.execute(min_max_stmt)
			min_id, max_id = min_max_result.one()
			if min_id is None or max_id is None:
				self._set_cache(cache_key, [])
				return

			results: list[Puzzle] = []
			seen_ids: set[int] = set()
			attempts = 0
			batch_size = min(32, self.settings.random_pool_size)

			while len(results) < self.settings.random_pool_size and attempts < 30:
				candidate = random.randint(min_id, max_id)
				query = select(Puzzle)
				if conditions:
					query = query.where(*conditions)
				query = query.where(Puzzle.id >= candidate).order_by(Puzzle.id).limit(batch_size)
				result = await self.session.execute(query)
				batch = [row for row in result.scalars().all() if row.id not in seen_ids]
				if not batch:
					query = select(Puzzle)
					if conditions:
						query = query.where(*conditions)
					query = query.order_by(Puzzle.id).limit(batch_size)
					result = await self.session.execute(query)
					batch = [row for row in result.scalars().all() if row.id not in seen_ids]
				for row in batch:
					seen_ids.add(row.id)
				results.extend(batch)
				attempts += 1

			items = results[: self.settings.random_pool_size]

		self._set_cache(cache_key, items or [])
		logger.info("Refreshed cache for key '%s' with %d puzzles", cache_key, len(items or []))

	def _build_cache_key(self, filters: PuzzleFilters | None) -> str:
		if not filters:
			return "all"
		parts = []
		if filters.rating_min is not None:
			parts.append(f"rmin_{filters.rating_min}")
		if filters.rating_max is not None:
			parts.append(f"rmax_{filters.rating_max}")
		if filters.themes:
			parts.append("themes_" + "-".join(sorted(filters.themes)))
		if filters.opening_tags:
			parts.append("openings_" + "-".join(sorted(filters.opening_tags)))
		return "|".join(parts) if parts else "all"

	def _build_filter_conditions(self, filters: PuzzleFilters) -> list[Any]:
		conditions = []
		if filters.rating_min is not None:
			conditions.append(Puzzle.rating >= filters.rating_min)
		if filters.rating_max is not None:
			conditions.append(Puzzle.rating <= filters.rating_max)
		if filters.themes:
			conditions.append(Puzzle.themes.contains(filters.themes))
		if filters.opening_tags:
			conditions.append(Puzzle.opening_tags.contains(filters.opening_tags))
		return conditions

