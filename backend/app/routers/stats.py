import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/stats", tags=["stats"])


class GlobalStatsResponse(BaseModel):
    total_puzzle_solutions: int
    total_games_played: int
    total_users: int
    total_puzzles: int


async def _get_puzzles_stats() -> dict:
    """Получить статистику из puzzles_service"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("http://puzzles:8000/puzzles/stats/aggregate")
            if response.status_code == 200:
                return response.json()
            return {"total_solutions": 0, "total_puzzles": 0}
    except Exception:
        return {"total_solutions": 0, "total_puzzles": 0}


async def _get_games_stats() -> dict:
    """Получить статистику из games_service"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("http://games:8000/api/games/stats/aggregate")
            if response.status_code == 200:
                return response.json()
            return {"total_games": 0}
    except Exception:
        return {"total_games": 0}


async def _get_users_stats() -> dict:
    """Получить статистику из users_service"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("http://users:8000/api/users/stats/aggregate")
            if response.status_code == 200:
                return response.json()
            return {"total_users": 0}
    except Exception:
        return {"total_users": 0}


@router.get("/global", response_model=GlobalStatsResponse)
async def get_global_stats() -> GlobalStatsResponse:
    """
    Получить общую статистику платформы:
    - Общее количество решений задач
    - Общее количество сыгранных партий
    - Общее количество пользователей
    - Общее количество задач
    """
    puzzles_stats = await _get_puzzles_stats()
    games_stats = await _get_games_stats()
    users_stats = await _get_users_stats()
    
    return GlobalStatsResponse(
        total_puzzle_solutions=puzzles_stats.get("total_solutions", 0),
        total_games_played=games_stats.get("total_games", 0),
        total_users=users_stats.get("total_users", 0),
        total_puzzles=puzzles_stats.get("total_puzzles", 0),
    )

