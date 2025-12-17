from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models import Puzzle
from ..schemas import PuzzleCountResponse, PuzzleFilters, PuzzleResponse
from ..services.puzzle_cache import get_puzzle_cache

puzzles_router = APIRouter(prefix="/puzzles", tags=["puzzles"])
settings = get_settings()


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

