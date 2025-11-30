from __future__ import annotations

import chess
from fastapi import HTTPException


class PuzzleValidator:
	"""Сервис для валидации попыток решения задач"""

	MIN_TIME_MS = 100  # Минимальное время (100 мс)
	MAX_TIME_MS = 3600000  # Максимальное время (1 час)

	@staticmethod
	def validate_moves(
		user_moves: list[str] | None,
		puzzle_moves: list[str],
		initial_fen: str,
	) -> bool:
		"""
		Валидирует ходы пользователя против правильного решения задачи.

		Args:
			user_moves: Список ходов пользователя в формате UCI
			puzzle_moves: Правильная последовательность ходов задачи
			initial_fen: Начальная позиция задачи

		Returns:
			True если ходы правильные, False иначе
		"""
		if not user_moves:
			return False

		if len(user_moves) != len(puzzle_moves):
			return False

		try:
			board = chess.Board(initial_fen)
			for i, (user_move_str, puzzle_move_str) in enumerate(zip(user_moves, puzzle_moves)):
				# Нормализуем ходы (нижний регистр)
				user_move_str = user_move_str.lower().strip()
				puzzle_move_str = puzzle_move_str.lower().strip()

				# Парсим ходы
				try:
					user_move = chess.Move.from_uci(user_move_str)
					puzzle_move = chess.Move.from_uci(puzzle_move_str)
				except ValueError:
					return False

				# Проверяем, что ход легален
				if user_move not in board.legal_moves:
					return False

				# Проверяем, что ход совпадает с правильным
				if user_move != puzzle_move:
					return False

				# Применяем ход
				board.push(user_move)

			return True
		except Exception:
			return False

	@staticmethod
	def validate_time(time_spent_ms: int | None, mode: str) -> None:
		"""
		Валидирует время, потраченное на решение задачи.

		Args:
			time_spent_ms: Время в миллисекундах
			mode: Режим решения ("survival" или "rated")

		Raises:
			HTTPException: Если время невалидно
		"""
		if time_spent_ms is None:
			return

		if time_spent_ms < PuzzleValidator.MIN_TIME_MS:
			raise HTTPException(
				status_code=400,
				detail=f"Время решения слишком мало (минимум {PuzzleValidator.MIN_TIME_MS} мс)",
			)

		if time_spent_ms > PuzzleValidator.MAX_TIME_MS:
			raise HTTPException(
				status_code=400,
				detail=f"Время решения слишком велико (максимум {PuzzleValidator.MAX_TIME_MS} мс)",
			)

