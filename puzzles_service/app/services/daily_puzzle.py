from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import DailyPuzzle, Puzzle
from ..schemas import PuzzleFilters
from ..services.puzzle_cache import get_puzzle_cache

logger = logging.getLogger(__name__)


class DailyPuzzleService:
	"""Сервис для работы с ежедневными задачами."""

	def __init__(self):
		self.puzzle_cache = get_puzzle_cache()

	async def get_or_create_for_date(
		self,
		target_date: date,
		session: AsyncSession,
	) -> Puzzle | None:
		"""
		Получить или создать задачу дня для указанной даты.
		
		Использует atomic upsert для предотвращения race conditions:
		1. Пытается найти существующую запись
		2. Если не найдена - создает новую с использованием INSERT ... ON CONFLICT
		3. Возвращает связанный Puzzle объект
		
		Args:
			target_date: Дата для которой нужна задача дня
			session: Асинхронная сессия БД
			
		Returns:
			Puzzle объект или None, если не удалось найти/создать задачу
		"""
		# Сначала проверяем, есть ли уже запись для этой даты
		stmt = select(DailyPuzzle).where(DailyPuzzle.date == target_date)
		result = await session.execute(stmt)
		existing = result.scalar_one_or_none()
		
		if existing:
			# Запись существует - загружаем связанный Puzzle
			puzzle_stmt = select(Puzzle).where(Puzzle.puzzle_id == existing.puzzle_id)
			puzzle_result = await session.execute(puzzle_stmt)
			puzzle = puzzle_result.scalar_one_or_none()
			if puzzle:
				logger.info(
					"Found existing daily puzzle for date %s: puzzle_id=%s, rating=%d",
					target_date,
					existing.puzzle_id,
					existing.rating,
				)
				return puzzle
			else:
				logger.warning(
					"Daily puzzle record exists but puzzle not found: puzzle_id=%s",
					existing.puzzle_id,
				)
				# Если puzzle не найден, создаем новую запись ниже
		
		# Записи нет или puzzle не найден - создаем новую
		# Используем фильтр для диапазона рейтинга 2700-3000
		filters = PuzzleFilters(rating_min=2700, rating_max=3000)
		
		# Пытаемся получить случайную задачу из кеша
		# Делаем несколько попыток на случай, если кеш пуст
		puzzle = None
		max_attempts = 3
		for attempt in range(max_attempts):
			puzzle = await self.puzzle_cache.get_random_puzzle(filters)
			if puzzle:
				break
			logger.warning(
				"Failed to get puzzle from cache (attempt %d/%d), retrying...",
				attempt + 1,
				max_attempts,
			)
		
		if not puzzle:
			logger.error(
				"Failed to get puzzle from cache after %d attempts for date %s",
				max_attempts,
				target_date,
			)
			return None
		
		# Создаем запись DailyPuzzle с использованием INSERT ... ON CONFLICT
		# Это предотвращает race conditions при параллельных запросах
		daily_puzzle = DailyPuzzle(
			puzzle_id=puzzle.puzzle_id,
			date=target_date,
			rating=puzzle.rating,
			chosen_at=datetime.now(timezone.utc),
		)
		
		try:
			session.add(daily_puzzle)
			await session.flush()  # Flush для проверки constraint без commit
			logger.info(
				"Created new daily puzzle for date %s: puzzle_id=%s, rating=%d",
				target_date,
				puzzle.puzzle_id,
				puzzle.rating,
			)
		except IntegrityError:
			# Конфликт - значит другой запрос уже создал запись
			# Откатываем flush и загружаем существующую запись
			await session.rollback()
			logger.info(
				"Race condition detected for date %s, loading existing record",
				target_date,
			)
			
			# Загружаем существующую запись
			stmt = select(DailyPuzzle).where(DailyPuzzle.date == target_date)
			result = await session.execute(stmt)
			existing = result.scalar_one_or_none()
			
			if existing:
				puzzle_stmt = select(Puzzle).where(Puzzle.puzzle_id == existing.puzzle_id)
				puzzle_result = await session.execute(puzzle_stmt)
				puzzle = puzzle_result.scalar_one_or_none()
				if puzzle:
					logger.info(
						"Loaded existing daily puzzle after race condition: puzzle_id=%s",
						existing.puzzle_id,
					)
					return puzzle
		
		# Commit транзакции
		await session.commit()
		return puzzle


# Singleton экземпляр сервиса
_daily_puzzle_service_instance: DailyPuzzleService | None = None


def get_daily_puzzle_service() -> DailyPuzzleService:
	"""Получить singleton экземпляр DailyPuzzleService."""
	global _daily_puzzle_service_instance
	if _daily_puzzle_service_instance is None:
		_daily_puzzle_service_instance = DailyPuzzleService()
	return _daily_puzzle_service_instance

