from __future__ import annotations

from pydantic import BaseModel


class GameFormatStats(BaseModel):
	format: str  # "blitz", "bullet", "rapid", "classical"
	games_played: int
	wins: int
	losses: int
	draws: int
	win_rate: float  # процент побед


class UserGameStats(BaseModel):
	total_games: int
	total_wins: int
	total_losses: int
	total_draws: int
	overall_win_rate: float
	blitz_rating: int
	bullet_rating: int
	rapid_rating: int
	puzzle_rating: int
	by_format: list[GameFormatStats]

