from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class UserRole:
	STUDENT = "student"
	COACH = "coach"
	SCHOOL_ADMIN = "school_admin"
	PLATFORM_ADMIN = "platform_admin"


class User(Base):
	__tablename__ = "users"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
	email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
	hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
	is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

	# Мультитенантность
	school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id", ondelete="SET NULL"), nullable=True, index=True)
	role: Mapped[str] = mapped_column(String(32), nullable=False, default=UserRole.STUDENT, index=True)

	# Рейтинги по форматам игры
	blitz_rating: Mapped[int] = mapped_column(Integer, default=1200, nullable=False)
	bullet_rating: Mapped[int] = mapped_column(Integer, default=1200, nullable=False)
	rapid_rating: Mapped[int] = mapped_column(Integer, default=1200, nullable=False)
	puzzle_rating: Mapped[int] = mapped_column(Integer, default=1200, nullable=False)
	
	# Статистика
	games_played: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
	
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), nullable=False
	)
	updated_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
	)

	school = relationship("School", back_populates="users")




