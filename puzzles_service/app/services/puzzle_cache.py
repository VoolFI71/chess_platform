from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import SessionLocal
from ..models import Puzzle
from ..schemas import PuzzleFilters

logger = logging.getLogger(__name__)


class PuzzleCache:
	"""Сервис для кэширования случайных задач. Задачи возвращаются ТОЛЬКО из кеша."""

	_cache: dict[str, list[Puzzle]] = {}
	_cache_timestamps: dict[str, datetime] = {}
	_refresh_lock = asyncio.Lock()  # Блокировка только для обновления кеша
	_refresh_tasks: dict[str, asyncio.Task] = {}  # Фоновые задачи обновления

	def __init__(self):
		self.settings = get_settings()
		self._cache_ttl = timedelta(hours=1)  # TTL кеша 1 час (увеличено для уменьшения частоты обновлений)

	@classmethod
	def _get_cache(cls, key: str) -> list[Puzzle] | None:
		return cls._cache.get(key)

	@classmethod
	def _set_cache(cls, key: str, items: list[Puzzle]) -> None:
		cls._cache[key] = items
		cls._cache_timestamps[key] = datetime.now(timezone.utc)

	@classmethod
	def _should_refresh(cls, key: str, ttl: timedelta) -> bool:
		# ОПТИМИЗАЦИЯ: Убрали избыточную проверку cls._cache.get(key)
		# Если key not in cls._cache, мы уже вернули True выше
		if key not in cls._cache:
			return True
		timestamp = cls._cache_timestamps.get(key)
		if not timestamp:
			return True
		age = datetime.now(timezone.utc) - timestamp
		return age > ttl

	async def get_random_puzzle(
		self,
		filters: PuzzleFilters | None = None,
	) -> Puzzle | None:
		"""
		Получает случайную задачу ТОЛЬКО из кеша.
		
		Если кеш пуст:
		- Запускает обновление кеша и ждет его завершения
		- Возвращает задачу из обновленного кеша
		
		Если кеш устарел:
		- Запускает обновление в фоне (stale-while-revalidate)
		- Возвращает задачу из старого кеша
		
		Args:
			filters: Фильтры для задач
			
		Returns:
			Puzzle или None, если кеш пуст и обновление не удалось
		"""
		cache_key = self._build_cache_key(filters)

		# Читаем из кеша без блокировки (чтение из dict атомарно в CPython)
		cached = self._get_cache(cache_key)
		
		# ОПТИМИЗАЦИЯ: Проверяем should_refresh только если кеш есть
		# Это уменьшает количество вызовов datetime.now() при пустом кеше
		if cached and len(cached) > 0:
			if not self._should_refresh(cache_key, self._cache_ttl):
				# Кеш свежий - возвращаем задачу сразу (быстрый путь)
			return random.choice(cached)
			# Кеш устарел - обработаем ниже (stale-while-revalidate)
			should_refresh = True
		else:
			# Кеш пуст
			should_refresh = True

		# Если кеш пуст - запускаем обновление и ждем его завершения
		if not cached or len(cached) == 0:
			# Используем блокировку, чтобы только один запрос запускал обновление
			async with self._refresh_lock:
				# Двойная проверка: возможно, кеш уже обновили пока ждали блокировку
				cached = self._get_cache(cache_key)
				if cached and len(cached) > 0:
					return random.choice(cached)
				
				# Проверяем, не запущено ли уже обновление
				refresh_task = self._refresh_tasks.get(cache_key)
				
				if refresh_task and not refresh_task.done():
					# Обновление уже запущено другим запросом - сохраняем задачу и выходим из блокировки
					# Задача будет ждаться ниже
					pass
				else:
					# Запускаем обновление синхронно и сохраняем задачу
					async def refresh_and_save():
						async with SessionLocal() as session:
							try:
								await self._refresh_cache(session, cache_key, filters)
							except Exception as e:
								logger.error(f"Error refreshing empty cache: {e}")
								raise
					
					refresh_task = asyncio.create_task(refresh_and_save())
					self._refresh_tasks[cache_key] = refresh_task
			
			# Ждем завершения обновления (либо запущенного нами, либо другим запросом)
			refresh_task = self._refresh_tasks.get(cache_key)
			if refresh_task and not refresh_task.done():
				try:
					await refresh_task
				except Exception as e:
					logger.error(f"Error waiting for cache refresh: {e}")
					# Если обновление не удалось, возвращаем None
					return None
			
			# Проверяем кеш после обновления
			cached = self._get_cache(cache_key)
			if cached and len(cached) > 0:
				return random.choice(cached)
			
			# Если после обновления кеш все еще пуст - возвращаем None
			return None

		# Если кеш устарел (но не пуст) - используем stale-while-revalidate
		if should_refresh:
			# Запускаем обновление в фоне, если еще не запущено
			if cache_key not in self._refresh_tasks or self._refresh_tasks[cache_key].done():
				self._refresh_tasks[cache_key] = asyncio.create_task(
					self._refresh_cache_async(cache_key, filters)
				)
			
			# Возвращаем задачу из старого кеша
			if cached and len(cached) > 0:
				return random.choice(cached)

		# Fallback - возвращаем None
		return None

	async def _refresh_cache_async(
		self,
		cache_key: str,
		filters: PuzzleFilters | None = None,
	) -> None:
		"""Асинхронно обновляет кэш в фоне, не блокируя читателей."""
		# Используем блокировку только для предотвращения одновременных обновлений одного ключа
		async with self._refresh_lock:
			# Двойная проверка: возможно, кеш уже обновили
			if not self._should_refresh(cache_key, self._cache_ttl):
				return
			
			# Создаем новую сессию для фоновой задачи
			async with SessionLocal() as session:
				try:
					await self._refresh_cache(session, cache_key, filters)
				except Exception as e:
					logger.error(f"Error refreshing cache for key '{cache_key}': {e}", exc_info=True)

	async def _refresh_cache(
		self,
		session: AsyncSession,
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
			result = await session.execute(query)
			items = list(result.scalars().all())
		except Exception as e:  # pragma: no cover - fallback
			logger.warning("TABLESAMPLE failed during cache refresh: %s", e)

		# Если TABLESAMPLE не дал результата – fallback с random primary key
		if not items:
			min_max_stmt = select(func.min(Puzzle.id), func.max(Puzzle.id)).select_from(Puzzle)
			if conditions:
				min_max_stmt = min_max_stmt.where(*conditions)
			min_max_result = await session.execute(min_max_stmt)
			min_id, max_id = min_max_result.one()
			if min_id is None or max_id is None:
				# Не кешируем пустой результат - нет задач с такими фильтрами
				# Следующий запрос попробует снова, возможно данные появятся
				logger.warning(f"No puzzles found for filters: {filters}")
				return None

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
				result = await session.execute(query)
				batch = [row for row in result.scalars().all() if row.id not in seen_ids]
				if not batch:
					query = select(Puzzle)
					if conditions:
						query = query.where(*conditions)
					query = query.order_by(Puzzle.id).limit(batch_size)
					result = await session.execute(query)
					batch = [row for row in result.scalars().all() if row.id not in seen_ids]
				for row in batch:
					seen_ids.add(row.id)
				results.extend(batch)
				attempts += 1

			items = results[: self.settings.random_pool_size]

		# Атомарно обновляем кеш (запись в dict атомарна в CPython)
		# Не кешируем пустые результаты - если items пуст, не сохраняем в кеш
		if items and len(items) > 0:
			self._set_cache(cache_key, items)
			logger.info("Refreshed cache for key '%s' with %d puzzles", cache_key, len(items))
		else:
			# Если не нашли задачи - удаляем из кеша (если был)
			if cache_key in self._cache:
				del self._cache[cache_key]
				if cache_key in self._cache_timestamps:
					del self._cache_timestamps[cache_key]
			logger.warning("No puzzles found for cache key '%s', cache not updated", cache_key)

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


# Singleton экземпляр кеша
_puzzle_cache_instance: PuzzleCache | None = None


def get_puzzle_cache() -> PuzzleCache:
	"""Возвращает singleton экземпляр PuzzleCache."""
	global _puzzle_cache_instance
	if _puzzle_cache_instance is None:
		_puzzle_cache_instance = PuzzleCache()
	return _puzzle_cache_instance

