from __future__ import annotations

import httpx
from fastapi import HTTPException, status

from ..clients.email import get_email_client


async def send_verification_code_email(
	email: str,
	username: str,
	code: str,
	expires_in_minutes: int = 10,
	purpose: str | None = None,
) -> bool:
	"""
	Отправляет письмо с кодом верификации через email микросервис.
	"""
	try:
		client = await get_email_client()
	except RuntimeError as exc:
		raise HTTPException(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			detail=f"Email сервис недоступен: {exc}",
		) from exc

	payload = {
		"email": email,
		"username": username,
		"code": code,
		"purpose": purpose or "Для подтверждения операции используйте следующий код:",
		"expires_in_minutes": expires_in_minutes,
	}

	try:
		response = await client.post("/api/emails/send-verification-code", json=payload)
		response.raise_for_status()
		return True
	except httpx.HTTPStatusError as exc:
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail=f"Ошибка при отправке email: {exc.response.status_code}",
		) from exc
	except httpx.RequestError as exc:
		raise HTTPException(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			detail=f"Email сервис недоступен: {exc}",
		) from exc

