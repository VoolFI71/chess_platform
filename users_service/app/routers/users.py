import asyncio
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models import User
from ..schemas import UserPublic, UserGameStats
from ..security import get_current_user_id
from ..utils import build_user_public


router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserPublic)
async def get_current_user_profile(
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> UserPublic:
	"""Получить профиль текущего пользователя"""
	user = await db.get(User, current_user_id)
	if not user or not user.is_active:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
	return build_user_public(user)


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
	
	return build_user_public(user)


# Глобальный HTTP клиент для переиспользования
_games_client: httpx.AsyncClient | None = None
_games_client_lock = asyncio.Lock()


async def _get_games_client() -> httpx.AsyncClient:
	"""Получает или создает HTTP клиент для games_service с переиспользованием."""
	global _games_client

	if _games_client is None:
		settings = get_settings()
		base_url = (settings.games_service_url or "http://games:8000").rstrip("/")

		if not settings.games_internal_token:
			raise HTTPException(
				status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
				detail="Сервис игр недоступен"
			)

		async with _games_client_lock:
			if _games_client is None:
				timeout = httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=10.0)
				limits = httpx.Limits(max_connections=20, max_keepalive_connections=5)
				headers = {"X-Internal-Token": settings.games_internal_token}
				_games_client = httpx.AsyncClient(
					base_url=base_url,
					headers=headers,
					timeout=timeout,
					limits=limits,
				)

	return _games_client


async def close_games_client() -> None:
	global _games_client
	async with _games_client_lock:
		if _games_client is not None:
			await _games_client.aclose()
			_games_client = None


async def _get_user_stats_by_id(user_id: int, db: AsyncSession) -> UserGameStats:
	"""Вспомогательная функция для получения статистики пользователя по ID.
	
	Использует HTTP вызов к games_service вместо прямого доступа к таблице games.
	"""
	client = await _get_games_client()
	url = f"/internal/stats/{user_id}"
	
	try:
		response = await client.get(url)
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
