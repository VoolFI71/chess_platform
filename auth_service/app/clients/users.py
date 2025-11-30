from __future__ import annotations

import asyncio
from typing import Any

import httpx

from ..config import get_settings

_users_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()


async def get_users_client() -> httpx.AsyncClient:
	"""
	Возвращает клиент для обращения к users_service.
	Создаёт экземпляр при первом вызове и переиспользует его далее.
	"""
	global _users_client

	if _users_client is None:
		async with _client_lock:
			if _users_client is None:
				settings = get_settings()
				if not settings.users_service_url or not settings.users_internal_token:
					raise RuntimeError("Users service is not configured")

				base_url = settings.users_service_url.rstrip("/")
				timeout = httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=10.0)
				limits = httpx.Limits(max_connections=20, max_keepalive_connections=5)
				headers: dict[str, Any] = {"X-Internal-Token": settings.users_internal_token}

				_users_client = httpx.AsyncClient(
					base_url=base_url,
					headers=headers,
					timeout=timeout,
					limits=limits,
				)

	return _users_client


async def close_users_client() -> None:
	"""Закрывает HTTP клиент users_service и сбрасывает ссылку."""
	global _users_client

	async with _client_lock:
		if _users_client is not None:
			await _users_client.aclose()
			_users_client = None

