from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import TYPE_CHECKING

from fastapi import WebSocket

if TYPE_CHECKING:
	pass


@dataclass
class ConnectionInfo:
	websocket: WebSocket
	user_id: int


class NotificationConnectionManager:
	"""Менеджер WebSocket соединений для уведомлений.
	
	Хранит соединения по user_id, чтобы отправлять уведомления конкретным пользователям.
	"""

	def __init__(self) -> None:
		# Словарь: user_id -> set[WebSocket]
		self._connections: dict[int, set[WebSocket]] = {}
		self._lock = asyncio.Lock()

	async def connect(self, user_id: int, connection: ConnectionInfo) -> None:
		"""Подключить пользователя к WebSocket."""
		await connection.websocket.accept()
		async with self._lock:
			if user_id not in self._connections:
				self._connections[user_id] = set()
			self._connections[user_id].add(connection.websocket)

	async def disconnect(self, websocket: WebSocket, user_id: int | None = None) -> None:
		"""Отключить WebSocket соединение."""
		async with self._lock:
			if user_id is not None:
				# Если знаем user_id, удаляем напрямую
				if user_id in self._connections:
					self._connections[user_id].discard(websocket)
					if not self._connections[user_id]:
						self._connections.pop(user_id)
			else:
				# Если user_id неизвестен, ищем по всем соединениям
				for uid, sockets in list(self._connections.items()):
					if websocket in sockets:
						sockets.discard(websocket)
						if not sockets:
							self._connections.pop(uid)
						break

	async def send_to_user(self, user_id: int, message: dict) -> None:
		"""Отправить сообщение всем соединениям пользователя."""
		async with self._lock:
			sockets = list(self._connections.get(user_id, set()))
		
		# Отправляем вне блокировки, чтобы не блокировать другие операции
		disconnected = []
		for ws in sockets:
			try:
				await ws.send_json(message)
			except Exception:
				disconnected.append(ws)
		
		# Удаляем отключенные соединения
		if disconnected:
			async with self._lock:
				if user_id in self._connections:
					for ws in disconnected:
						self._connections[user_id].discard(ws)
					if not self._connections[user_id]:
						self._connections.pop(user_id)


# Глобальный экземпляр менеджера
notification_ws_manager = NotificationConnectionManager()

