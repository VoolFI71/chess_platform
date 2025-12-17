import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db, sync_engine
from ..models import Puzzle, PuzzleAttempt, PuzzleUserStats
from ..schemas import PuzzleStatsResponse, PuzzleThemeStatsResponse, ThemeStats
from ..security import get_current_user_id

stats_router = APIRouter(prefix="/puzzles/stats", tags=["puzzle-stats"])

# Кеш для aggregate статистики (COUNT(*) запросы очень медленные)
_aggregate_cache: dict[str, Any] | None = None
_aggregate_cache_timestamp: datetime | None = None
_aggregate_cache_ttl = timedelta(minutes=5)  # Кеш на 5 минут


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

	# ОПТИМИЗАЦИЯ: Синхронизация рейтинга убрана из GET запросов
	# Синхронизация происходит только при изменениях рейтинга (POST /attempts/)
	# Это ускоряет GET /puzzles/stats/me с 145ms до ~5-10ms
	# Синхронизация рейтинга теперь выполняется в stats.apply_attempt() при POST запросах

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
	"""
	Получить общую статистику по всем задачам (публичный endpoint)
	
	Оптимизация: Кеширование на 5 минут, так как COUNT(*) запросы очень медленные
	(могут занимать 5-30 секунд на больших таблицах)
	"""
	global _aggregate_cache, _aggregate_cache_timestamp
	
	# Проверяем кеш
	now = datetime.now(timezone.utc)
	if (
		_aggregate_cache is not None
		and _aggregate_cache_timestamp is not None
		and (now - _aggregate_cache_timestamp) < _aggregate_cache_ttl
	):
		return _aggregate_cache
	
	# Кеш устарел или отсутствует - выполняем медленные COUNT(*) запросы
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
	
	# Сохраняем в кеш
	result = {
		"total_solutions": total_solutions,
		"total_puzzles": int(total_puzzles),
	}
	_aggregate_cache = result
	_aggregate_cache_timestamp = now
	
	return result


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


@stats_router.get("/{user_id}/themes", response_model=PuzzleThemeStatsResponse)
async def get_user_theme_stats(
	user_id: int,
	db: AsyncSession = Depends(get_db),
) -> PuzzleThemeStatsResponse:
	"""Получить статистику пользователя по темам задач"""
	if user_id <= 0:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Invalid user_id"
		)
	
	# Получаем все попытки пользователя
	attempts_query = select(
		PuzzleAttempt.puzzle_id,
		PuzzleAttempt.status
	).where(
		PuzzleAttempt.user_id == user_id
	)
	attempts_result = await db.execute(attempts_query)
	attempts = attempts_result.all()
	
	if not attempts:
		return PuzzleThemeStatsResponse(
			user_id=user_id,
			themes=[]
		)
	
	# Группируем попытки по puzzle_id и определяем, была ли задача решена
	# Задача считается решенной, если есть хотя бы одна успешная попытка
	puzzle_status_map: dict[str, bool] = {}
	for attempt in attempts:
		puzzle_id = attempt.puzzle_id
		if puzzle_id not in puzzle_status_map:
			puzzle_status_map[puzzle_id] = False
		# Если хотя бы одна попытка успешна, задача считается решенной
		if attempt.status == "success":
			puzzle_status_map[puzzle_id] = True
	
	# Получаем уникальные puzzle_id
	puzzle_ids = list(puzzle_status_map.keys())
	
	# Получаем темы для всех задач, которые пользователь пытался решить
	puzzles_query = select(
		Puzzle.puzzle_id,
		Puzzle.themes
	).where(
		Puzzle.puzzle_id.in_(puzzle_ids)
	)
	puzzles_result = await db.execute(puzzles_query)
	puzzles = puzzles_result.all()
	
	# Создаем словарь puzzle_id -> themes
	puzzle_themes_map = {puzzle.puzzle_id: puzzle.themes for puzzle in puzzles}
	
	# Подсчитываем статистику по темам
	theme_stats: dict[str, dict[str, int]] = {}
	
	for puzzle_id, themes in puzzle_themes_map.items():
		is_solved = puzzle_status_map.get(puzzle_id, False)
		
		for theme in themes:
			if theme not in theme_stats:
				theme_stats[theme] = {"solved": 0, "failed": 0}
			
			if is_solved:
				theme_stats[theme]["solved"] += 1
			else:
				theme_stats[theme]["failed"] += 1
	
	# Формируем список ThemeStats
	themes_list = []
	for theme, stats in theme_stats.items():
		total = stats["solved"] + stats["failed"]
		accuracy = (stats["solved"] / total * 100) if total > 0 else 0.0
		themes_list.append(ThemeStats(
			theme=theme,
			solved=stats["solved"],
			failed=stats["failed"],
			total=total,
			accuracy=round(accuracy, 1)
		))
	
	# Сортируем по количеству решенных задач (по убыванию)
	themes_list.sort(key=lambda x: x.solved, reverse=True)
	
	return PuzzleThemeStatsResponse(
		user_id=user_id,
		themes=themes_list
	)


@stats_router.get("/me/themes", response_model=PuzzleThemeStatsResponse)
async def get_my_theme_stats(
	db: AsyncSession = Depends(get_db),
	current_user_id: int = Depends(get_current_user_id),
) -> PuzzleThemeStatsResponse:
	"""Получить статистику текущего пользователя по темам"""
	return await get_user_theme_stats(current_user_id, db)

