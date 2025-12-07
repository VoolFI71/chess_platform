from datetime import datetime

from pydantic import BaseModel


class PuzzleStatsResponse(BaseModel):
	user_id: int
	solved_count: int
	failed_count: int
	current_streak: int
	best_streak: int
	puzzle_rating: int
	accuracy: float
	average_time_ms: float | None = None
	last_attempt_at: datetime | None = None
	last_puzzle_id: str | None = None

	class Config:
		from_attributes = True


class ThemeStats(BaseModel):
	theme: str
	solved: int
	failed: int
	total: int
	accuracy: float

	class Config:
		from_attributes = True


class PuzzleThemeStatsResponse(BaseModel):
	user_id: int
	themes: list[ThemeStats]

	class Config:
		from_attributes = True
