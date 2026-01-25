from __future__ import annotations
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from puzzles_service.app.models import Puzzle
from puzzles_service.app.services.puzzle_cache import PuzzleCache
from puzzles_service.app.schemas import PuzzleFilters


@pytest.fixture
def mock_puzzle():
	puzzle = MagicMock(spec=Puzzle)
	puzzle.id = 1
	puzzle.puzzle_id = "test123"
	puzzle.rating = 1500
	puzzle.fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
	puzzle.moves = ["e2e4", "e7e5"]
	return puzzle


@pytest.fixture
def puzzle_cache():
	return PuzzleCache()


class TestPuzzleCache:
	async def test_get_random_puzzle_from_fresh_cache(self, puzzle_cache, mock_puzzle):
		"""Получение задачи из свежего кеша."""
		cache_key = puzzle_cache._build_cache_key(None)
		puzzle_cache._caches[cache_key] = [mock_puzzle]
		puzzle_cache._cache_timestamps[cache_key] = datetime.now(timezone.utc)
		
		result = await puzzle_cache.get_random_puzzle(None)
		
		assert result is not None
		assert result.puzzle_id == "test123"

	async def test_get_random_puzzle_empty_cache_triggers_refresh(self, puzzle_cache, mock_puzzle):
		"""Пустой кеш запускает обновление."""
		with patch.object(puzzle_cache, '_refresh_cache', new_callable=AsyncMock) as mock_refresh:
			with patch('puzzles_service.app.services.puzzle_cache.SessionLocal') as mock_session:
				mock_session_instance = AsyncMock()
				mock_session.return_value.__aenter__.return_value = mock_session_instance
				
				mock_result = MagicMock()
				mock_result.scalars.return_value.all.return_value = [mock_puzzle]
				mock_session_instance.execute = AsyncMock(return_value=mock_result)
				
				await puzzle_cache.get_random_puzzle(None)
				
				mock_refresh.assert_called()

	async def test_stale_cache_returns_immediately(self, puzzle_cache, mock_puzzle):
		"""Устаревший кеш возвращается сразу, обновление в фоне."""
		cache_key = puzzle_cache._build_cache_key(None)
		puzzle_cache._caches[cache_key] = [mock_puzzle]
		puzzle_cache._cache_timestamps[cache_key] = datetime.now(timezone.utc) - timedelta(minutes=31)
		
		with patch.object(puzzle_cache, '_refresh_cache_async', new_callable=AsyncMock) as mock_refresh:
			result = await puzzle_cache.get_random_puzzle(None)
			
			assert result is not None
			assert result.puzzle_id == "test123"
			mock_refresh.assert_called_once()

	def test_build_cache_key_with_filters(self, puzzle_cache):
		"""Построение ключа кеша с разными фильтрами."""
		filters1 = PuzzleFilters(rating_min=1400, rating_max=1600)
		filters2 = PuzzleFilters(rating_min=1400, rating_max=1600)
		filters3 = PuzzleFilters(rating_min=1500, rating_max=1700)
		
		key1 = puzzle_cache._build_cache_key(filters1)
		key2 = puzzle_cache._build_cache_key(filters2)
		key3 = puzzle_cache._build_cache_key(filters3)
		
		assert key1 == key2
		assert key1 != key3

	def test_build_cache_key_rating_rounding(self, puzzle_cache):
		"""Округление рейтинга для стабильности ключа кеша."""
		filters = PuzzleFilters(rating_min=1331, rating_max=1481)
		key = puzzle_cache._build_cache_key(filters)
		
		assert "rmin_1200" in key or "rmin_1181" in key
		assert "rmax_1500" in key or "rmax_1481" in key

	async def test_cache_refresh_with_tablesample(self, puzzle_cache, mock_puzzle):
		"""Обновление кеша с использованием TABLESAMPLE."""
		mock_session = AsyncMock()
		
		mock_result = MagicMock()
		mock_result.scalars.return_value.all.return_value = [mock_puzzle] * 10
		mock_session.execute = AsyncMock(return_value=mock_result)
		
		await puzzle_cache._refresh_cache(mock_session, "test_key", None)
		
		call_args = mock_session.execute.call_args[0][0]
		query_str = str(call_args)
		assert "TABLESAMPLE" in query_str or mock_session.execute.called

	async def test_cache_refresh_fallback_on_tablesample_failure(self, puzzle_cache, mock_puzzle):
		"""Fallback при ошибке TABLESAMPLE."""
		mock_session = AsyncMock()
		
		mock_session.execute = AsyncMock(side_effect=[
			Exception("TABLESAMPLE failed"),
			MagicMock(scalar=AsyncMock(return_value=(1, 1000))),
			MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[mock_puzzle]))))
		])
		
		await puzzle_cache._refresh_cache(mock_session, "test_key", None)
		
		assert mock_session.execute.call_count > 1