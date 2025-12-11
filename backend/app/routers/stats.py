import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/stats", tags=["stats"])

# Кэш удален - теперь используется WebSocket для real-time обновлений
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


class OnlineStatsResponse(BaseModel):
    online_players: int
    active_games: int


async def _get_online_stats() -> dict:
    """Получить статистику онлайн из games_service"""
    # Получаем внутренний токен для вызова games_service
    # games_service использует GAMES_INTERNAL_TOKEN или INTERNAL_TOKEN
    internal_token = os.getenv("GAMES_INTERNAL_TOKEN") or os.getenv("INTERNAL_TOKEN")
    if not internal_token:
        # Если токен не настроен, возвращаем дефолтные значения
        return {"online_players": 0, "active_games": 0}
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                "http://games:8000/internal/stats/online",
                headers={"X-Internal-Token": internal_token},
            )
            if response.status_code == 200:
                return response.json()
            return {"online_players": 0, "active_games": 0}
    except Exception:
        return {"online_players": 0, "active_games": 0}


@router.get("/online", response_model=OnlineStatsResponse)
async def get_online_stats() -> OnlineStatsResponse:
    """
    Получить статистику онлайн (без кэширования):
    - Количество игроков онлайн (уникальных пользователей с активными WebSocket соединениями)
    - Количество активных игр
    
    Примечание: Для real-time обновлений рекомендуется использовать WebSocket endpoint /ws/stats
    """
    stats = await _get_online_stats()
    return OnlineStatsResponse(
        online_players=stats.get("online_players", 0),
        active_games=stats.get("active_games", 0),
    )

