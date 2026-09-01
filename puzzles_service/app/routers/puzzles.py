from collections.abc import Sequence
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models import DailyPuzzle, DailyPuzzleSolution, Puzzle
from ..schemas import DailyPuzzleResponse, PuzzleCountResponse, PuzzleFilters, PuzzleResponse
from ..security import get_current_user_id_optional
from ..services.daily_puzzle import get_daily_puzzle_service
from ..services.puzzle_cache import get_puzzle_cache

puzzles_router = APIRouter(prefix="/puzzles", tags=["puzzles"])
settings = get_settings()


@puzzles_router.get("/random", response_model=PuzzleResponse, response_model_exclude_none=True)
async def get_random_puzzle(
	response: Response,
	rating_min: int | None = Query(default=None, ge=400),
	rating_max: int | None = Query(default=None, le=3500),
	themes: Sequence[str] | None = Query(default=None),
	opening_tags: Sequence[str] | None = Query(default=None),
) -> PuzzleResponse:
	filters = PuzzleFilters(
		rating_min=rating_min,
		rating_max=rating_max,
		themes=themes,
		opening_tags=opening_tags,
	)

	# Используем singleton кэш для получения случайной задачи
	# Задачи возвращаются ТОЛЬКО из кеша
	cache = get_puzzle_cache()
	puzzle = await cache.get_random_puzzle(filters)

	if not puzzle:
		# Просто возвращаем 404 без медленной проверки count
		raise HTTPException(
			status_code=404,
			detail="Задача не найдена. Попробуйте изменить фильтры."
		)
	
	# Оптимизация заголовков: минимизируем количество заголовков для снижения overhead
	# Кеширование происходит на уровне приложения (PuzzleCache), HTTP кеш не нужен
	response.headers["Cache-Control"] = "no-cache"
	
	# Оптимизация: response_model_exclude_none=True исключает None поля из JSON ответа
	# ORJSONResponse автоматически использует быструю сериализацию orjson
	return PuzzleResponse.model_validate(puzzle)


@puzzles_router.get("/count", response_model=PuzzleCountResponse)
async def get_puzzles_count(
	db: AsyncSession = Depends(get_db),
) -> PuzzleCountResponse:
	"""Возвращает общее количество задач в базе данных."""
	count_query = select(func.count()).select_from(Puzzle)
	total_count = await db.scalar(count_query) or 0
	return PuzzleCountResponse(count=total_count)


@puzzles_router.get("/daily", response_model=DailyPuzzleResponse, response_model_exclude_none=True)
async def get_daily_puzzle(
	db: AsyncSession = Depends(get_db),
	response: Response = Response(),
	current_user_id: int | None = Depends(get_current_user_id_optional),
) -> DailyPuzzleResponse:
	"""
	Получить задачу дня.
	
	Возвращает одну и ту же задачу для всех пользователей в течение текущих календарных суток.
	Задача выбирается случайным образом из диапазона рейтинга 2700-3000.
	Каждые 24 часа (по UTC) выбирается новая задача.
	
	Метрики: автоматически собираются через prometheus-fastapi-instrumentator.
	Логирование: события создания/загрузки задачи логируются на уровне INFO.
	"""
	import logging
	logger = logging.getLogger(__name__)
	
	# Получаем текущую дату в UTC
	today = datetime.now(timezone.utc).date()
	
	# Получаем или создаем задачу дня
	daily_service = get_daily_puzzle_service()
	puzzle = await daily_service.get_or_create_for_date(today, db)
	
	if not puzzle:
		logger.error("Failed to get or create daily puzzle for date %s", today)
		raise HTTPException(
			status_code=404,
			detail="Задача дня не найдена. Попробуйте позже.",
		)
	
	# Загружаем метаданные DailyPuzzle для получения chosen_at и rating
	stmt = select(DailyPuzzle).where(DailyPuzzle.date == today)
	result = await db.execute(stmt)
	daily_record = result.scalar_one_or_none()
	
	if not daily_record:
		# Это не должно произойти, но на всякий случай
		logger.error("Daily puzzle created but record not found for date %s", today)
		raise HTTPException(
			status_code=500,
			detail="Ошибка при загрузке метаданных задачи дня.",
		)
	
	# Количество решений и статус текущего пользователя берём одним запросом.
	summary_columns = [
		func.count().label("today_solved_count"),
	]
	if current_user_id is not None:
		summary_columns.insert(
			0,
			func.count(DailyPuzzleSolution.id)
			.filter(DailyPuzzleSolution.user_id == current_user_id)
			.label("user_solution_count"),
		)
	summary = (
		await db.execute(
			select(*summary_columns).where(DailyPuzzleSolution.date == today)
		)
	).one()
	is_solved = bool(summary.user_solution_count) if current_user_id is not None else False
	today_solved_count = int(summary.today_solved_count or 0)
	
	logger.info(
		"Daily puzzle served for date %s: puzzle_id=%s, rating=%d, solved_count=%d",
		today,
		daily_record.puzzle_id,
		daily_record.rating,
		today_solved_count,
	)
	
	# Формируем ответ с метаданными
	puzzle_response = PuzzleResponse.model_validate(puzzle)
	return DailyPuzzleResponse(
		**puzzle_response.model_dump(),
		date=daily_record.date,
		chosen_at=daily_record.chosen_at,
		daily_rating=daily_record.rating,
		is_solved=is_solved,
		today_solved_count=today_solved_count,
	)


@puzzles_router.get("/{puzzle_id}", response_model=PuzzleResponse)
async def get_puzzle_by_id(
	puzzle_id: str,
	db: AsyncSession = Depends(get_db),
) -> PuzzleResponse:
	result = await db.execute(select(Puzzle).where(Puzzle.puzzle_id == puzzle_id))
	puzzle = result.scalar_one_or_none()
	if not puzzle:
		raise HTTPException(status_code=404, detail="Пазл не найден")
	return PuzzleResponse.model_validate(puzzle)

