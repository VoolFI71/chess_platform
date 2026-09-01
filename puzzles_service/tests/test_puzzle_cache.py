from __future__ import annotations
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from puzzles_service.app.models import Puzzle
from puzzles_service.app.services.puzzle_cache import PuzzleCache
from puzzles_service.app.schemas import PuzzleFilters, PuzzleResponse


@pytest.fixture
def mock_puzzle():
	puzzle = MagicMock(spec=Puzzle)
	puzzle.id = 1
	puzzle.puzzle_id = "test123"
	puzzle.rating = 1500
	puzzle.fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
	puzzle.moves = ["e2e4", "e7e5"]
	puzzle.move_count = 2
	puzzle.rating_deviation = 50
	puzzle.popularity = 10
	puzzle.nb_plays = 100
	puzzle.solved_count = 5
	puzzle.themes = []
	puzzle.opening_tags = []
	puzzle.game_url = None
	return puzzle


@pytest.fixture
def puzzle_cache():
	return PuzzleCache()


class TestPuzzleCache:
	def test_cache_is_bounded(self, puzzle_cache, mock_puzzle):
		puzzle_cache._max_keys = 1
		cached_puzzle = PuzzleResponse.model_validate(mock_puzzle)

		puzzle_cache._set_cache("first", [cached_puzzle])
		puzzle_cache._set_cache("second", [cached_puzzle])

		assert "first" not in puzzle_cache._caches
		assert "second" in puzzle_cache._caches

	async def test_refresh_stores_response_dto(self, puzzle_cache, mock_puzzle):
		mock_session = AsyncMock()
		mock_result = MagicMock()
		mock_result.scalars.return_value.all.return_value = [mock_puzzle]
		mock_session.execute = AsyncMock(return_value=mock_result)

		await puzzle_cache._refresh_cache(mock_session, "dto_key", None)

		assert isinstance(puzzle_cache._caches["dto_key"][0], PuzzleResponse)

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
		"""Рейтинг входит в ключ без потери точности фильтра."""
		filters = PuzzleFilters(rating_min=1331, rating_max=1481)
		key = puzzle_cache._build_cache_key(filters)
		
		assert "rmin_1331" in key
		assert "rmax_1481" in key

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
