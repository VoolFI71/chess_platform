from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Puzzle(Base):
	__tablename__ = "puzzles"
	__table_args__ = (
		# Композитный индекс для оптимизации ORDER BY rating, puzzle_id
		# Критичен для производительности GET /puzzles/
		Index("ix_puzzles_rating_puzzle_id", "rating", "puzzle_id"),
	)

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	puzzle_id: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)
	fen: Mapped[str] = mapped_column(Text, nullable=False)
	moves: Mapped[list[str]] = mapped_column(ARRAY(String(8)), nullable=False)
	move_count: Mapped[int] = mapped_column(Integer, nullable=False)
	rating: Mapped[int] = mapped_column(Integer, nullable=False)
	rating_deviation: Mapped[int] = mapped_column(Integer, nullable=False)
	popularity: Mapped[int] = mapped_column(Integer, nullable=False)
	nb_plays: Mapped[int] = mapped_column(Integer, nullable=False)
	solved_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
	themes: Mapped[list[str]] = mapped_column(
		ARRAY(String(64)),
		nullable=False,
		server_default="{}",
	)
	opening_tags: Mapped[list[str]] = mapped_column(
		ARRAY(String(64)),
		nullable=False,
		server_default="{}",
	)
	game_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
	source: Mapped[str | None] = mapped_column(String(64), nullable=True)
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True),
		server_default=func.now(),
		nullable=False,
	)
	updated_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True),
		server_default=func.now(),
		onupdate=func.now(),
		nullable=False,
	)

	def __repr__(self) -> str:
		return f"<Puzzle {self.puzzle_id} ({self.rating})>"

