from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User
from ..schemas import UserPublic, UserGameStats, GameFormatStats
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
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
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
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
	
	return _build_user_public(user)


async def _get_user_stats_by_id(user_id: int, db: AsyncSession) -> UserGameStats:
	"""Вспомогательная функция для получения статистики пользователя по ID"""
	import json
	
	# Получаем все завершенные партии пользователя из таблицы games
	# Используем raw SQL, так как games таблица находится в games service, но БД общая
	stmt = text("""
		SELECT 
			white_id, black_id, result, time_control
		FROM games 
		WHERE (white_id = :user_id OR black_id = :user_id)
		AND status = 'FINISHED'
	""")
	result = await db.execute(stmt, {"user_id": user_id})
	games = result.all()
	
	# Функция для определения формата игры
	def get_game_format(time_control: dict | None) -> str:
		if not time_control or not isinstance(time_control, dict):
			return "classical"
		initial_ms = time_control.get("initial_ms", 0)
		initial_minutes = initial_ms / 60000
		
		if initial_minutes < 3:
			return "bullet"
		elif initial_minutes < 10:
			return "blitz"
		elif initial_minutes < 30:
			return "rapid"
		else:
			return "classical"
	
	# Подсчет статистики
	format_stats: dict[str, dict[str, int]] = {
		"blitz": {"games": 0, "wins": 0, "losses": 0, "draws": 0},
		"bullet": {"games": 0, "wins": 0, "losses": 0, "draws": 0},
		"rapid": {"games": 0, "wins": 0, "losses": 0, "draws": 0},
		"classical": {"games": 0, "wins": 0, "losses": 0, "draws": 0},
	}
	
	total_wins = 0
	total_losses = 0
	total_draws = 0
	
	for game_row in games:
		white_id, black_id, game_result, time_control_raw = game_row[0], game_row[1], game_row[2], game_row[3]
		
		# Парсим time_control если это JSONB/JSON
		tc_dict = None
		if time_control_raw:
			if isinstance(time_control_raw, dict):
				tc_dict = time_control_raw
			elif isinstance(time_control_raw, str):
				try:
					tc_dict = json.loads(time_control_raw)
				except:
					pass
		
		format_type = get_game_format(tc_dict)
		format_stats[format_type]["games"] += 1
		
		if game_result == "1/2-1/2":
			format_stats[format_type]["draws"] += 1
			total_draws += 1
		elif game_result:
			is_white = white_id == user_id
			is_winner = (game_result == "1-0" and is_white) or (game_result == "0-1" and not is_white)
			
			if is_winner:
				format_stats[format_type]["wins"] += 1
				total_wins += 1
			else:
				format_stats[format_type]["losses"] += 1
				total_losses += 1
	
	# Получаем рейтинги пользователя
	user = await db.get(User, user_id)
	if not user:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
	
	blitz_rating = user.blitz_rating or 1200
	bullet_rating = user.bullet_rating or 1200
	rapid_rating = user.rapid_rating or 1200
	puzzle_rating = user.puzzle_rating or 1200
	
	total_games = total_wins + total_losses + total_draws
	overall_win_rate = (total_wins / total_games * 100) if total_games > 0 else 0.0
	
	# Формируем список статистики по форматам
	by_format = []
	for fmt, stats in format_stats.items():
		if stats["games"] > 0:
			win_rate = (stats["wins"] / stats["games"] * 100) if stats["games"] > 0 else 0.0
			by_format.append(GameFormatStats(
				format=fmt,
				games_played=stats["games"],
				wins=stats["wins"],
				losses=stats["losses"],
				draws=stats["draws"],
				win_rate=round(win_rate, 1)
			))
	
	return UserGameStats(
		total_games=total_games,
		total_wins=total_wins,
		total_losses=total_losses,
		total_draws=total_draws,
		overall_win_rate=round(overall_win_rate, 1),
		blitz_rating=blitz_rating,
		bullet_rating=bullet_rating,
		rapid_rating=rapid_rating,
		puzzle_rating=puzzle_rating,
		by_format=by_format
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
			raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
		user_id = user_row[0]
	
	return await _get_user_stats_by_id(user_id, db)
