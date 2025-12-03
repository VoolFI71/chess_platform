import asyncio

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db, sync_engine
from ..models import Puzzle, PuzzleAttempt, PuzzleUserStats
from ..schemas import PuzzleStatsResponse
from ..security import get_current_user_id

stats_router = APIRouter(prefix="/puzzles/stats", tags=["puzzle-stats"])


async def _get_stats_by_user_id(user_id: int, db: AsyncSession) -> PuzzleStatsResponse:
	"""Вспомогательная функция для получения статистики по user_id"""
	result = await db.execute(
		select(PuzzleUserStats).where(PuzzleUserStats.user_id == user_id)
	)
	stats = result.scalar_one_or_none()
	if not stats:
		return PuzzleStatsResponse(
			user_id=user_id,
			solved_count=0,
			failed_count=0,
			current_streak=0,
			best_streak=0,
			puzzle_rating=1200,
			accuracy=0.0,
			average_time_ms=None,
			last_attempt_at=None,
			last_puzzle_id=None,
		)

	# Синхронизируем рейтинг с таблицей users (для существующих пользователей)
	# Используем raw SQL, чтобы не создавать зависимость от users_service
	# Используем отдельную транзакцию для синхронизации
	try:
		def sync_rating():
			with sync_engine.begin() as conn:
				conn.execute(
					text("UPDATE users SET puzzle_rating = :rating WHERE id = :user_id AND puzzle_rating != :rating"),
					{"rating": stats.puzzle_rating, "user_id": user_id}
				)
		# Выполняем синхронизацию в отдельном потоке, чтобы не блокировать async код
		await asyncio.to_thread(sync_rating)
	except Exception:
		# Игнорируем ошибки синхронизации (например, если таблица users не существует)
		pass

	return PuzzleStatsResponse(
		user_id=user_id,
		solved_count=stats.solved_count,
		failed_count=stats.failed_count,
		current_streak=stats.current_streak,
		best_streak=stats.best_streak,
		puzzle_rating=stats.puzzle_rating,
		accuracy=stats.accuracy,
		average_time_ms=stats.average_time_ms,
		last_attempt_at=stats.last_attempt_at,
		last_puzzle_id=stats.last_puzzle_id,
	)


@stats_router.get("/me", response_model=PuzzleStatsResponse)
async def get_my_stats(
	db: AsyncSession = Depends(get_db),
	current_user_id: int = Depends(get_current_user_id),
) -> PuzzleStatsResponse:
	"""Получить статистику текущего пользователя"""
	return await _get_stats_by_user_id(current_user_id, db)


@stats_router.get("/aggregate")
async def get_aggregate_stats(
	db: AsyncSession = Depends(get_db),
) -> dict:
	"""Получить общую статистику по всем задачам (публичный endpoint)"""
	# Общее количество решений - считаем из таблицы PuzzleAttempt (более надежно)
	# так как это источник истины для всех попыток решения
	total_solutions_result = await db.execute(
		select(func.count()).select_from(PuzzleAttempt).where(PuzzleAttempt.status == "success")
	)
	total_solutions = total_solutions_result.scalar()
	if total_solutions is None:
		total_solutions = 0
	
	# Альтернативный подсчет из PuzzleUserStats (для совместимости)
	# Используем как fallback, если нужно
	total_solutions_from_stats_result = await db.execute(
		select(func.coalesce(func.sum(PuzzleUserStats.solved_count), 0))
	)
	total_solutions_from_stats = total_solutions_from_stats_result.scalar()
	if total_solutions_from_stats is None:
		total_solutions_from_stats = 0
	
	# Используем больший из двух значений (на случай рассинхронизации)
	total_solutions = max(int(total_solutions), int(total_solutions_from_stats))
	
	# Общее количество задач в базе
	total_puzzles_result = await db.execute(
		select(func.count()).select_from(Puzzle)
	)
	total_puzzles = total_puzzles_result.scalar()
	if total_puzzles is None:
		total_puzzles = 0
	
	return {
		"total_solutions": total_solutions,
		"total_puzzles": int(total_puzzles),
	}


@stats_router.get("/{user_id}", response_model=PuzzleStatsResponse)
async def get_user_stats(
	user_id: int,
	db: AsyncSession = Depends(get_db),
) -> PuzzleStatsResponse:
	"""Получить статистику пользователя по user_id (публичный endpoint)"""
	if user_id <= 0:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Invalid user_id"
		)
	return await _get_stats_by_user_id(user_id, db)

