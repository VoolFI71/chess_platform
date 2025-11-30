from typing import List

from pydantic import BaseModel, Field, field_validator


class PuzzleImportRequest(BaseModel):
	file_path: str | None = Field(
		default=None,
		description="Абсолютный или относительный путь до CSV (по умолчанию берется из настроек)",
	)
	limit: int | None = Field(default=None, gt=0)
	chunk_size: int | None = Field(default=None, gt=0, le=10000)


class PuzzleImportResult(BaseModel):
	total_rows: int
	imported: int
	skipped: int
	updated: int


class PuzzleUpsertRequest(BaseModel):
	puzzle_id: str = Field(..., min_length=1, max_length=16)
	fen: str = Field(..., min_length=1)
	moves: List[str] = Field(..., min_length=1)
	rating: int = Field(default=0, ge=0)
	rating_deviation: int = Field(default=0, ge=0)
	popularity: int = Field(default=0, ge=0)
	nb_plays: int = Field(default=0, ge=0)
	themes: List[str] = Field(default_factory=list)
	opening_tags: List[str] = Field(default_factory=list)
	game_url: str | None = None
	source: str | None = "manual"
	solved_count: int | None = Field(default=None, ge=0)

	@field_validator("moves")
	@classmethod
	def validate_moves_not_empty(cls, value: List[str]) -> List[str]:
		cleaned = [move.strip() for move in value if isinstance(move, str) and move.strip()]
		if not cleaned:
			raise ValueError("moves must contain at least one item")
		return cleaned

	@field_validator("themes", "opening_tags", mode="before")
	@classmethod
	def default_to_list(cls, value: List[str] | None) -> List[str]:
		if value is None:
			return []
		return [str(item).strip() for item in value if str(item).strip()]

