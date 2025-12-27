import logging
from datetime import date
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException

from ..database import get_db
from ..models import DailyPuzzle, DailyPuzzleSolution
from ..security import get_current_user_id

logger = logging.getLogger(__name__)

daily_solutions_router = APIRouter(prefix="/puzzles/daily", tags=["daily-puzzle-solutions"])


@daily_solutions_router.post("/solve", status_code=201)
async def solve_daily_puzzle(
	db: AsyncSession = Depends(get_db),
	current_user_id: int = Depends(get_current_user_id),
) -> dict:
	"""
	Сохранить решение ежедневной задачи пользователем.
	
	Каждый пользователь может решить задачу дня только один раз в день.
	При повторной попытке возвращается ошибка 409 Conflict.
	"""
	today = date.today()
	
	# Проверяем, что задача дня существует
	stmt = select(DailyPuzzle).where(DailyPuzzle.date == today)
	result = await db.execute(stmt)
	daily_puzzle = result.scalar_one_or_none()
	
	if not daily_puzzle:
		raise HTTPException(
			status_code=404,
			detail="Задача дня не найдена.",
		)
	
	# Проверяем, не решена ли уже задача пользователем сегодня
	existing_stmt = select(DailyPuzzleSolution).where(
		DailyPuzzleSolution.user_id == current_user_id,
		DailyPuzzleSolution.date == today,
	)
	existing_result = await db.execute(existing_stmt)
	existing_solution = existing_result.scalar_one_or_none()
	
	if existing_solution:
		raise HTTPException(
			status_code=409,
			detail="Вы уже решили эту задачу сегодня.",
		)
	
	# Создаем новое решение
	solution = DailyPuzzleSolution(
		user_id=current_user_id,
		date=today,
	)
	
	try:
		db.add(solution)
		await db.commit()
		logger.info(
			"Daily puzzle solved by user %d for date %s",
			current_user_id,
			today,
		)
		return {"message": "Задача успешно решена!", "solved": True}
	except IntegrityError:
		await db.rollback()
		# Конфликт - возможно, другой запрос уже создал решение
		raise HTTPException(
			status_code=409,
			detail="Вы уже решили эту задачу сегодня.",
		)

