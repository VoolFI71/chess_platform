from datetime import datetime

from sqlalchemy import DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class PuzzleUserStats(Base):
	__tablename__ = "puzzle_user_stats"

	user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
	solved_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
	failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
	current_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
	best_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
	puzzle_rating: Mapped[int] = mapped_column(Integer, nullable=False, default=1200)
	provisional_games: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
	total_time_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
	last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
	last_puzzle_id: Mapped[str | None] = mapped_column(nullable=True)
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

	@property
	def total_attempts(self) -> int:
		return self.solved_count + self.failed_count

	@property
	def accuracy(self) -> float:
		attempts = self.total_attempts
		return (self.solved_count / attempts) if attempts else 0.0

	@property
	def average_time_ms(self) -> float | None:
		if self.solved_count == 0:
			return None
		return self.total_time_ms / self.solved_count

