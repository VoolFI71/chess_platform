from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas.stats import UserGameStats
from ..security import verify_internal_token
from ..services import GameService, GameServiceError

router = APIRouter(prefix="/internal", tags=["internal"])


@router.get("/stats/{user_id}", response_model=UserGameStats)
async def get_user_game_stats(
	user_id: int,
	_: None = Depends(verify_internal_token),
	db: AsyncSession = Depends(get_db),
) -> UserGameStats:
	"""Внутренний endpoint для получения статистики игр пользователя.
	
	Используется другими сервисами (например, users_service) для получения
	статистики игр без прямого доступа к таблице games.
	"""
	service = GameService(db)
	try:
		return await service.get_user_game_stats(user_id)
	except GameServiceError as exc:
		raise HTTPException(status_code=exc.status_code, detail=exc.message)

