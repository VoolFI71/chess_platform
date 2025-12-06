from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class VerificationCode(Base):
	__tablename__ = "verification_codes"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
	code: Mapped[str] = mapped_column(String(6), nullable=False)  # 6-значный код
	purpose: Mapped[str] = mapped_column(String(50), nullable=False)  # 'password_reset', 'email_verification', etc.
	expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
	used: Mapped[bool] = mapped_column(default=False, nullable=False)
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), nullable=False
	)

	@classmethod
	def create_for_password_reset(cls, email: str, code: str, expires_in_minutes: int = 10) -> "VerificationCode":
		"""Создаёт код верификации для восстановления пароля."""
		now = datetime.now(timezone.utc)
		return cls(
			email=email.lower(),
			code=code,
			purpose="password_reset",
			expires_at=now + timedelta(minutes=expires_in_minutes),
			used=False,
		)

	@classmethod
	def create_for_registration(cls, email: str, code: str, expires_in_minutes: int = 10) -> "VerificationCode":
		"""Создаёт код верификации для регистрации."""
		now = datetime.now(timezone.utc)
		return cls(
			email=email.lower(),
			code=code,
			purpose="registration",
			expires_at=now + timedelta(minutes=expires_in_minutes),
			used=False,
		)

	def is_valid(self) -> bool:
		"""Проверяет, действителен ли код (не использован и не истёк)."""
		now = datetime.now(timezone.utc)
		return not self.used and self.expires_at > now

