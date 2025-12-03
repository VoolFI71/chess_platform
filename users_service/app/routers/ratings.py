from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import RatingHistory, User
from ..schemas.user import UserPublic
from ..security import get_current_user_id
from ..utils import build_user_public


router = APIRouter(prefix="/api/ratings", tags=["ratings"])


class RatingHistoryEntry(BaseModel):
	id: int
	format_type: str
	rating_before: int
	rating_after: int
	rating_change: int
	game_id: str | None
	result: str | None
	opponent_id: int | None
	created_at: str

	model_config = {"from_attributes": True}


class RatingHistoryResponse(BaseModel):
	entries: list[RatingHistoryEntry]
	total: int


class LeaderboardEntry(BaseModel):
	user: UserPublic
	rating: int
	rank: int


class LeaderboardResponse(BaseModel):
	entries: list[LeaderboardEntry]
	total: int
	format_type: str


@router.get("/history/me", response_model=RatingHistoryResponse)
async def get_my_rating_history(
	format_type: Annotated[
		Literal["blitz", "rapid", "bullet", "puzzle"] | None,
		Query(description="Фильтр по формату игры")
	] = None,
	limit: Annotated[int, Query(ge=1, le=100)] = 50,
	offset: Annotated[int, Query(ge=0)] = 0,
	current_user_id: Annotated[int, Depends(get_current_user_id)] = None,
	db: AsyncSession = Depends(get_db),
) -> RatingHistoryResponse:
	"""Получить историю рейтингов текущего пользователя"""
	# Сначала получаем общее количество записей
	count_stmt = select(func.count()).select_from(RatingHistory).where(RatingHistory.user_id == current_user_id)
	if format_type:
		count_stmt = count_stmt.where(RatingHistory.format_type == format_type)
	total = await db.scalar(count_stmt) or 0
	
	# Затем получаем данные с пагинацией
	stmt = (
		select(RatingHistory)
		.where(RatingHistory.user_id == current_user_id)
		.order_by(desc(RatingHistory.created_at))
		.limit(limit)
		.offset(offset)
	)
	
	if format_type:
		stmt = stmt.where(RatingHistory.format_type == format_type)
	
	result = await db.execute(stmt)
	rows = result.scalars().all()
	
	entries = [
		RatingHistoryEntry(
			id=row.id,
			format_type=row.format_type,
			rating_before=row.rating_before,
			rating_after=row.rating_after,
			rating_change=row.rating_change,
			game_id=row.game_id,
			result=row.result,
			opponent_id=row.opponent_id,
			created_at=row.created_at.isoformat(),
		)
		for row in rows
	]
	
	return RatingHistoryResponse(entries=entries, total=total)


@router.get("/history/{user_id}", response_model=RatingHistoryResponse)
async def get_user_rating_history(
	user_id: int,
	format_type: Annotated[
		Literal["blitz", "rapid", "bullet", "puzzle"] | None,
		Query(description="Фильтр по формату игры")
	] = None,
	limit: Annotated[int, Query(ge=1, le=100)] = 50,
	offset: Annotated[int, Query(ge=0)] = 0,
	db: AsyncSession = Depends(get_db),
) -> RatingHistoryResponse:
	"""Получить историю рейтингов пользователя (публичный доступ)"""
	# Сначала получаем общее количество записей
	count_stmt = select(func.count()).select_from(RatingHistory).where(RatingHistory.user_id == user_id)
	if format_type:
		count_stmt = count_stmt.where(RatingHistory.format_type == format_type)
	total = await db.scalar(count_stmt) or 0
	
	# Затем получаем данные с пагинацией
	stmt = (
		select(RatingHistory)
		.where(RatingHistory.user_id == user_id)
		.order_by(desc(RatingHistory.created_at))
		.limit(limit)
		.offset(offset)
	)
	
	if format_type:
		stmt = stmt.where(RatingHistory.format_type == format_type)
	
	result = await db.execute(stmt)
	rows = result.scalars().all()
	
	entries = [
		RatingHistoryEntry(
			id=row.id,
			format_type=row.format_type,
			rating_before=row.rating_before,
			rating_after=row.rating_after,
			rating_change=row.rating_change,
			game_id=row.game_id,
			result=row.result,
			opponent_id=row.opponent_id,
			created_at=row.created_at.isoformat(),
		)
		for row in rows
	]
	
	return RatingHistoryResponse(entries=entries, total=total)


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
	format_type: Annotated[
		Literal["blitz", "rapid", "bullet", "puzzle"],
		Query(description="Формат игры для рейтинга")
	] = "blitz",
	limit: Annotated[int, Query(ge=1, le=100)] = 50,
	offset: Annotated[int, Query(ge=0)] = 0,
	db: AsyncSession = Depends(get_db),
) -> LeaderboardResponse:
	"""Получить таблицу лидеров по рейтингу"""
	rating_column = f"{format_type}_rating"
	
	# Получаем пользователей с рейтингом, отсортированных по убыванию
	rating_attr = getattr(User, rating_column)
	
	# Сначала получаем общее количество активных пользователей с рейтингом
	count_stmt = select(func.count()).select_from(User).where(
		User.is_active == True,
		rating_attr.isnot(None)
	)
	total = await db.scalar(count_stmt) or 0
	
	# Затем получаем данные с пагинацией
	stmt = (
		select(
			User,
			rating_attr.label("rating"),
		)
		.where(
			User.is_active == True,
			rating_attr.isnot(None)
		)
		.order_by(desc(rating_attr))
		.limit(limit)
		.offset(offset)
	)
	
	result = await db.execute(stmt)
	rows = result.all()
	
	entries = []
	
	# Вычисляем ранг в Python, добавляя offset к индексу строки
	for idx, row in enumerate(rows):
		user_public = build_user_public(row.User)
		rating = row.rating or 1200
		# Ранг = offset + индекс в результате (начиная с 1)
		rank = offset + idx + 1
		
		entries.append(
			LeaderboardEntry(
				user=user_public,
				rating=rating,
				rank=rank,
			)
		)
	
	return LeaderboardResponse(entries=entries, total=total, format_type=format_type)

