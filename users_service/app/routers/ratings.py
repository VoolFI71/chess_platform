from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select, text
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
	stmt = (
		select(RatingHistory, text("COUNT(*) OVER()").label("total"))
		.where(RatingHistory.user_id == current_user_id)
		.order_by(desc(RatingHistory.created_at))
		.limit(limit)
		.offset(offset)
	)
	
	if format_type:
		stmt = stmt.where(RatingHistory.format_type == format_type)
	
	result = await db.execute(stmt)
	rows = result.all()
	
	if not rows:
		return RatingHistoryResponse(entries=[], total=0)
	
	total = rows[0].total if rows else 0
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
	stmt = (
		select(RatingHistory, text("COUNT(*) OVER()").label("total"))
		.where(RatingHistory.user_id == user_id)
		.order_by(desc(RatingHistory.created_at))
		.limit(limit)
		.offset(offset)
	)
	
	if format_type:
		stmt = stmt.where(RatingHistory.format_type == format_type)
	
	result = await db.execute(stmt)
	rows = result.all()
	
	if not rows:
		return RatingHistoryResponse(entries=[], total=0)
	
	total = rows[0].total if rows else 0
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
			func.row_number().over(order_by=rating_attr.desc()).label("rank"),
			func.count().over().label("total"),
		)
		.where(User.is_active == True)
		.order_by(desc(rating_attr))
		.limit(limit)
		.offset(offset)
	)
	
	result = await db.execute(stmt)
	rows = result.all()
	
	if not rows:
		return LeaderboardResponse(entries=[], total=0, format_type=format_type)
	
	total = rows[0].total if rows else 0
	entries = []
	
	for row in rows:
		user_public = build_user_public(row.User)
		rating = row.rating or 1200
		rank = row.rank
		entries.append(
			LeaderboardEntry(
				user=user_public,
				rating=rating,
				rank=rank,
			)
		)
	
	return LeaderboardResponse(entries=entries, total=total, format_type=format_type)

