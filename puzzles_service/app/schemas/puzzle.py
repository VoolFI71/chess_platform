from __future__ import annotations

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


class PuzzleFilters(BaseModel):
	rating_min: int | None = Field(default=None, ge=400)
	rating_max: int | None = Field(default=None, le=3500)
	themes: Sequence[str] | None = None
	opening_tags: Sequence[str] | None = None


class PuzzleListResponse(BaseModel):
	items: list[PuzzleResponse]
	page: int
	size: int
	total: int


class PuzzleCountResponse(BaseModel):
	count: int

