from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Notification(Base):
	__tablename__ = "notifications"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	user_id: Mapped[int] = mapped_column(
		ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
	)
	type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
	title: Mapped[str] = mapped_column(String(200), nullable=False)
	message: Mapped[str] = mapped_column(Text, nullable=False)
	read: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)
	# Дополнительные данные в JSON формате (опционально)
	data: Mapped[str | None] = mapped_column(Text, nullable=True)
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
	)

