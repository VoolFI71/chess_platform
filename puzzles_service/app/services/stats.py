from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import PuzzleUserStats


class PuzzleStatsService:
	def __init__(self, session: AsyncSession) -> None:
		self.session = session

	async def get_or_create(self, user_id: int) -> PuzzleUserStats:
		result = await self.session.execute(
			select(PuzzleUserStats).where(PuzzleUserStats.user_id == user_id)
		)
		stats = result.scalar_one_or_none()
		if stats is None:
			stats = PuzzleUserStats(user_id=user_id)
			self.session.add(stats)
			await self.session.flush()
		return stats

	async def apply_attempt(
		self,
		*,
		user_id: int,
		puzzle_id: str,
		success: bool,
		mode: str,
		puzzle_rating: int,
		time_spent_ms: int | None,
	) -> tuple[int | None, int | None]:
		stats = await self.get_or_create(user_id)

		if success:
			stats.solved_count += 1
		else:
			stats.failed_count += 1

		if mode == "survival":
			if success:
				stats.current_streak += 1
				stats.best_streak = max(stats.best_streak, stats.current_streak)
			else:
				stats.current_streak = 0

		rating_before: int | None = None
		rating_after: int | None = None
		if mode == "rated":
			rating_before = stats.puzzle_rating
			stats.provisional_games = min(stats.provisional_games + 1, 30)
			stats.puzzle_rating = self._calculate_new_rating(
				current_rating=stats.puzzle_rating,
				puzzle_rating=puzzle_rating,
				success=success,
				provisional_games=stats.provisional_games,
			)
			rating_after = stats.puzzle_rating

		if time_spent_ms:
			stats.total_time_ms += time_spent_ms

		stats.last_puzzle_id = puzzle_id
		stats.last_attempt_at = datetime.now(timezone.utc)

		return rating_before, rating_after

	def _calculate_new_rating(
		self,
		*,
		current_rating: int,
		puzzle_rating: int,
		success: bool,
		provisional_games: int,
	) -> int:
		k_factor = 32 if provisional_games < 20 else 16
		score = 1.0 if success else 0.0
		expected = 1 / (1 + 10 ** ((puzzle_rating - current_rating) / 400))
		new_rating = current_rating + k_factor * (score - expected)
		return max(400, round(new_rating))

