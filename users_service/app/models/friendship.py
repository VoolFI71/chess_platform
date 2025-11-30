from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Friendship(Base):
	__tablename__ = "friendships"
	__table_args__ = (
		UniqueConstraint("requester_id", "addressee_id", name="uq_friendships_pair"),
		CheckConstraint("requester_id != addressee_id", name="ck_friendships_not_self"),
	)

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	requester_id: Mapped[int] = mapped_column(
		ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
	)
	addressee_id: Mapped[int] = mapped_column(
		ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
	)
	status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), nullable=False
	)
	updated_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
	)

