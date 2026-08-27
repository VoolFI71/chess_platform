from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class School(Base):
	"""Онлайн-школа (tenant) на платформе."""

	__tablename__ = "schools"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	name: Mapped[str] = mapped_column(String(255), nullable=False)
	slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
	# subdomain: school1.platform.ru (опционально, для брендинга)
	subdomain: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), nullable=False
	)
	updated_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
	)

	users = relationship("User", back_populates="school")
