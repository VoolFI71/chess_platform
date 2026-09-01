"""Reusable HTTP clients for authenticated service-to-service requests."""
from __future__ import annotations

import asyncio
from collections.abc import Callable

import httpx


class ServiceClientNotConfigured(RuntimeError):
    """Raised when a dependent service has no URL or internal token configured."""


class InternalServiceClient:
    """Lazily creates and reuses one authenticated ``httpx.AsyncClient``."""

    def __init__(
        self,
        service_name: str,
        configuration: Callable[[], tuple[str | None, str | None]],
        *,
        connect_timeout: float = 2.0,
        read_timeout: float = 5.0,
        max_connections: int = 20,
        max_keepalive_connections: int = 5,
    ) -> None:
        self._service_name = service_name
        self._configuration = configuration
        self._timeout = httpx.Timeout(
            connect=connect_timeout,
            read=read_timeout,
            write=read_timeout,
            pool=10.0,
        )
        self._limits = httpx.Limits(
            max_connections=max_connections,
            max_keepalive_connections=max_keepalive_connections,
        )
        self._client: httpx.AsyncClient | None = None
        self._lock = asyncio.Lock()

    async def get(self) -> httpx.AsyncClient:
        if self._client is not None:
            return self._client

        async with self._lock:
            if self._client is None:
                base_url, internal_token = self._configuration()
                if not base_url or not internal_token:
                    raise ServiceClientNotConfigured(f"{self._service_name} is not configured")
                self._client = httpx.AsyncClient(
                    base_url=base_url.rstrip("/"),
                    headers={"X-Internal-Token": internal_token},
                    timeout=self._timeout,
                    limits=self._limits,
                )
        return self._client

    async def close(self) -> None:
        async with self._lock:
            if self._client is not None:
                await self._client.aclose()
                self._client = None
