from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class PuzzleAttempt(Base):
	__tablename__ = "puzzle_attempts"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	puzzle_id: Mapped[str] = mapped_column(
		String(16),
		ForeignKey("puzzles.puzzle_id", ondelete="CASCADE"),
		nullable=False,
		index=True,
	)
	user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
	mode: Mapped[str] = mapped_column(String(20), nullable=False, default="survival")
	status: Mapped[str] = mapped_column(String(32), nullable=False)
	time_spent_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
	mistake_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
	moves_played: Mapped[int | None] = mapped_column(Integer, nullable=True)
	rating_before: Mapped[int | None] = mapped_column(Integer, nullable=True)
	rating_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
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
		return f"<PuzzleAttempt user={self.user_id} puzzle={self.puzzle_id} status={self.status}>"

