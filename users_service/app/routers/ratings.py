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


async def _get_rating_history(
	db: AsyncSession,
	user_id: int,
	format_type: Literal["blitz", "rapid", "bullet", "puzzle"] | None,
	limit: int,
	offset: int,
) -> RatingHistoryResponse:
	"""Fetch a page and its total in one query in the usual non-empty case."""
	filters = [RatingHistory.user_id == user_id]
	if format_type:
		filters.append(RatingHistory.format_type == format_type)

	stmt = (
		select(RatingHistory, func.count().over().label("total"))
		.where(*filters)
		.order_by(desc(RatingHistory.created_at))
		.limit(limit)
		.offset(offset)
	)
	rows = (await db.execute(stmt)).all()

	# A window count is absent if the requested page lies beyond the final row.
	# Keep the API contract accurate for that edge case without penalising normal pages.
	if rows:
		total = int(rows[0].total)
	else:
		total = await db.scalar(select(func.count()).select_from(RatingHistory).where(*filters)) or 0

	entries = [
		RatingHistoryEntry(
			id=row.RatingHistory.id,
			format_type=row.RatingHistory.format_type,
			rating_before=row.RatingHistory.rating_before,
			rating_after=row.RatingHistory.rating_after,
			rating_change=row.RatingHistory.rating_change,
			game_id=row.RatingHistory.game_id,
			result=row.RatingHistory.result,
			opponent_id=row.RatingHistory.opponent_id,
			created_at=row.RatingHistory.created_at.isoformat(),
		)
		for row in rows
	]
	return RatingHistoryResponse(entries=entries, total=total)


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
	return await _get_rating_history(db, current_user_id, format_type, limit, offset)


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
	return await _get_rating_history(db, user_id, format_type, limit, offset)


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
	
	stmt = (
		select(
			User,
			rating_attr.label("rating"),
			func.count().over().label("total"),
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
	if rows:
		total = int(rows[0].total)
	else:
		total = await db.scalar(
			select(func.count()).select_from(User).where(
				User.is_active == True,
				rating_attr.isnot(None),
			)
		) or 0
	
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

