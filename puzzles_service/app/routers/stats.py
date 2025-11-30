from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import PuzzleUserStats
from ..schemas import PuzzleStatsResponse
from ..security import get_current_user_id

stats_router = APIRouter(prefix="/puzzles/stats", tags=["puzzle-stats"])


@stats_router.get("/me", response_model=PuzzleStatsResponse)
async def get_my_stats(
	db: AsyncSession = Depends(get_db),
	current_user_id: int = Depends(get_current_user_id),
) -> PuzzleStatsResponse:
	result = await db.execute(
		select(PuzzleUserStats).where(PuzzleUserStats.user_id == current_user_id)
	)
	stats = result.scalar_one_or_none()
	if not stats:
		return PuzzleStatsResponse(
			user_id=current_user_id,
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

	return PuzzleStatsResponse(
		user_id=current_user_id,
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

