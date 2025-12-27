from __future__ import annotations

from datetime import date, datetime
from typing import Sequence

from pydantic import BaseModel, Field


class PuzzleResponse(BaseModel):
	puzzle_id: str
	fen: str
	moves: list[str]
	move_count: int
	rating: int
	rating_deviation: int
	popularity: int
	nb_plays: int
	solved_count: int
	themes: list[str]
	opening_tags: list[str]
	game_url: str | None = None

	class Config:
		from_attributes = True


class DailyPuzzleResponse(PuzzleResponse):
	"""Ответ для задачи дня с дополнительными метаданными."""
	date: date
	chosen_at: datetime
	daily_rating: int  # Рейтинг задачи дня (может отличаться от текущего рейтинга пазла)
	is_solved: bool = False  # Решена ли задача текущим пользователем
	today_solved_count: int = 0  # Сколько раз решена задача сегодня (все пользователи)


class PuzzleFilters(BaseModel):
	rating_min: int | None = Field(default=None, ge=400)
	rating_max: int | None = Field(default=None, le=3500)
	themes: Sequence[str] | None = None
	opening_tags: Sequence[str] | None = None


class PuzzleCountResponse(BaseModel):
	count: int

