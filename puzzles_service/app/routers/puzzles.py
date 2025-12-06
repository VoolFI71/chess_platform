from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models import Puzzle
from ..schemas import PuzzleCountResponse, PuzzleFilters, PuzzleListResponse, PuzzleResponse
from ..services.puzzle_cache import get_puzzle_cache

puzzles_router = APIRouter(prefix="/puzzles", tags=["puzzles"])
settings = get_settings()


def _build_filters(filters: PuzzleFilters | None) -> list:
	if not filters:
		return []
	conditions: list = []
	if filters.rating_min is not None:
		conditions.append(Puzzle.rating >= filters.rating_min)
	if filters.rating_max is not None:
		conditions.append(Puzzle.rating <= filters.rating_max)
	if filters.themes:
		conditions.append(Puzzle.themes.contains(filters.themes))
	if filters.opening_tags:
		conditions.append(Puzzle.opening_tags.contains(filters.opening_tags))
	return conditions


def _apply_filters(query: Select, filters: PuzzleFilters | None) -> Select:
	conditions = _build_filters(filters)
	if conditions:
		query = query.where(*conditions)
	return query


@puzzles_router.get("/random", response_model=PuzzleResponse, response_model_exclude_none=True)
async def get_random_puzzle(
	rating_min: int | None = Query(default=None, ge=400),
	rating_max: int | None = Query(default=None, le=3500),
	themes: Sequence[str] | None = Query(default=None),
	opening_tags: Sequence[str] | None = Query(default=None),
	db: AsyncSession = Depends(get_db),
	response: Response = Response(),
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


@puzzles_router.get("/", response_model=PuzzleListResponse)
async def list_puzzles(
	page: int = Query(default=1, ge=1),
	size: int = Query(default=None, ge=1, le=settings.max_page_size),
	rating_min: int | None = Query(default=None, ge=400),
	rating_max: int | None = Query(default=None, le=3500),
	themes: Sequence[str] | None = Query(default=None),
	opening_tags: Sequence[str] | None = Query(default=None),
	db: AsyncSession = Depends(get_db),
) -> PuzzleListResponse:
	limit = size or settings.default_page_size
	limit = min(limit, settings.max_page_size)
	offset = (page - 1) * limit

	filters = PuzzleFilters(
		rating_min=rating_min,
		rating_max=rating_max,
		themes=themes,
		opening_tags=opening_tags,
	)

	conditions = _build_filters(filters)
	base_query = select(Puzzle).order_by(Puzzle.rating.asc(), Puzzle.puzzle_id.asc())
	if conditions:
		base_query = base_query.where(*conditions)

	count_query = select(func.count()).select_from(Puzzle)
	if conditions:
		count_query = count_query.where(*conditions)

	total = await db.scalar(count_query)
	result = await db.execute(base_query.offset(offset).limit(limit))
	items = [PuzzleResponse.model_validate(row) for row in result.scalars().all()]

	return PuzzleListResponse(items=items, page=page, size=limit, total=total or 0)


@puzzles_router.get("/count", response_model=PuzzleCountResponse)
async def get_puzzles_count(
	db: AsyncSession = Depends(get_db),
) -> PuzzleCountResponse:
	"""Возвращает общее количество задач в базе данных."""
	count_query = select(func.count()).select_from(Puzzle)
	total_count = await db.scalar(count_query) or 0
	return PuzzleCountResponse(count=total_count)


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

