from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models import User
from ..schemas import UserPublic, UserGameStats
from ..security import get_current_user_id


router = APIRouter(prefix="/api/users", tags=["users"])


def _build_user_public(user: User) -> UserPublic:
	"""Вспомогательная функция для построения UserPublic"""
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


@router.get("/me", response_model=UserPublic)
async def get_current_user_profile(
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> UserPublic:
	"""Получить профиль текущего пользователя"""
	user = await db.get(User, current_user_id)
	if not user or not user.is_active:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
	return _build_user_public(user)


@router.get("/{identifier}", response_model=UserPublic)
async def get_user(
	identifier: str,
	db: AsyncSession = Depends(get_db),
) -> UserPublic:
	"""Получить пользователя по ID (число) или username (case-insensitive)"""
	# Пытаемся определить, это ID или username
	if identifier.isdigit():
		# Это ID
		user = await db.get(User, int(identifier))
	else:
		# Это username (case-insensitive)
		stmt = select(User).where(
			func.lower(User.username) == func.lower(identifier),
			User.is_active == True
		)
		result = await db.execute(stmt)
		user = result.scalar_one_or_none()
	
	if not user or not user.is_active:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
	
	return _build_user_public(user)


def _get_games_client() -> tuple[str, dict[str, str]]:
	"""Получает настройки для HTTP клиента games_service."""
	settings = get_settings()
	if not settings.games_service_url or not settings.games_internal_token:
		raise HTTPException(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			detail="Сервис игр недоступен"
		)
	base_url = settings.games_service_url.rstrip("/")
	headers = {"X-Internal-Token": settings.games_internal_token}
	return base_url, headers


async def _get_user_stats_by_id(user_id: int, db: AsyncSession) -> UserGameStats:
	"""Вспомогательная функция для получения статистики пользователя по ID.
	
	Использует HTTP вызов к games_service вместо прямого доступа к таблице games.
	"""
	base_url, headers = _get_games_client()
	url = f"{base_url}/internal/stats/{user_id}"
	
	try:
		async with httpx.AsyncClient(timeout=10.0) as client:
			response = await client.get(url, headers=headers)
			response.raise_for_status()
			return UserGameStats.model_validate(response.json())
	except httpx.HTTPStatusError as exc:
		if exc.response.status_code == 404:
			raise HTTPException(
				status_code=status.HTTP_404_NOT_FOUND,
				detail="Пользователь не найден"
			)
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail=f"Ошибка при получении статистики из games_service: {exc.response.status_code}"
		)
	except httpx.RequestError as exc:
		raise HTTPException(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			detail=f"Сервис игр недоступен: {exc}"
		)


@router.get("/me/stats", response_model=UserGameStats)
async def get_my_stats(
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> UserGameStats:
	"""Получить статистику текущего пользователя"""
	return await _get_user_stats_by_id(current_user_id, db)


@router.get("/{identifier}/stats", response_model=UserGameStats)
async def get_user_stats(
	identifier: str,
	db: AsyncSession = Depends(get_db),
) -> UserGameStats:
	"""Получить статистику пользователя по ID или username (case-insensitive)"""
	# Определяем user_id
	if identifier.isdigit():
		user_id = int(identifier)
	else:
		# Это username (case-insensitive)
		stmt = select(User.id).where(
			func.lower(User.username) == func.lower(identifier),
			User.is_active == True
		)
		result = await db.execute(stmt)
		user_row = result.first()
		if not user_row:
			raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
		user_id = user_row[0]
	
	return await _get_user_stats_by_id(user_id, db)
