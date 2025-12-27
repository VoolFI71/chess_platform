from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class DailyPuzzle(Base):
	__tablename__ = "daily_puzzles"
	__table_args__ = (
		UniqueConstraint("date", name="uq_daily_puzzles_date"),
	)

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	puzzle_id: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
	date: Mapped[date] = mapped_column(Date, unique=True, nullable=False, index=True)
	rating: Mapped[int] = mapped_column(Integer, nullable=False)
	chosen_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True),
		server_default=func.now(),
		nullable=False,
	)

	def __repr__(self) -> str:
		return f"<DailyPuzzle date={self.date} puzzle_id={self.puzzle_id} rating={self.rating}>"

