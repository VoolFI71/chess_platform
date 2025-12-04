from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta
from threading import Lock
from typing import Sequence
from uuid import UUID

import chess
from fastapi import status
from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import SessionLocal
from ..models import (
	Game,
	GameResult,
	GameSnapshot,
	GameStatus,
	Move,
	SideToMove,
	TerminationReason,
)
from ..schemas import (
	CreateGameRequest,
	GameDetail,
	GameSummary,
	MakeMovePayload,
	MoveOut,
)
from ..schemas.stats import GameFormatStats, UserGameStats
from ..realtime.manager import game_ws_manager

LOGGER = logging.getLogger(__name__)

SNAPSHOT_INTERVAL = 50
AUTO_CANCEL_TIMEOUT_SECONDS = 30
_AUTO_CANCEL_TASKS: dict[UUID, asyncio.Task] = {}
_AUTO_CANCEL_DEADLINES: dict[UUID, datetime] = {}
_AUTO_CANCEL_LOCK = Lock()


class GameServiceError(Exception):
	def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
		super().__init__(message)
		self.message = message
		self.status_code = status_code


def _utcnow() -> datetime:
	return datetime.now(timezone.utc)


def _calculate_elo_rating(
	player_rating: int,
	opponent_rating: int,
	score: float,  # 1.0 for win, 0.5 for draw, 0.0 for loss
	k_factor: int = 32,
) -> int:
	"""Calculate new Elo rating after a game.
	
	Args:
		player_rating: Current rating of the player
		opponent_rating: Current rating of the opponent
		score: Game result (1.0 = win, 0.5 = draw, 0.0 = loss)
		k_factor: K-factor for rating calculation (default 32)
	
	Returns:
		New rating (minimum 400)
	"""
	expected_score = 1 / (1 + 10 ** ((opponent_rating - player_rating) / 400))
	new_rating = player_rating + k_factor * (score - expected_score)
	return max(400, round(new_rating))


def _get_game_format(time_control: dict | None) -> str:
	"""Determine game format from time control."""
	if not time_control:
		return "rapid"
	
	initial_ms = time_control.get("initial_ms", 0)
	total_minutes = initial_ms / 60000
	
	if total_minutes <= 3:
		return "bullet"
	elif total_minutes <= 10:
		return "blitz"
	elif total_minutes <= 60:
		return "rapid"
	else:
		return "rapid"  # классика тоже rapid для простоты


def _board_from_fen(fen: str) -> chess.Board:
	try:
		return chess.Board(fen)
	except ValueError as exc:
		raise GameServiceError("Неверный формат FEN") from exc


def _initial_board(initial_fen: str | None) -> tuple[chess.Board, str]:
	if not initial_fen or initial_fen.lower() == "startpos":
		board = chess.Board()
		return board, "startpos"
	board = _board_from_fen(initial_fen)
	return board, board.fen()


def build_move_out(move: Move | MoveOut) -> MoveOut:
	# Если move уже является MoveOut, возвращаем его как есть
	if isinstance(move, MoveOut):
		return move
	# Явно извлекаем атрибуты из SQLAlchemy модели, чтобы избежать ошибки MissingGreenlet
	# при доступе к атрибутам вне async контекста
	# ВАЖНО: эта функция должна вызываться только в async контексте, когда объект еще не expired
	return MoveOut(
		id=move.id,
		game_id=move.game_id,
		move_index=move.move_index,
		uci=move.uci,
		san=move.san,
		fen_after=move.fen_after,
		player_id=move.player_id,
		clocks_after=move.clocks_after,
		is_capture=move.is_capture,
		promotion=move.promotion,
		created_at=move.created_at,
	)


async def extract_move_data(move: Move) -> MoveOut:
	"""Извлекает данные из Move объекта в async контексте.
	Используйте эту функцию для извлечения данных сразу после загрузки/создания объекта,
	пока он еще не expired в сессии SQLAlchemy.
	"""
	return MoveOut(
		id=move.id,
		game_id=move.game_id,
		move_index=move.move_index,
		uci=move.uci,
		san=move.san,
		fen_after=move.fen_after,
		player_id=move.player_id,
		clocks_after=move.clocks_after,
		is_capture=move.is_capture,
		promotion=move.promotion,
		created_at=move.created_at,
	)


def build_game_summary(game: Game) -> GameSummary:
	return GameSummary.model_validate(game)


def build_game_detail(game: Game, moves: Sequence[Move | MoveOut] | None = None) -> GameDetail:
	summary = build_game_summary(game)
	data = summary.model_dump()
	
	# Извлекаем finish_time из time_control для отображения на клиенте
	white_finish_ms = None
	black_finish_ms = None
	if game.time_control and isinstance(game.time_control, dict):
		white_finish_ms = game.time_control.get("white_finish_ms", 0) or 0
		black_finish_ms = game.time_control.get("black_finish_ms", 0) or 0
		# Если finish_time не установлен, используем initial_ms
		if white_finish_ms == 0:
			white_finish_ms = game.time_control.get("initial_ms", 0) or 0
		if black_finish_ms == 0:
			black_finish_ms = game.time_control.get("initial_ms", 0) or 0
		if white_finish_ms == 0:
			white_finish_ms = None
		if black_finish_ms == 0:
			black_finish_ms = None
	
	data.update(
		{
			"initial_pos": game.initial_pos,
			"current_pos": game.current_pos,
			"time_control": game.time_control,
			"metadata": game.metadata_json,
			"pgn": game.pgn,
			"moves": [build_move_out(m) for m in moves] if moves else [],
			"white_finish_ms": white_finish_ms,
			"black_finish_ms": black_finish_ms,
		}
	)
	with _AUTO_CANCEL_LOCK:
		deadline = _AUTO_CANCEL_DEADLINES.get(game.id)
	if not deadline and game.metadata_json:
		raw_deadline = game.metadata_json.get("auto_cancel_deadline")
		if raw_deadline:
			try:
				deadline = datetime.fromisoformat(raw_deadline)
			except ValueError:
				deadline = None
	data["auto_cancel_at"] = deadline.isoformat() if deadline else None
	
	# Логируем что отправляется клиенту
	last_move_created_at = None
	last_move_timestamp_ms = None
	if moves and len(moves) > 0:
		last_move = moves[-1]
		if hasattr(last_move, 'created_at') and last_move.created_at:
			last_move_created_at = last_move.created_at.isoformat() if isinstance(last_move.created_at, datetime) else str(last_move.created_at)
			if isinstance(last_move.created_at, datetime):
				last_move_timestamp_ms = int(last_move.created_at.timestamp() * 1000)
			elif hasattr(last_move.created_at, 'timestamp'):
				last_move_timestamp_ms = int(last_move.created_at.timestamp() * 1000)
	
	now_ms = int(_utcnow().timestamp() * 1000)
	elapsed_since_last_move_ms = None
	if last_move_timestamp_ms:
		elapsed_since_last_move_ms = now_ms - last_move_timestamp_ms
	
	LOGGER.info(
		"[BUILD GAME DETAIL] game_id=%s "
		"white_clock_ms=%d black_clock_ms=%d next_turn=%s move_count=%d "
		"last_move_created_at=%s last_move_timestamp_ms=%s now_ms=%s elapsed_since_last_move_ms=%s "
		"auto_cancel_at=%s moves_count=%d",
		game.id,
		data.get("white_clock_ms"), data.get("black_clock_ms"),
		data.get("next_turn"), data.get("move_count"),
		last_move_created_at,
		last_move_timestamp_ms,
		now_ms,
		elapsed_since_last_move_ms,
		data.get("auto_cancel_at"),
		len(data.get("moves", [])),
	)
	
	return GameDetail(**data)


async def _persist_auto_cancel_deadline(game_id: UUID, deadline: datetime | None) -> None:
	async with SessionLocal() as db:
		db_game = await db.get(Game, game_id)
		if not db_game:
			return
		metadata = dict(db_game.metadata_json or {})
		if deadline:
			metadata["auto_cancel_deadline"] = deadline.isoformat()
		else:
			metadata.pop("auto_cancel_deadline", None)
		db_game.metadata_json = metadata or None
		await db.commit()


async def _auto_cancel_job(game_id: UUID) -> None:
	try:
		await asyncio.sleep(AUTO_CANCEL_TIMEOUT_SECONDS)
		async with SessionLocal() as db:
			game = await db.get(Game, game_id)
			if not game:
				return
			if game.status != GameStatus.CREATED.value or game.move_count > 0:
				return
			await db.delete(game)
			await db.commit()
		await game_ws_manager.broadcast(
			game_id,
			{
				"type": "game_cancelled",
				"game_id": str(game_id),
			},
		)
	finally:
		with _AUTO_CANCEL_LOCK:
			_AUTO_CANCEL_TASKS.pop(game_id, None)
			_AUTO_CANCEL_DEADLINES.pop(game_id, None)


async def schedule_auto_cancel(game: Game) -> None:
	if (
		game.status != GameStatus.CREATED.value
		or game.move_count > 0
		or game.white_id is None
		or game.black_id is None
	):
		await cancel_auto_cancel(game.id)
		return
	loop = asyncio.get_running_loop()
	with _AUTO_CANCEL_LOCK:
		if game.id in _AUTO_CANCEL_TASKS:
			return
		deadline = _utcnow() + timedelta(seconds=AUTO_CANCEL_TIMEOUT_SECONDS)
		_AUTO_CANCEL_TASKS[game.id] = loop.create_task(_auto_cancel_job(game.id))
		_AUTO_CANCEL_DEADLINES[game.id] = deadline
	await _persist_auto_cancel_deadline(game.id, deadline)


async def cancel_auto_cancel(game_id: UUID) -> None:
	with _AUTO_CANCEL_LOCK:
		task = _AUTO_CANCEL_TASKS.pop(game_id, None)
		_AUTO_CANCEL_DEADLINES.pop(game_id, None)
	if task:
		task.cancel()
	await _persist_auto_cancel_deadline(game_id, None)


class GameService:
	def __init__(self, db: AsyncSession):
		self.db = db

	async def _get_last_move(self, game: Game) -> Move | None:
		"""Получает последний ход игры. Кэшируется для оптимизации."""
		stmt = (
			select(Move)
			.where(Move.game_id == game.id)
			.order_by(Move.move_index.desc())
			.limit(1)
		)
		result = await self.db.execute(stmt)
		return result.scalar_one_or_none()
	
	async def _get_last_activity_timestamp(self, game: Game, last_move: Move | None = None) -> datetime | None:
		"""Получает timestamp последней активности. Оптимизировано для использования кэшированного last_move."""
		if last_move is not None:
			return last_move.created_at
		last_move = await self._get_last_move(game)
		if last_move:
			return last_move.created_at
		if game.started_at:
			return game.started_at
		return game.created_at

	async def _compute_elapsed_ms(self, game: Game, last_move: Move | None = None) -> int:
		"""Вычисляет прошедшее время с момента последней активности в миллисекундах."""
		if game.move_count > 0:
			last_activity = await self._get_last_activity_timestamp(game, last_move)
			if last_activity:
				elapsed_ms = int((_utcnow() - last_activity).total_seconds() * 1000)
				return max(0, elapsed_ms)
		
		# Для первого хода считаем время от started_at (когда присоединился второй игрок)
		if game.started_at:
			elapsed_ms = int((_utcnow() - game.started_at).total_seconds() * 1000)
			return max(0, elapsed_ms)
		
		return 0
	
	async def _compute_clocks_for_move(
		self,
		game: Game,
		current_turn: str,
		elapsed_ms: int,
		increment_ms: int,
	) -> tuple[int, int, int, int]:
		"""Вычисляет past_time и finish_time для обоих игроков при ходе.

		ЛОГИКА: Сервер всегда сам вычисляет время по elapsed_ms
		- past_time (прошедшее время) увеличивается на elapsed_ms (время хода)
		- finish_time увеличивается на increment_ms (инкремент)
		- Когда past_time >= finish_time, время закончилось
		
		Возвращает: (white_past, black_past, white_finish, black_finish)
		"""
		white_past = game.white_clock_ms
		black_past = game.black_clock_ms
		
		white_finish = 0
		black_finish = 0
		if game.time_control and isinstance(game.time_control, dict):
			white_finish = game.time_control.get("white_finish_ms", 0) or 0
			black_finish = game.time_control.get("black_finish_ms", 0) or 0
			if white_finish == 0:
				white_finish = game.time_control.get("initial_ms", 0) or 0
			if black_finish == 0:
				black_finish = game.time_control.get("initial_ms", 0) or 0

		if current_turn == SideToMove.WHITE.value:
			white_past = white_past + elapsed_ms
			white_finish = white_finish + increment_ms
		else:
			black_past = black_past + elapsed_ms
			black_finish = black_finish + increment_ms

		LOGGER.info(
			"[CLOCK CALC] game_id=%s turn=%s "
			"white_past=%d black_past=%d white_finish=%d black_finish=%d "
			"elapsed_ms=%d increment_ms=%d",
			game.id, current_turn,
			white_past, black_past, white_finish, black_finish,
			elapsed_ms, increment_ms,
		)

		return white_past, black_past, white_finish, black_finish

	async def _compute_effective_clocks(self, game: Game, last_move: Move | None = None) -> tuple[int, int]:
		"""Вычисляет эффективное past_time с учетом прошедшего времени с момента последнего хода.
		
		ЛОГИКА: past_time и finish_time
		- past_time увеличивается на прошедшее время текущего хода
		- Когда past_time >= finish_time, время закончилось
		"""
		white_past = game.white_clock_ms
		black_past = game.black_clock_ms
		if game.status == GameStatus.FINISHED.value:
			return white_past, black_past
		# Время начинает тикать только после первого хода
		# Если ходов еще не было (move_count == 0), время не тикает
		if game.move_count == 0:
			return white_past, black_past
		last_activity = await self._get_last_activity_timestamp(game, last_move)
		if not last_activity:
			return white_past, black_past
		now = _utcnow()
		elapsed_ms = int((now - last_activity).total_seconds() * 1000)
		if elapsed_ms <= 0:
			return white_past, black_past
		# Добавляем прошедшее время к past_time текущего игрока
		if game.next_turn == SideToMove.WHITE.value:
			white_past = white_past + elapsed_ms
		else:
			black_past = black_past + elapsed_ms
		LOGGER.debug(
			"[EFFECTIVE CLOCKS] game_id=%s next_turn=%s last_activity=%s now=%s "
			"elapsed_ms=%d white_past_stored=%d black_past_stored=%d "
			"white_past_effective=%d black_past_effective=%d",
			game.id, game.next_turn,
			last_activity.isoformat() if last_activity else None,
			now.isoformat(),
			elapsed_ms,
			game.white_clock_ms, game.black_clock_ms,
			white_past, black_past,
		)
		return white_past, black_past

	async def create_game(self, *, creator_id: int, payload: CreateGameRequest) -> Game:
		board, initial_pos = _initial_board(payload.initial_fen)
		time_control = payload.time_control.dict() if payload.time_control else None
		
		# ЛОГИКА: past_time и finish_time
		# past_time = 0 (начало партии, прошедшее время = 0)
		# finish_time = initial_ms (начальное время, например 180000 мс = 3 минуты)
		initial_ms = payload.time_control.initial_ms if payload.time_control else 0
		if time_control:
			time_control["white_finish_ms"] = initial_ms
			time_control["black_finish_ms"] = initial_ms

		if payload.creator_color == "white":
			white_id = creator_id
			black_id = None
		else:
			white_id = None
			black_id = creator_id

		game = Game(
			white_id=white_id,
			black_id=black_id,
			initial_pos=initial_pos,
			current_pos=board.fen(),
			next_turn=SideToMove.WHITE.value if board.turn == chess.WHITE else SideToMove.BLACK.value,
			time_control=time_control,
			move_count=0,
			white_clock_ms=0,  # past_time начинается с 0 (прошедшее время)
			black_clock_ms=0,  # past_time начинается с 0 (прошедшее время)
			metadata_json=payload.metadata,
		)

		self.db.add(game)
		await self.db.commit()
		await self.db.refresh(game)
		return game

	async def list_games(
		self,
		*,
		statuses: list[GameStatus] | None = None,
		limit: int = 50,
	) -> list[Game]:
		stmt = select(Game).order_by(Game.created_at.desc()).limit(limit)
		if statuses:
			stmt = stmt.where(Game.status.in_([s.value for s in statuses]))
		result = await self.db.execute(stmt)
		return list(result.scalars().all())

	async def list_games_for_user(
		self, user_id: int, *, limit: int = 50, offset: int = 0, statuses: list[GameStatus] | None = None
	) -> list[Game]:
		stmt = (
			select(Game)
			.where(or_(Game.white_id == user_id, Game.black_id == user_id))
			.order_by(Game.created_at.desc())
			.offset(offset)
			.limit(limit)
		)
		if statuses:
			stmt = stmt.where(Game.status.in_([s.value for s in statuses]))
		result = await self.db.execute(stmt)
		return list(result.scalars().all())

	async def get_game(self, game_id: UUID) -> Game:
		game = await self.db.get(Game, game_id)
		if not game:
			raise GameServiceError("Game not found", status.HTTP_404_NOT_FOUND)
		return game

	async def get_game_with_moves(
		self, game_id: UUID, *, limit: int | None = None
	) -> tuple[Game, list[Move]]:
		game = await self.get_game(game_id)
		moves = await self.get_moves(game_id, limit=limit)
		return game, moves

	async def get_moves(self, game_id: UUID, *, limit: int | None = None) -> list[Move]:
		stmt = (
			select(Move)
			.where(Move.game_id == game_id)
			.order_by(Move.move_index.desc())
		)
		if limit is not None:
			stmt = stmt.limit(limit)
		result = await self.db.execute(stmt)
		moves = list(result.scalars().all())
		moves.reverse()
		return moves

	async def join_game(self, game_id: UUID, *, player_id: int) -> Game:
		game = await self._lock_game(game_id)
		if game.status != GameStatus.CREATED.value:
			raise GameServiceError("Партия не открыта для присоединения", status.HTTP_409_CONFLICT)
		if player_id in {game.white_id, game.black_id}:
			raise GameServiceError("Вы уже участвуете в этой партии", status.HTTP_400_BAD_REQUEST)
		if game.white_id is not None and game.black_id is not None:
			raise GameServiceError("В партии уже два игрока", status.HTTP_409_CONFLICT)

		if game.white_id is None:
			game.white_id = player_id
		else:
			game.black_id = player_id
		
		# Если оба игрока присоединились, начинаем партию
		if game.white_id is not None and game.black_id is not None:
			game.status = GameStatus.ACTIVE.value
			game.started_at = _utcnow()
			LOGGER.info(
				"[GAME STARTED] game_id=%s Both players joined, game started at %s",
				game.id, game.started_at.isoformat()
			)
		
		await self.db.commit()
		await self.db.refresh(game)
		return game

	async def make_move(
		self,
		game_id: UUID,
		*,
		player_id: int,
		payload: MakeMovePayload,
	) -> tuple[Game, Move]:
		# Сбрасываем кэш всех объектов в сессии, чтобы получить актуальные данные из БД
		# Это важно, так как другой игрок мог сделать ход в другой транзакции
		# и объект Game может быть закэширован в текущей сессии
		# expire_all() - синхронный метод, не требует await
		self.db.expire_all()
		# Теперь блокируем и получаем актуальную версию
		game = await self._lock_game(game_id)
		if game.status == GameStatus.FINISHED.value:
			raise GameServiceError("Партия уже завершена", status.HTTP_409_CONFLICT)
		if not game.white_id or not game.black_id:
			raise GameServiceError("Нельзя начать, пока не присоединился второй игрок")

		expected_player = game.white_id if game.next_turn == SideToMove.WHITE.value else game.black_id
		if player_id != expected_player:
			raise GameServiceError("Не ваш ход", status.HTTP_403_FORBIDDEN)

		board = _board_from_fen(game.current_pos)
		try:
			move_obj = chess.Move.from_uci(payload.uci)
		except ValueError as exc:
			raise GameServiceError("Неверный формат UCI хода") from exc

		if move_obj not in board.legal_moves:
			raise GameServiceError("Недопустимый ход")

		is_capture = board.is_capture(move_obj)
		san = board.san(move_obj)
		board.push(move_obj)
		new_fen = board.fen()

		# Сохраняем, чей ход был ДО этого хода (игрок, который делает ход сейчас)
		current_turn = game.next_turn
		
		# Оптимизация: загружаем последний ход один раз для всех вычислений
		last_move = await self._get_last_move(game) if game.move_count > 0 else None
		
		# Логируем состояние ДО хода
		last_activity = await self._get_last_activity_timestamp(game, last_move) if game.move_count > 0 else None
		LOGGER.info(
			"[MOVE START] game_id=%s player_id=%s move_index=%d turn=%s "
			"white_clock_before=%dms black_clock_before=%dms next_turn_before=%s "
			"move_count=%d last_activity=%s last_move_created_at=%s",
			game.id, player_id, game.move_count + 1, current_turn,
			game.white_clock_ms, game.black_clock_ms, game.next_turn,
			game.move_count,
			last_activity.isoformat() if last_activity else None,
			last_move.created_at.isoformat() if last_move and last_move.created_at else None,
		)
		
		# Проверка таймаута: проверяем, не закончилось ли время у игрока, который делает ход
		effective_white_past, effective_black_past = await self._compute_effective_clocks(game, last_move)
		
		# Получаем finish_time из time_control
		white_finish = 0
		black_finish = 0
		if game.time_control and isinstance(game.time_control, dict):
			white_finish = game.time_control.get("white_finish_ms", 0) or 0
			black_finish = game.time_control.get("black_finish_ms", 0) or 0
			# Если finish_time не установлен, используем initial_ms
			if white_finish == 0:
				white_finish = game.time_control.get("initial_ms", 0) or 0
			if black_finish == 0:
				black_finish = game.time_control.get("initial_ms", 0) or 0
		
		LOGGER.info(
			"[TIMEOUT CHECK] game_id=%s effective_white_past=%dms effective_black_past=%dms "
			"white_finish=%d black_finish=%d server_time=%s",
			game.id, effective_white_past, effective_black_past,
			white_finish, black_finish, _utcnow().isoformat(),
		)
		if current_turn == SideToMove.WHITE.value:
			if white_finish > 0 and effective_white_past >= white_finish:
				LOGGER.info(
					"Move rejected: timeout - game_id=%s, player_id=%s, turn=white, "
					"effective_past=%dms finish=%dms",
					game.id, player_id, effective_white_past, white_finish
				)
				raise GameServiceError("У белых закончилось время", status.HTTP_400_BAD_REQUEST)
		else:
			if black_finish > 0 and effective_black_past >= black_finish:
				LOGGER.info(
					"Move rejected: timeout - game_id=%s, player_id=%s, turn=black, "
					"effective_past=%dms finish=%dms",
					game.id, player_id, effective_black_past, black_finish
				)
				raise GameServiceError("У черных закончилось время", status.HTTP_400_BAD_REQUEST)
		
		# Время тикает на клиенте, клиент отправляет текущее время
		# Используем время с клиента, если оно предоставлено, иначе вычисляем на сервере
		increment_ms = 0
		if game.time_control and isinstance(game.time_control, dict):
			increment_ms = game.time_control.get("increment_ms", 0) or 0
		
		# Вычисляем прошедшее время (используется для вычисления времени на сервере, если клиент не отправил)
		# Используем кэшированный last_move для оптимизации
		elapsed_ms = await self._compute_elapsed_ms(game, last_move)
		LOGGER.info(
			"[ELAPSED TIME] game_id=%s elapsed_ms=%d server_time=%s",
			game.id, elapsed_ms, _utcnow().isoformat(),
		)
		
		# Вычисляем past_time и finish_time для обоих игроков
		white_past, black_past, white_finish, black_finish = await self._compute_clocks_for_move(
			game, current_turn, elapsed_ms, increment_ms
		)

		move_index = game.move_count + 1
		move_created_at = _utcnow()
		move = Move(
			game_id=game.id,
			move_index=move_index,
			uci=payload.uci,
			san=san,
			fen_after=new_fen,
			player_id=player_id,
			clocks_after={
				"white_past_ms": white_past,
				"black_past_ms": black_past,
				"white_finish_ms": white_finish,
				"black_finish_ms": black_finish,
			},
			is_capture=is_capture,
			promotion=payload.promotion,
			created_at=move_created_at,
		)

		game.current_pos = new_fen
		game.move_count = move_index
		game.white_clock_ms = white_past
		game.black_clock_ms = black_past
		
		if game.time_control is None:
			game.time_control = {}
		if not isinstance(game.time_control, dict):
			game.time_control = {}
		game.time_control["white_finish_ms"] = white_finish
		game.time_control["black_finish_ms"] = black_finish
		old_next_turn = game.next_turn
		game.next_turn = SideToMove.BLACK.value if game.next_turn == SideToMove.WHITE.value else SideToMove.WHITE.value

		self.db.add(move)
		
		LOGGER.info(
			"[MOVE AFTER] game_id=%s move_index=%d "
			"white_past_after=%dms black_past_after=%dms "
			"white_finish_after=%dms black_finish_after=%dms next_turn_after=%s "
			"move_created_at=%s",
			game.id, move_index,
			white_past, black_past, white_finish, black_finish, game.next_turn,
			move_created_at.isoformat(),
		)

		if move_index % SNAPSHOT_INTERVAL == 0:
			self.db.add(
				GameSnapshot(
					game_id=game.id,
					snapshot_move_index=move_index,
					fen=new_fen,
				)
			)

		# Проверка окончания игры
		if board.is_checkmate():
			winner = SideToMove.WHITE.value if player_id == game.white_id else SideToMove.BLACK.value
			await self._finish_game(
				game,
				winner=winner,
				reason=TerminationReason.CHECKMATE.value,
				ended_by=player_id,
			)
		elif board.is_stalemate() or board.is_insufficient_material() or board.is_seventyfive_moves() or board.is_repetition(3):
			# Ничья: пат, недостаточно материала, правило 75 ходов или трёхкратное повторение
			# Используем строку для reason, так как в enum нет специальных значений для ничьих
			reason_str = "STALEMATE" if board.is_stalemate() else \
						"INSUFFICIENT_MATERIAL" if board.is_insufficient_material() else \
						"SEVENTY_FIVE_MOVES" if board.is_seventyfive_moves() else \
						"THREEFOLD_REPETITION"
			await self._finish_game(
				game,
				winner=None,
				reason=reason_str,
				ended_by=player_id,
			)

		await self.db.commit()
		await self.db.refresh(game)
		
		LOGGER.info(
			"[MOVE COMMITTED] game_id=%s move_index=%d "
			"white_clock_final=%dms black_clock_final=%dms next_turn_final=%s "
			"move_created_at=%s move_id=%s",
			game.id, move_index,
			game.white_clock_ms, game.black_clock_ms, game.next_turn,
			move_created_at.isoformat(),
			move.id,
		)
		
		# Оптимизация: cancel_auto_cancel выполняется асинхронно после коммита
		# Не блокируем ответ на это
		asyncio.create_task(cancel_auto_cancel(game.id))
		
		return game, move

	async def resign(self, game_id: UUID, *, player_id: int) -> Game:
		game = await self._lock_game(game_id)
		if game.status == GameStatus.FINISHED.value:
			raise GameServiceError("Партия уже завершена", status.HTTP_409_CONFLICT)
		if player_id not in (game.white_id, game.black_id):
			raise GameServiceError("Вы не участвуете в этой партии", status.HTTP_403_FORBIDDEN)

		winner = SideToMove.BLACK.value if player_id == game.white_id else SideToMove.WHITE.value
		await self._finish_game(
			game,
			winner=winner,
			reason=TerminationReason.RESIGNATION.value,
			ended_by=player_id,
		)
		await self.db.commit()
		await self.db.refresh(game)
		return game

	async def timeout(self, game_id: UUID, *, loser_color: SideToMove, requested_by: int) -> Game:
		game = await self._lock_game(game_id)
		if game.status == GameStatus.FINISHED.value:
			raise GameServiceError("Партия уже завершена", status.HTTP_409_CONFLICT)
		if requested_by not in (game.white_id, game.black_id):
			raise GameServiceError("Вы не участвуете в этой партии", status.HTTP_403_FORBIDDEN)
		effective_white_past, effective_black_past = await self._compute_effective_clocks(game)
		
		# Получаем finish_time из time_control
		white_finish = 0
		black_finish = 0
		if game.time_control and isinstance(game.time_control, dict):
			white_finish = game.time_control.get("white_finish_ms", 0) or 0
			black_finish = game.time_control.get("black_finish_ms", 0) or 0
			# Если finish_time не установлен, используем initial_ms
			if white_finish == 0:
				white_finish = game.time_control.get("initial_ms", 0) or 0
			if black_finish == 0:
				black_finish = game.time_control.get("initial_ms", 0) or 0
		
		# Проверяем, достиг ли past_time finish_time (past_time >= finish_time)
		if loser_color == SideToMove.WHITE:
			if white_finish == 0 or effective_white_past < white_finish:
				raise GameServiceError("Время белых не истекло")
		else:
			if black_finish == 0 or effective_black_past < black_finish:
				raise GameServiceError("Время черных не истекло")

		# Обновляем past_time до эффективных значений
		game.white_clock_ms = effective_white_past
		game.black_clock_ms = effective_black_past
		
		# Устанавливаем past_time проигравшего равным finish_time (время закончилось)
		if loser_color == SideToMove.WHITE:
			game.white_clock_ms = white_finish
		else:
			game.black_clock_ms = black_finish
			
		winner = SideToMove.BLACK.value if loser_color == SideToMove.WHITE else SideToMove.WHITE.value
		await self._finish_game(
			game,
			winner=winner,
			reason=TerminationReason.TIMEOUT.value,
			ended_by=requested_by,
		)
		await self.db.commit()
		await self.db.refresh(game)
		return game

	async def _finish_game(
		self,
		game: Game,
		*,
		winner: str | None,
		reason: str,
		ended_by: int | None,
	) -> None:
		await cancel_auto_cancel(game.id)
		game.status = GameStatus.FINISHED.value
		game.finished_at = _utcnow()
		game.termination_reason = reason
		game.ended_by = ended_by
		if winner is None:
			game.result = GameResult.DRAW.value
		else:
			game.result = (
				GameResult.WHITE_WIN.value if winner == SideToMove.WHITE.value else GameResult.BLACK_WIN.value
			)
		
		# Обновляем счетчик сыгранных партий для обоих игроков
		# Используем raw SQL для обновления, чтобы не создавать зависимость от users_service
		if game.white_id:
			await self.db.execute(
				text("UPDATE users SET games_played = games_played + 1 WHERE id = :user_id"),
				{"user_id": game.white_id}
			)
		if game.black_id:
			await self.db.execute(
				text("UPDATE users SET games_played = games_played + 1 WHERE id = :user_id"),
				{"user_id": game.black_id}
			)
		
		# Обновляем рейтинги, если игра завершена с двумя игроками
		if game.white_id and game.black_id:
			await self._update_ratings(game)

	async def _update_ratings(self, game: Game) -> None:
		"""Обновляет рейтинги игроков после завершения игры."""
		# Определяем формат игры
		tc_dict = None
		if game.time_control:
			if isinstance(game.time_control, dict):
				tc_dict = game.time_control
			elif isinstance(game.time_control, str):
				try:
					tc_dict = json.loads(game.time_control)
				except:
					pass
		
		format_type = _get_game_format(tc_dict)
		
		# Получаем текущие рейтинги игроков
		white_stmt = text("SELECT {}_rating FROM users WHERE id = :user_id".format(format_type))
		black_stmt = text("SELECT {}_rating FROM users WHERE id = :user_id".format(format_type))
		
		white_result = await self.db.execute(white_stmt, {"user_id": game.white_id})
		black_result = await self.db.execute(black_stmt, {"user_id": game.black_id})
		
		white_row = white_result.first()
		black_row = black_result.first()
		
		if not white_row or not black_row:
			return  # Игроки не найдены
		
		white_rating_before = white_row[0] or 1200
		black_rating_before = black_row[0] or 1200
		
		# Определяем результат игры
		is_draw = game.result == GameResult.DRAW.value
		white_won = game.result == GameResult.WHITE_WIN.value
		
		# Рассчитываем новые рейтинги
		if is_draw:
			white_score = 0.5
			black_score = 0.5
			white_result_str = "draw"
			black_result_str = "draw"
		elif white_won:
			white_score = 1.0
			black_score = 0.0
			white_result_str = "win"
			black_result_str = "loss"
		else:
			white_score = 0.0
			black_score = 1.0
			white_result_str = "loss"
			black_result_str = "win"
		
		white_rating_after = _calculate_elo_rating(white_rating_before, black_rating_before, white_score)
		black_rating_after = _calculate_elo_rating(black_rating_before, white_rating_before, black_score)
		
		# Обновляем рейтинги в таблице users
		rating_column = f"{format_type}_rating"
		await self.db.execute(
			text(f"UPDATE users SET {rating_column} = :rating WHERE id = :user_id"),
			{"rating": white_rating_after, "user_id": game.white_id}
		)
		await self.db.execute(
			text(f"UPDATE users SET {rating_column} = :rating WHERE id = :user_id"),
			{"rating": black_rating_after, "user_id": game.black_id}
		)
		
		# Сохраняем историю рейтингов (если таблица существует)
		# Используем raw SQL, чтобы не создавать зависимость от users_service
		# Важно: используем отдельную транзакцию или savepoint, чтобы ошибка не откатила основную транзакцию
		try:
			# Проверяем существование таблицы перед вставкой
			check_result = await self.db.execute(
				text("""
					SELECT EXISTS (
						SELECT FROM information_schema.tables 
						WHERE table_schema = 'public' 
						AND table_name = 'rating_history'
					)
				""")
			)
			table_exists = check_result.scalar()
			
			if not table_exists:
				LOGGER.warning("Table 'rating_history' does not exist, skipping rating history save")
				return
			
			# Используем savepoint для изоляции ошибок вставки
			await self.db.execute(text("SAVEPOINT rating_history_savepoint"))
			try:
				await self.db.execute(
					text("""
						INSERT INTO rating_history 
						(user_id, format_type, rating_before, rating_after, rating_change, game_id, result, opponent_id, created_at)
						VALUES (:user_id, :format_type, :rating_before, :rating_after, :rating_change, :game_id, :result, :opponent_id, NOW())
					"""),
					{
						"user_id": game.white_id,
						"format_type": format_type,
						"rating_before": white_rating_before,
						"rating_after": white_rating_after,
						"rating_change": white_rating_after - white_rating_before,
						"game_id": str(game.id),
						"result": white_result_str,
						"opponent_id": game.black_id,
					}
				)
				await self.db.execute(
					text("""
						INSERT INTO rating_history 
						(user_id, format_type, rating_before, rating_after, rating_change, game_id, result, opponent_id, created_at)
						VALUES (:user_id, :format_type, :rating_before, :rating_after, :rating_change, :game_id, :result, :opponent_id, NOW())
					"""),
					{
						"user_id": game.black_id,
						"format_type": format_type,
						"rating_before": black_rating_before,
						"rating_after": black_rating_after,
						"rating_change": black_rating_after - black_rating_before,
						"game_id": str(game.id),
						"result": black_result_str,
						"opponent_id": game.white_id,
					}
				)
				await self.db.execute(text("RELEASE SAVEPOINT rating_history_savepoint"))
			except Exception as e:
				# Откатываем только savepoint, основная транзакция продолжается
				await self.db.execute(text("ROLLBACK TO SAVEPOINT rating_history_savepoint"))
				LOGGER.warning("Failed to save rating history: %s", e)
		except Exception as e:
			# Если проверка таблицы или создание savepoint не удалось, просто логируем ошибку
			LOGGER.warning("Failed to save rating history (check failed): %s", e)

	async def _lock_game(self, game_id: UUID) -> Game:
		# Используем populate_existing() чтобы гарантировать загрузку свежих данных из БД
		# даже если объект уже есть в сессии (перезаписывает существующий объект)
		stmt = select(Game).where(Game.id == game_id).with_for_update().execution_options(populate_existing=True)
		result = await self.db.execute(stmt)
		game = result.scalars().first()
		if not game:
			raise GameServiceError("Game not found", status.HTTP_404_NOT_FOUND)
		return game

	async def get_user_game_stats(self, user_id: int) -> UserGameStats:
		"""Получает статистику игр для пользователя."""
		import json
		
		# Получаем все завершенные партии пользователя
		stmt = select(Game).where(
			or_(Game.white_id == user_id, Game.black_id == user_id),
			Game.status == GameStatus.FINISHED.value
		)
		result = await self.db.execute(stmt)
		games = result.scalars().all()
		
		# Функция для определения формата игры
		def get_game_format(time_control: dict | None) -> str:
			if not time_control or not isinstance(time_control, dict):
				return "classical"
			initial_ms = time_control.get("initial_ms", 0)
			initial_minutes = initial_ms / 60000
			
			if initial_minutes < 3:
				return "bullet"
			elif initial_minutes < 10:
				return "blitz"
			elif initial_minutes < 30:
				return "rapid"
			else:
				return "classical"
		
		# Подсчет статистики
		format_stats: dict[str, dict[str, int]] = {
			"blitz": {"games": 0, "wins": 0, "losses": 0, "draws": 0},
			"bullet": {"games": 0, "wins": 0, "losses": 0, "draws": 0},
			"rapid": {"games": 0, "wins": 0, "losses": 0, "draws": 0},
			"classical": {"games": 0, "wins": 0, "losses": 0, "draws": 0},
		}
		
		total_wins = 0
		total_losses = 0
		total_draws = 0
		
		for game in games:
			# Парсим time_control если это JSONB/JSON
			tc_dict = None
			if game.time_control:
				if isinstance(game.time_control, dict):
					tc_dict = game.time_control
				elif isinstance(game.time_control, str):
					try:
						tc_dict = json.loads(game.time_control)
					except:
						pass
			
			format_type = get_game_format(tc_dict)
			format_stats[format_type]["games"] += 1
			
			if game.result == GameResult.DRAW.value:
				format_stats[format_type]["draws"] += 1
				total_draws += 1
			elif game.result:
				is_white = game.white_id == user_id
				is_winner = (game.result == GameResult.WHITE_WIN.value and is_white) or (
					game.result == GameResult.BLACK_WIN.value and not is_white
				)
				
				if is_winner:
					format_stats[format_type]["wins"] += 1
					total_wins += 1
				else:
					format_stats[format_type]["losses"] += 1
					total_losses += 1
		
		# Получаем рейтинги пользователя из таблицы users
		# Используем raw SQL, чтобы не создавать зависимость от users_service
		user_stmt = text("SELECT blitz_rating, bullet_rating, rapid_rating, puzzle_rating FROM users WHERE id = :user_id")
		user_result = await self.db.execute(user_stmt, {"user_id": user_id})
		user_row = user_result.first()
		
		if not user_row:
			raise GameServiceError("User not found", status.HTTP_404_NOT_FOUND)
		
		blitz_rating = user_row[0] or 1200
		bullet_rating = user_row[1] or 1200
		rapid_rating = user_row[2] or 1200
		puzzle_rating = user_row[3] or 1200
		
		total_games = total_wins + total_losses + total_draws
		overall_win_rate = (total_wins / total_games * 100) if total_games > 0 else 0.0
		
		# Формируем список статистики по форматам
		by_format = []
		for fmt, stats in format_stats.items():
			if stats["games"] > 0:
				win_rate = (stats["wins"] / stats["games"] * 100) if stats["games"] > 0 else 0.0
				by_format.append(GameFormatStats(
					format=fmt,
					games_played=stats["games"],
					wins=stats["wins"],
					losses=stats["losses"],
					draws=stats["draws"],
					win_rate=round(win_rate, 1)
				))
		
		return UserGameStats(
			total_games=total_games,
			total_wins=total_wins,
			total_losses=total_losses,
			total_draws=total_draws,
			overall_win_rate=round(overall_win_rate, 1),
			blitz_rating=blitz_rating,
			bullet_rating=bullet_rating,
			rapid_rating=rapid_rating,
			puzzle_rating=puzzle_rating,
			by_format=by_format
		)

