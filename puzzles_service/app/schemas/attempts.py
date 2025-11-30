from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PuzzleAttemptCreate(BaseModel):
	puzzle_id: str
	mode: Literal["survival", "rated"] = Field(default="survival")
	success: bool = Field(..., description="Результат решения задачи")
	time_spent_ms: int | None = Field(default=None, ge=0)
	mistake_count: int | None = Field(default=None, ge=0)
	moves_played: list[str] | None = Field(default=None, description="Список ходов в формате UCI, которые сделал пользователь")


class PuzzleAttemptRead(BaseModel):
	id: int
	puzzle_id: str
	user_id: int
	mode: str
	status: str
	time_spent_ms: int | None = None
	mistake_count: int | None = None
	moves_played: int | None = None
	rating_before: int | None = None
	rating_after: int | None = None
	created_at: datetime

	class Config:
		from_attributes = True

