from __future__ import annotations

import asyncio

import httpx

from .config import get_settings


class EnrollmentsClientUnavailable(RuntimeError):
	"""Raised when enrollments service configuration is missing."""


_client: httpx.AsyncClient | None = None
_lock = asyncio.Lock()


async def get_enrollments_client() -> httpx.AsyncClient:
	settings = get_settings()
	if not settings.enrollments_service_url or not settings.enrollments_internal_token:
		raise EnrollmentsClientUnavailable("Enrollments service is not configured")

	base_url = settings.enrollments_service_url.rstrip("/")
	headers = {"X-Internal-Token": settings.enrollments_internal_token}

	global _client
	if _client is None:
		async with _lock:
			if _client is None:
				timeout = httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=10.0)
				limits = httpx.Limits(max_connections=20, max_keepalive_connections=5)
				_client = httpx.AsyncClient(
					base_url=base_url,
					headers=headers,
					timeout=timeout,
					limits=limits,
				)
	return _client


async def close_enrollments_client() -> None:
	global _client
	async with _lock:
		if _client is not None:
			await _client.aclose()
			_client = None

