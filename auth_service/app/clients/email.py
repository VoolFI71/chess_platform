from __future__ import annotations

import httpx

from common import InternalServiceClient

from ..config import get_settings

_email_client = InternalServiceClient(
	"Email service",
	lambda: (get_settings().email_service_url, get_settings().email_internal_token),
	read_timeout=10.0,
)


async def get_email_client() -> httpx.AsyncClient:
	"""
	Возвращает клиент для обращения к email_service.
	Создаёт экземпляр при первом вызове и переиспользует его далее.
	"""
	return await _email_client.get()


async def close_email_client() -> None:
	"""Закрывает HTTP клиент email_service и сбрасывает ссылку."""
	await _email_client.close()

