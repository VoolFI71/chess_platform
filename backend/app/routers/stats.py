import asyncio
import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/api/stats", tags=["stats"])

_STATS_TIMEOUT = httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=5.0)


class GlobalStatsResponse(BaseModel):
    total_puzzle_solutions: int
    total_games_played: int
    total_users: int
    total_puzzles: int


class OnlineStatsResponse(BaseModel):
    online_players: int
    active_games: int


async def _fetch_stats(
    client: httpx.AsyncClient,
    *,
    service_name: str,
    url: str,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Fetch JSON from a dependent service without hiding failures as zeroes."""
    try:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"{service_name} did not respond in time",
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{service_name} returned HTTP {exc.response.status_code}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{service_name} is unavailable",
        ) from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{service_name} returned invalid JSON",
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{service_name} returned an invalid response",
        )
    return payload


def _required_int(payload: dict[str, Any], key: str, service_name: str) -> int:
    value = payload.get(key)
    if not isinstance(value, int) or isinstance(value, bool):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{service_name} response is missing integer field '{key}'",
        )
    return value


@router.get("/global", response_model=GlobalStatsResponse)
async def get_global_stats() -> GlobalStatsResponse:
    """Return the aggregate platform statistics from their owning services."""
    async with httpx.AsyncClient(timeout=_STATS_TIMEOUT) as client:
        puzzles_stats, games_stats, users_stats = await asyncio.gather(
            _fetch_stats(
                client,
                service_name="Puzzles service",
                url="http://puzzles:8000/puzzles/stats/aggregate",
            ),
            _fetch_stats(
                client,
                service_name="Games service",
                url="http://games:8000/api/games/stats/aggregate",
            ),
            _fetch_stats(
                client,
                service_name="Users service",
                url="http://users:8000/api/users/stats/aggregate",
            ),
        )

    return GlobalStatsResponse(
        total_puzzle_solutions=_required_int(puzzles_stats, "total_solutions", "Puzzles service"),
        total_games_played=_required_int(games_stats, "total_games", "Games service"),
        total_users=_required_int(users_stats, "total_users", "Users service"),
        total_puzzles=_required_int(puzzles_stats, "total_puzzles", "Puzzles service"),
    )


@router.get("/online", response_model=OnlineStatsResponse)
async def get_online_stats() -> OnlineStatsResponse:
    """Return online player and active-game counts from games_service."""
    internal_token = os.getenv("GAMES_INTERNAL_TOKEN") or os.getenv("INTERNAL_TOKEN")
    if not internal_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Games service internal token is not configured",
        )

    async with httpx.AsyncClient(timeout=_STATS_TIMEOUT) as client:
        stats = await _fetch_stats(
            client,
            service_name="Games service",
            url="http://games:8000/internal/stats/online",
            headers={"X-Internal-Token": internal_token},
        )

    return OnlineStatsResponse(
        online_players=_required_int(stats, "online_players", "Games service"),
        active_games=_required_int(stats, "active_games", "Games service"),
    )
