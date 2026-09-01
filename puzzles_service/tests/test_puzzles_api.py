from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from puzzles_service.app.main import app
from puzzles_service.app.models import Puzzle


@pytest.fixture
def client():
	return TestClient(app)


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
	puzzle.themes = ["fork", "mateIn2"]
	puzzle.opening_tags = ["kings_gambit"]
	puzzle.game_url = None
	return puzzle


@pytest.fixture
def mock_puzzle_cache():
	with patch("puzzles_service.app.routers.puzzles.get_puzzle_cache") as mock:
		cache = MagicMock()
		mock.return_value = cache
		yield cache


class TestGetRandomPuzzle:
	def test_get_random_puzzle_success(self, client, mock_puzzle_cache, mock_puzzle):
		"""Успешное получение случайной задачи."""
		mock_puzzle_cache.get_random_puzzle = AsyncMock(return_value=mock_puzzle)
		
		response = client.get("/puzzles/random")
		
		assert response.status_code == 200
		data = response.json()
		assert data["puzzle_id"] == "test123"
		assert data["rating"] == 1500

	def test_get_random_puzzle_with_filters(self, client, mock_puzzle_cache, mock_puzzle):
		"""Получение задачи с фильтрами по рейтингу."""
		mock_puzzle_cache.get_random_puzzle = AsyncMock(return_value=mock_puzzle)
		
		response = client.get("/puzzles/random?rating_min=1400&rating_max=1600")
		
		assert response.status_code == 200
		mock_puzzle_cache.get_random_puzzle.assert_called_once()
		call_args = mock_puzzle_cache.get_random_puzzle.call_args[0][0]
		assert call_args.rating_min == 1400
		assert call_args.rating_max == 1600

	def test_get_random_puzzle_with_themes(self, client, mock_puzzle_cache, mock_puzzle):
		"""Получение задачи с фильтрами по темам."""
		mock_puzzle_cache.get_random_puzzle = AsyncMock(return_value=mock_puzzle)
		
		response = client.get("/puzzles/random?themes=fork&themes=mateIn2")
		
		assert response.status_code == 200
		call_args = mock_puzzle_cache.get_random_puzzle.call_args[0][0]
		assert "fork" in call_args.themes
		assert "mateIn2" in call_args.themes

	def test_get_random_puzzle_not_found(self, client, mock_puzzle_cache):
		"""404 когда задача не найдена."""
		mock_puzzle_cache.get_random_puzzle = AsyncMock(return_value=None)
		
		response = client.get("/puzzles/random")
		
		assert response.status_code == 404
		assert "не найдена" in response.json()["detail"].lower()

	def test_get_random_puzzle_invalid_rating_min(self, client):
		"""Ошибка валидации для rating_min < 400."""
		response = client.get("/puzzles/random?rating_min=300")
		
		assert response.status_code == 422

	def test_get_random_puzzle_invalid_rating_max(self, client):
		"""Ошибка валидации для rating_max > 3500."""
		response = client.get("/puzzles/random?rating_max=4000")
		
		assert response.status_code == 422


class TestGetPuzzlesCount:
	@patch("puzzles_service.app.routers.puzzles.get_db")
	def test_get_puzzles_count_success(self, mock_get_db, client):
		"""Успешное получение количества задач."""
		mock_session = AsyncMock()
		mock_session.scalar = AsyncMock(return_value=1000000)
		mock_get_db.return_value = mock_session
		
		response = client.get("/puzzles/count")
		
		assert response.status_code == 200
		data = response.json()
		assert data["count"] == 1000000

	@patch("puzzles_service.app.routers.puzzles.get_db")
	def test_get_puzzles_count_zero(self, mock_get_db, client):
		"""Количество задач при пустой БД."""
		mock_session = AsyncMock()
		mock_session.scalar = AsyncMock(return_value=0)
		mock_get_db.return_value = mock_session
		
		response = client.get("/puzzles/count")
		
		assert response.status_code == 200
		data = response.json()
		assert data["count"] == 0


class TestPuzzleCacheIntegration:
	@patch("puzzles_service.app.services.puzzle_cache.SessionLocal")
	async def test_cache_refresh_on_empty_cache(self, mock_session_local, mock_puzzle):
		"""Обновление кеша при пустом кеше."""
		from puzzles_service.app.services.puzzle_cache import PuzzleCache
		
		mock_session = AsyncMock()
		mock_session_local.return_value.__aenter__.return_value = mock_session
		
		mock_result = MagicMock()
		mock_result.scalars.return_value.all.return_value = [mock_puzzle]
		mock_session.execute = AsyncMock(return_value=mock_result)
		
		cache = PuzzleCache()
		result = await cache.get_random_puzzle(None)
		
		assert result is not None
		mock_session.execute.assert_called()

	async def test_stale_while_revalidate(self, mock_puzzle):
		"""Паттерн stale-while-revalidate."""
		from puzzles_service.app.services.puzzle_cache import PuzzleCache
		from datetime import datetime, timezone, timedelta
		
		cache = PuzzleCache()
		
		cache_key = cache._build_cache_key(None)
		cache._caches[cache_key] = [mock_puzzle]
		cache._cache_timestamps[cache_key] = datetime.now(timezone.utc) - timedelta(minutes=31)
		
		result = await cache.get_random_puzzle(None)
		
		assert result is not None
