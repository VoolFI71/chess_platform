from __future__ import annotations

import asyncio
from typing import Any

import httpx

from ..config import get_settings

_email_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()


async def get_email_client() -> httpx.AsyncClient:
	"""
	Возвращает клиент для обращения к email_service.
	Создаёт экземпляр при первом вызове и переиспользует его далее.
	"""
	global _email_client

	if _email_client is None:
		async with _client_lock:
			if _email_client is None:
				settings = get_settings()
				if not settings.email_service_url or not settings.email_internal_token:
					raise RuntimeError("Email service is not configured")

				base_url = settings.email_service_url.rstrip("/")
				timeout = httpx.Timeout(connect=2.0, read=10.0, write=10.0, pool=10.0)
				limits = httpx.Limits(max_connections=20, max_keepalive_connections=5)
				headers: dict[str, Any] = {"X-Internal-Token": settings.email_internal_token}

				_email_client = httpx.AsyncClient(
					base_url=base_url,
					headers=headers,
					timeout=timeout,
					limits=limits,
				)

	return _email_client


async def close_email_client() -> None:
	"""Закрывает HTTP клиент email_service и сбрасывает ссылку."""
	global _email_client

	async with _client_lock:
		if _email_client is not None:
			await _email_client.aclose()
			_email_client = None

