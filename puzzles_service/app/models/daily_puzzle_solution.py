from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class DailyPuzzleSolution(Base):
	__tablename__ = "daily_puzzle_solutions"
	__table_args__ = (
		UniqueConstraint("user_id", "date", name="uq_daily_puzzle_solutions_user_date"),
	)

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
	date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
	solved_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True),
		server_default=func.now(),
		nullable=False,
	)

	def __repr__(self) -> str:
		return f"<DailyPuzzleSolution user_id={self.user_id} date={self.date}>"

