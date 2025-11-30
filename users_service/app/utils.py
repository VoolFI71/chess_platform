"""Общие утилиты для users_service"""

from .models import User
from .schemas import InternalUser, UserPublic


def build_user_public(user: User) -> UserPublic:
	"""Вспомогательная функция для построения UserPublic из модели User"""
	return UserPublic(
		id=user.id,
		username=user.username,
		display_name=user.username,
		blitz_rating=user.blitz_rating,
		bullet_rating=user.bullet_rating,
		rapid_rating=user.rapid_rating,
		puzzle_rating=user.puzzle_rating,
		games_played=user.games_played,
		created_at=user.created_at,
		updated_at=user.updated_at,
	)


def build_internal_user(user: User, include_secret: bool = False) -> InternalUser:
	"""Формирует InternalUser для внутренних вызовов auth_service."""
	return InternalUser(
		id=user.id,
		username=user.username,
		email=user.email,
		is_active=user.is_active,
		blitz_rating=user.blitz_rating,
		bullet_rating=user.bullet_rating,
		rapid_rating=user.rapid_rating,
		puzzle_rating=user.puzzle_rating,
		games_played=user.games_played,
		created_at=user.created_at,
		updated_at=user.updated_at,
		hashed_password=user.hashed_password if include_secret else None,
	)

