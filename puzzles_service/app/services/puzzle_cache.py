from __future__ import annotations

import asyncio
import logging
import random
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import SessionLocal
from ..models import Puzzle
from ..schemas import PuzzleFilters, PuzzleResponse

logger = logging.getLogger(__name__)


class PuzzleCache:
    """Bounded in-process cache for random puzzles.

    The cache stores response DTOs instead of SQLAlchemy entities. This keeps
    sessions out of the hot path and avoids retaining ORM instrumentation and
    columns that are not exposed by the API.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self._cache_ttl = timedelta(hours=1)
        self._max_keys = max(1, self.settings.cache_max_keys)
        self._max_items = max(1, self.settings.cache_max_items)
        self._pool_size = min(max(1, self.settings.random_pool_size), self._max_items)

        # OrderedDict gives us a small, deterministic LRU without another
        # dependency. Accesses happen on one asyncio event loop.
        self._caches: OrderedDict[str, list[PuzzleResponse]] = OrderedDict()
        self._cache_timestamps: dict[str, datetime] = {}
        self._refresh_locks: dict[str, asyncio.Lock] = {}
        self._refresh_tasks: dict[str, asyncio.Task[None]] = {}

    def _get_cache(self, key: str) -> list[PuzzleResponse] | None:
        cached = self._caches.get(key)
        if cached is not None:
            self._caches.move_to_end(key)
        return cached

    def _set_cache(self, key: str, items: list[PuzzleResponse]) -> None:
        self._caches[key] = items[: self._max_items]
        self._caches.move_to_end(key)
        self._cache_timestamps[key] = datetime.now(timezone.utc)

        while len(self._caches) > self._max_keys:
            evicted_key, _ = self._caches.popitem(last=False)
            self._cache_timestamps.pop(evicted_key, None)

    def _delete_cache(self, key: str) -> None:
        self._caches.pop(key, None)
        self._cache_timestamps.pop(key, None)

    def _should_refresh(self, key: str) -> bool:
        if key not in self._caches:
            return True
        timestamp = self._cache_timestamps.get(key)
        if timestamp is None:
            return True
        return datetime.now(timezone.utc) - timestamp > self._cache_ttl

    def _get_refresh_lock(self, key: str) -> asyncio.Lock:
        return self._refresh_locks.setdefault(key, asyncio.Lock())

    def _start_refresh(self, key: str, filters: PuzzleFilters | None) -> asyncio.Task[None]:
        task = self._refresh_tasks.get(key)
        if task is not None and not task.done():
            return task

        task = asyncio.create_task(self._refresh_cache_async(key, filters))
        self._refresh_tasks[key] = task
        return task

    async def get_random_puzzle(
        self,
        filters: PuzzleFilters | None = None,
    ) -> PuzzleResponse | None:
        """Return a random cached puzzle, refreshing cold keys once."""
        cache_key = self._build_cache_key(filters)
        cached = self._get_cache(cache_key)

        if cached and not self._should_refresh(cache_key):
            return random.choice(cached)

        if cached:
            # Stale-while-revalidate: never make a warm reader wait for SQL.
            self._start_refresh(cache_key, filters)
            return random.choice(cached)

        # Cold keys wait for the single refresh task for this key. Other keys
        # can refresh concurrently because locks are per key.
        refresh_task = self._start_refresh(cache_key, filters)
        try:
            await refresh_task
        except Exception:
            logger.exception("Error waiting for cache refresh for key '%s'", cache_key)
            return None

        cached = self._get_cache(cache_key)
        return random.choice(cached) if cached else None

    async def _refresh_cache_async(
        self,
        cache_key: str,
        filters: PuzzleFilters | None = None,
    ) -> None:
        """Refresh one key while allowing unrelated keys to proceed."""
        current_task = asyncio.current_task()
        lock = self._get_refresh_lock(cache_key)
        try:
            async with lock:
                if not self._should_refresh(cache_key):
                    return
                async with SessionLocal() as session:
                    await self._refresh_cache(session, cache_key, filters)
        except Exception:
            logger.exception("Error refreshing cache for key '%s'", cache_key)
        finally:
            if self._refresh_tasks.get(cache_key) is current_task:
                self._refresh_tasks.pop(cache_key, None)
                self._refresh_locks.pop(cache_key, None)

    async def _refresh_cache(
        self,
        session: AsyncSession,
        cache_key: str,
        filters: PuzzleFilters | None = None,
    ) -> None:
        """Load a bounded pool of puzzles and replace the cache atomically."""
        conditions = self._build_filter_conditions(filters) if filters else []
        sample_limit = self._pool_size * 3
        query = select(Puzzle).where(
            text(
                "puzzles.id IN ("
                f"SELECT id FROM puzzles TABLESAMPLE SYSTEM (1.0) LIMIT {sample_limit}"
                ")"
            )
        )
        if conditions:
            query = query.where(*conditions)
        query = query.order_by(func.random()).limit(self._pool_size)
        result = await session.execute(query)
        raw_items = list(result.scalars().all())

        if raw_items:
            items = [PuzzleResponse.model_validate(item) for item in raw_items[: self._pool_size]]
            self._set_cache(cache_key, items)
            logger.info("Refreshed cache for key '%s' with %d puzzles", cache_key, len(items))
        else:
            self._delete_cache(cache_key)
            logger.warning("No puzzles found for cache key '%s'", cache_key)

    def _build_cache_key(self, filters: PuzzleFilters | None) -> str:
        if not filters:
            return "all"
        parts: list[str] = []
        if filters.rating_min is not None:
            parts.append(f"rmin_{filters.rating_min}")
        if filters.rating_max is not None:
            parts.append(f"rmax_{filters.rating_max}")
        if filters.themes:
            parts.append("themes_" + "-".join(sorted(filters.themes)))
        if filters.opening_tags:
            parts.append("openings_" + "-".join(sorted(filters.opening_tags)))
        return "|".join(parts) if parts else "all"

    def _build_filter_conditions(self, filters: PuzzleFilters) -> list[Any]:
        conditions: list[Any] = []
        if filters.rating_min is not None:
            conditions.append(Puzzle.rating >= filters.rating_min)
        if filters.rating_max is not None:
            conditions.append(Puzzle.rating <= filters.rating_max)
        if filters.themes:
            conditions.append(Puzzle.themes.contains(filters.themes))
        if filters.opening_tags:
            conditions.append(Puzzle.opening_tags.contains(filters.opening_tags))
        return conditions


_puzzle_cache_instance: PuzzleCache | None = None


def get_puzzle_cache() -> PuzzleCache:
    """Return the process-wide cache instance."""
    global _puzzle_cache_instance
    if _puzzle_cache_instance is None:
        _puzzle_cache_instance = PuzzleCache()
    return _puzzle_cache_instance
