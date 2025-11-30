from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import Select, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import Puzzle
from ..schemas import PuzzleFilters

logger = logging.getLogger(__name__)


class PuzzleCache:
	"""Сервис для кэширования случайных задач с использованием TABLESAMPLE"""

	def __init__(self, session: AsyncSession):
		self.session = session
		self.settings = get_settings()
		self._cache: dict[str, list[Puzzle]] = {}
		self._cache_timestamps: dict[str, datetime] = {}
		self._cache_lock = asyncio.Lock()
		self._cache_ttl = timedelta(minutes=5)  # Кэш обновляется каждые 5 минут

	async def get_random_puzzle(
		self,
		filters: PuzzleFilters | None = None,
	) -> Puzzle | None:
		"""
		Получает случайную задачу, используя кэш или TABLESAMPLE для производительности.

		Args:
			filters: Фильтры для поиска задачи

		Returns:
			Случайная задача или None если не найдена
		"""
		# Если есть фильтры, используем прямой запрос с TABLESAMPLE
		if filters and (filters.themes or filters.opening_tags):
			return await self._get_random_with_tablesample(filters)

		# Для простых фильтров по рейтингу используем кэш
		cache_key = self._build_cache_key(filters)
		async with self._cache_lock:
			if self._should_refresh_cache(cache_key):
				await self._refresh_cache(cache_key, filters)

			if cache_key in self._cache and self._cache[cache_key]:
				# Берем случайную задачу из кэша
				import random
				puzzle = random.choice(self._cache[cache_key])
				return puzzle

		# Если кэш пуст, используем TABLESAMPLE
		return await self._get_random_with_tablesample(filters)

	async def _get_random_with_tablesample(
		self,
		filters: PuzzleFilters | None = None,
	) -> Puzzle | None:
		"""
		Использует эффективный метод для быстрого получения случайной задачи.

		Для PostgreSQL использует TABLESAMPLE или выборку по случайному ID.
		Это намного быстрее чем ORDER BY random() на больших таблицах.
		"""
		# Метод 1: Если нет фильтров или только фильтры по рейтингу, используем выборку по случайному ID
		if not filters or (not filters.themes and not filters.opening_tags):
			# Получаем минимальный и максимальный ID (если есть индексы)
			# Или используем TABLESAMPLE для быстрой выборки
			try:
				# Используем TABLESAMPLE для PostgreSQL - это очень быстро
				# Берём 0.5% таблицы и выбираем случайную строку оттуда
				query = select(Puzzle).where(
					text("puzzles.id IN (SELECT id FROM puzzles TABLESAMPLE SYSTEM (0.5) LIMIT 100)")
				)
				
				if filters:
					conditions = self._build_filter_conditions(filters)
					if conditions:
						query = query.where(*conditions)
				
				# Выбираем случайную из выборки
				query = query.order_by(func.random()).limit(1)
				
				result = await self.session.execute(query)
				puzzle = result.scalar_one_or_none()
				
				if puzzle:
					return puzzle
			except Exception as e:
				logger.warning(f"TABLESAMPLE failed, falling back to simple random: {e}")
		
		# Метод 2: Fallback - используем выборку по случайному смещению (быстрее чем ORDER BY random())
		try:
			# Сначала получаем общее количество подходящих записей
			count_query = select(func.count()).select_from(Puzzle)
			if filters:
				conditions = self._build_filter_conditions(filters)
				if conditions:
					count_query = count_query.where(*conditions)
			
			total = await self.session.scalar(count_query) or 0
			
			if total == 0:
				return None
			
			# Выбираем случайное смещение
			import random
			offset = random.randint(0, max(0, total - 1))
			
			# Запрашиваем запись по смещению
			query = select(Puzzle)
			if filters:
				conditions = self._build_filter_conditions(filters)
				if conditions:
					query = query.where(*conditions)
			
			# Используем индексы для быстрого поиска
			query = query.order_by(Puzzle.puzzle_id).offset(offset).limit(1)
			
			result = await self.session.execute(query)
			return result.scalar_one_or_none()
		except Exception as e:
			logger.error(f"Random selection failed: {e}")
			# Последний fallback - простой ORDER BY random() (медленно, но работает)
			query = select(Puzzle).order_by(func.random()).limit(1)
			if filters:
				conditions = self._build_filter_conditions(filters)
				if conditions:
					query = query.where(*conditions)
			result = await self.session.execute(query)
			return result.scalar_one_or_none()

	def _build_cache_key(self, filters: PuzzleFilters | None) -> str:
		"""Создает ключ кэша на основе фильтров"""
		if not filters:
			return "all"
		parts = []
		if filters.rating_min is not None:
			parts.append(f"rmin_{filters.rating_min}")
		if filters.rating_max is not None:
			parts.append(f"rmax_{filters.rating_max}")
		return "_".join(parts) if parts else "all"

	def _build_filter_conditions(self, filters: PuzzleFilters) -> list[Any]:
		"""Строит условия фильтрации для SQL запроса"""
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

	def _should_refresh_cache(self, cache_key: str) -> bool:
		"""Проверяет, нужно ли обновить кэш"""
		if cache_key not in self._cache:
			return True
		if cache_key not in self._cache_timestamps:
			return True
		age = datetime.now(timezone.utc) - self._cache_timestamps[cache_key]
		return age > self._cache_ttl or not self._cache[cache_key]

	async def _refresh_cache(
		self,
		cache_key: str,
		filters: PuzzleFilters | None = None,
	) -> None:
		"""Обновляет кэш случайных задач используя эффективный метод"""
		try:
			# Используем TABLESAMPLE для быстрой выборки пула задач
			# Это намного быстрее чем ORDER BY random() на всей таблице
			try:
				# Метод 1: TABLESAMPLE - очень быстро для больших таблиц
				query = select(Puzzle).where(
					text(f"puzzles.id IN (SELECT id FROM puzzles TABLESAMPLE SYSTEM (1.0) LIMIT {self.settings.random_pool_size * 2})")
				)
				
				if filters:
					conditions = self._build_filter_conditions(filters)
					if conditions:
						query = query.where(*conditions)
				
				# Выбираем случайные из выборки
				query = query.order_by(func.random()).limit(self.settings.random_pool_size)
				
				result = await self.session.execute(query)
				puzzles = list(result.scalars().all())
				
				# Если получили достаточно задач, используем их
				if len(puzzles) >= self.settings.random_pool_size // 2:
					self._cache[cache_key] = puzzles
					self._cache_timestamps[cache_key] = datetime.now(timezone.utc)
					logger.info(f"Refreshed cache for key '{cache_key}' with {len(puzzles)} puzzles (TABLESAMPLE)")
					return
			except Exception as e:
				logger.warning(f"TABLESAMPLE failed for cache refresh: {e}, trying fallback method")
			
			# Метод 2: Fallback - выборка по случайным смещениям
			# Получаем общее количество
			count_query = select(func.count()).select_from(Puzzle)
			if filters:
				conditions = self._build_filter_conditions(filters)
				if conditions:
					count_query = count_query.where(*conditions)
			
			total = await self.session.scalar(count_query) or 0
			
			if total == 0:
				self._cache[cache_key] = []
				return
			
			# Выбираем несколько случайных смещений
			import random
			pool_size = min(self.settings.random_pool_size, total)
			offsets = sorted(random.sample(range(total), pool_size))
			
			# Загружаем задачи по смещениям
			query = select(Puzzle)
			if filters:
				conditions = self._build_filter_conditions(filters)
				if conditions:
					query = query.where(*conditions)
			
			query = query.order_by(Puzzle.puzzle_id).offset(offsets[0]).limit(pool_size)
			result = await self.session.execute(query)
			puzzles = list(result.scalars().all())
			
			# Перемешиваем для случайности
			random.shuffle(puzzles)
			
			self._cache[cache_key] = puzzles[:self.settings.random_pool_size]
			self._cache_timestamps[cache_key] = datetime.now(timezone.utc)
			
			logger.info(f"Refreshed cache for key '{cache_key}' with {len(self._cache[cache_key])} puzzles (offset method)")
		except Exception as e:
			logger.error(f"Failed to refresh cache for key '{cache_key}': {e}")
			# Оставляем старый кэш или создаем пустой
			if cache_key not in self._cache:
				self._cache[cache_key] = []

