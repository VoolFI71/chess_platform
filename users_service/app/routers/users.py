from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from common import InternalServiceClient, ServiceClientNotConfigured

from ..config import get_settings
from ..database import get_db
from ..models import User
from ..schemas import UserPublic, UserGameStats
from ..security import get_current_user_id
from ..utils import build_user_public


router = APIRouter(prefix="/api/users", tags=["users"])


class UserSearchResponse(BaseModel):
	users: list[UserPublic]
	total: int


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


@router.get("/me/stats", response_model=UserGameStats)
async def get_my_stats(
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> UserGameStats:
	"""Получить статистику текущего пользователя"""
	return await _get_user_stats_by_id(current_user_id, db)


@router.get("/search", response_model=UserSearchResponse)
async def search_users(
	q: Annotated[str, Query(min_length=2, max_length=50, description="Поисковый запрос (username)")],
	limit: Annotated[int, Query(ge=1, le=50)] = 20,
	offset: Annotated[int, Query(ge=0)] = 0,
	db: AsyncSession = Depends(get_db),
) -> UserSearchResponse:
	"""Поиск пользователей по username (case-insensitive, частичное совпадение)"""
	search_term = q.strip().lower()
	if len(search_term) < 2:
		return UserSearchResponse(users=[], total=0)
	stmt = (
		select(User, func.count(User.id).over().label("total"))
		.where(
			func.lower(User.username).contains(search_term),
			User.is_active == True
		)
		.order_by(User.username)
		.limit(limit)
		.offset(offset)
	)
	result = await db.execute(stmt)
	rows = result.all()
	if not rows:
		return UserSearchResponse(users=[], total=0)
	total = rows[0].total if rows else 0
	users = [build_user_public(row.User) for row in rows]
	return UserSearchResponse(users=users, total=total)


@router.get("/stats/aggregate")
async def get_aggregate_stats(
	db: AsyncSession = Depends(get_db),
) -> dict:
	"""Получить общую статистику по всем пользователям (публичный endpoint)"""
	total_users_result = await db.execute(
		select(func.count(User.id)).where(User.is_active == True)
	)
	total_users = total_users_result.scalar() or 0
	return {"total_users": int(total_users)}


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


_games_client = InternalServiceClient(
	"Games service",
	lambda: (
		(get_settings().games_service_url or "http://games:8000"),
		get_settings().games_internal_token,
	),
)


async def _get_games_client() -> httpx.AsyncClient:
	"""Получает или создает HTTP клиент для games_service с переиспользованием."""
	try:
		return await _games_client.get()
	except ServiceClientNotConfigured as exc:
		raise HTTPException(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			detail="Сервис игр не настроен",
		) from exc


async def close_games_client() -> None:
	await _games_client.close()


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
