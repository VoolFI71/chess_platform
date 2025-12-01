from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class RatingHistory(Base):
	__tablename__ = "rating_history"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	user_id: Mapped[int] = mapped_column(
		ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
	)
	format_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # blitz, rapid, bullet, puzzle
	rating_before: Mapped[int] = mapped_column(Integer, nullable=False)
	rating_after: Mapped[int] = mapped_column(Integer, nullable=False)
	rating_change: Mapped[int] = mapped_column(Integer, nullable=False)  # rating_after - rating_before
	game_id: Mapped[str | None] = mapped_column(Text, nullable=True)  # UUID игры или puzzle_id
	result: Mapped[str | None] = mapped_column(String(20), nullable=True)  # win, loss, draw
	opponent_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # ID соперника (для игр)
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
	)

	def __repr__(self) -> str:
		return f"<RatingHistory user={self.user_id} format={self.format_type} {self.rating_before}->{self.rating_after}>"

