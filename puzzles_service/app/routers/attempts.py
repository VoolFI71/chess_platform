from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Puzzle, PuzzleAttempt
from ..schemas import PuzzleAttemptCreate, PuzzleAttemptRead
from ..security import get_current_user_id
from ..services.stats import PuzzleStatsService
from ..services.validator import PuzzleValidator

attempts_router = APIRouter(prefix="/puzzles/attempts", tags=["puzzle-attempts"])


@attempts_router.post("/", response_model=PuzzleAttemptRead, status_code=201)
async def create_attempt(
	payload: PuzzleAttemptCreate,
	db: AsyncSession = Depends(get_db),
	current_user_id: int = Depends(get_current_user_id),
) -> PuzzleAttemptRead:
	result = await db.execute(select(Puzzle).where(Puzzle.puzzle_id == payload.puzzle_id))
	puzzle = result.scalar_one_or_none()
	if not puzzle:
		raise HTTPException(status_code=404, detail="Пазл не найден")

	# Валидация времени
	PuzzleValidator.validate_time(payload.time_spent_ms, payload.mode)

	# Валидация ходов - проверяем, что success соответствует реальным ходам
	actual_success = False
	if payload.moves_played:
		actual_success = PuzzleValidator.validate_moves(
			user_moves=payload.moves_played,
			puzzle_moves=puzzle.moves,
			initial_fen=puzzle.fen,
		)

	# Если пользователь указал success, но ходы неверные (или наоборот) - отклоняем
	if payload.success != actual_success:
		raise HTTPException(
			status_code=400,
			detail="Результат решения не соответствует предоставленным ходам",
		)

	# Если ходы не предоставлены, но success=True - отклоняем
	if payload.success and not payload.moves_played:
		raise HTTPException(
			status_code=400,
			detail="Для успешного решения необходимо предоставить ходы",
		)

	status = "success" if actual_success else "failed"
	moves_count = len(payload.moves_played) if payload.moves_played else None

	attempt = PuzzleAttempt(
		puzzle_id=puzzle.puzzle_id,
		user_id=current_user_id,
		mode=payload.mode,
		status=status,
		time_spent_ms=payload.time_spent_ms,
		mistake_count=payload.mistake_count,
		moves_played=moves_count,
	)
	db.add(attempt)
	await db.flush()

	stats = PuzzleStatsService(db)
	rating_before, rating_after = await stats.apply_attempt(
		user_id=current_user_id,
		puzzle_id=puzzle.puzzle_id,
		success=actual_success,
		mode=payload.mode,
		puzzle_rating=puzzle.rating,
		time_spent_ms=payload.time_spent_ms,
	)

	if payload.mode == "rated":
		attempt.rating_before = rating_before
		attempt.rating_after = rating_after

	# Увеличиваем счетчик решений задачи при успешной попытке
	if actual_success:
		puzzle.solved_count += 1

	await db.commit()
	await db.refresh(attempt)
	return PuzzleAttemptRead.model_validate(attempt)


@attempts_router.get("/me", response_model=list[PuzzleAttemptRead])
async def list_my_attempts(
	limit: int = Query(default=20, ge=1, le=100),
	offset: int = Query(default=0, ge=0),
	db: AsyncSession = Depends(get_db),
	current_user_id: int = Depends(get_current_user_id),
) -> list[PuzzleAttemptRead]:
	query = (
		select(PuzzleAttempt)
		.where(PuzzleAttempt.user_id == current_user_id)
		.order_by(PuzzleAttempt.created_at.desc())
		.offset(offset)
		.limit(limit)
	)
	result = await db.execute(query)
	return [PuzzleAttemptRead.model_validate(row) for row in result.scalars().all()]

