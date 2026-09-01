from __future__ import annotations

import httpx

from common import InternalServiceClient

from ..config import get_settings

_users_client = InternalServiceClient(
	"Users service",
	lambda: (get_settings().users_service_url, get_settings().users_internal_token),
)


async def get_users_client() -> httpx.AsyncClient:
	"""
	Возвращает клиент для обращения к users_service.
	Создаёт экземпляр при первом вызове и переиспользует его далее.
	"""
	return await _users_client.get()


async def close_users_client() -> None:
	"""Закрывает HTTP клиент users_service и сбрасывает ссылку."""
	await _users_client.close()

