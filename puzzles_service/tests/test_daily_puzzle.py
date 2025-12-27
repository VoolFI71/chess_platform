"""
Unit tests for daily puzzle functionality.
"""
from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.exc import IntegrityError

from puzzles_service.app.models import DailyPuzzle, Puzzle
from puzzles_service.app.services.daily_puzzle import DailyPuzzleService


@pytest.fixture
def mock_session():
	"""Create a mock async session."""
	session = AsyncMock()
	return session


@pytest.fixture
def mock_puzzle():
	"""Create a mock puzzle."""
	puzzle = MagicMock(spec=Puzzle)
	puzzle.puzzle_id = "test123"
	puzzle.rating = 2800
	puzzle.fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
	puzzle.moves = ["e2e4", "e7e5"]
	return puzzle


@pytest.fixture
def daily_service():
	"""Create DailyPuzzleService instance."""
	return DailyPuzzleService()


@pytest.mark.asyncio
async def test_get_existing_daily_puzzle(daily_service, mock_session, mock_puzzle):
	"""Test getting existing daily puzzle."""
	target_date = date.today()
	
	# Mock existing DailyPuzzle record
	existing_daily = MagicMock(spec=DailyPuzzle)
	existing_daily.puzzle_id = "test123"
	existing_daily.rating = 2800
	
	# Mock database queries
	mock_result = MagicMock()
	mock_result.scalar_one_or_none.return_value = existing_daily
	mock_session.execute.return_value = mock_result
	
	# Mock puzzle query
	mock_puzzle_result = MagicMock()
	mock_puzzle_result.scalar_one_or_none.return_value = mock_puzzle
	mock_session.execute.side_effect = [mock_result, mock_puzzle_result]
	
	# Call service
	result = await daily_service.get_or_create_for_date(target_date, mock_session)
	
	# Verify
	assert result is not None
	assert result.puzzle_id == "test123"
	mock_session.execute.assert_called()


@pytest.mark.asyncio
async def test_create_new_daily_puzzle(daily_service, mock_session, mock_puzzle):
	"""Test creating new daily puzzle when none exists."""
	target_date = date.today()
	
	# Mock no existing record
	mock_result = MagicMock()
	mock_result.scalar_one_or_none.return_value = None
	mock_session.execute.return_value = mock_result
	
	# Mock puzzle cache
	with patch.object(daily_service.puzzle_cache, 'get_random_puzzle', new_callable=AsyncMock) as mock_cache:
		mock_cache.return_value = mock_puzzle
		
		# Mock session.add and commit
		mock_session.add = MagicMock()
		mock_session.flush = AsyncMock()
		mock_session.commit = AsyncMock()
		
		# Call service
		result = await daily_service.get_or_create_for_date(target_date, mock_session)
		
		# Verify
		assert result is not None
		assert result.puzzle_id == "test123"
		mock_session.add.assert_called_once()
		mock_session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_race_condition_handling(daily_service, mock_session, mock_puzzle):
	"""Test handling of race condition when multiple requests create puzzle simultaneously."""
	target_date = date.today()
	
	# First call: no existing record
	mock_result_empty = MagicMock()
	mock_result_empty.scalar_one_or_none.return_value = None
	
	# Second call: IntegrityError on flush
	mock_session.execute.return_value = mock_result_empty
	mock_session.flush = AsyncMock(side_effect=IntegrityError("", "", ""))
	mock_session.rollback = AsyncMock()
	
	# After rollback: existing record found
	existing_daily = MagicMock(spec=DailyPuzzle)
	existing_daily.puzzle_id = "test123"
	existing_daily.rating = 2800
	
	mock_result_existing = MagicMock()
	mock_result_existing.scalar_one_or_none.return_value = existing_daily
	
	mock_puzzle_result = MagicMock()
	mock_puzzle_result.scalar_one_or_none.return_value = mock_puzzle
	
	# Setup side_effect for execute calls
	mock_session.execute.side_effect = [
		mock_result_empty,  # First check for existing
		mock_result_existing,  # After rollback, find existing
		mock_puzzle_result,  # Load puzzle
	]
	
	# Mock puzzle cache
	with patch.object(daily_service.puzzle_cache, 'get_random_puzzle', new_callable=AsyncMock) as mock_cache:
		mock_cache.return_value = mock_puzzle
		
		# Call service
		result = await daily_service.get_or_create_for_date(target_date, mock_session)
		
		# Verify
		assert result is not None
		mock_session.rollback.assert_called_once()
		mock_session.commit.assert_not_called()  # Should not commit after rollback


@pytest.mark.asyncio
async def test_no_puzzle_in_cache(daily_service, mock_session):
	"""Test behavior when puzzle cache returns None."""
	target_date = date.today()
	
	# Mock no existing record
	mock_result = MagicMock()
	mock_result.scalar_one_or_none.return_value = None
	mock_session.execute.return_value = mock_result
	
	# Mock puzzle cache returning None
	with patch.object(daily_service.puzzle_cache, 'get_random_puzzle', new_callable=AsyncMock) as mock_cache:
		mock_cache.return_value = None
		
		# Call service
		result = await daily_service.get_or_create_for_date(target_date, mock_session)
		
		# Verify
		assert result is None
		mock_session.add.assert_not_called()
		mock_session.commit.assert_not_called()

