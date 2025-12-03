from __future__ import annotations

import httpx
from fastapi import HTTPException, status

from ..clients.users import get_users_client
from ..schemas import UserOut


async def _handle_request_error(exc: httpx.RequestError) -> None:
	raise HTTPException(
		status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
		detail=f"Сервис пользователей недоступен: {exc}",
	)


def _handle_configuration_error(exc: RuntimeError) -> HTTPException:
	return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))


async def create_user(
	username: str,
	email: str,
	hashed_password: str,
) -> UserOut:
	"""
	Создаёт пользователя в users_service и возвращает его публичные данные.
	"""
	try:
		client = await get_users_client()
	except RuntimeError as exc:
		raise _handle_configuration_error(exc) from exc
	payload = {
		"username": username,
		"email": email,
		"hashed_password": hashed_password,
	}
	try:
		response = await client.post("/internal/users", json=payload)
		response.raise_for_status()
	except httpx.HTTPStatusError as exc:
		if exc.response.status_code == status.HTTP_409_CONFLICT:
			# Сохраняем код 409 для конфликтов (дубликаты email/username)
			detail = exc.response.json().get("detail", "Имя пользователя или email уже заняты")
			raise HTTPException(status.HTTP_409_CONFLICT, detail=detail) from exc
		if exc.response.status_code == status.HTTP_400_BAD_REQUEST:
			detail = exc.response.json().get("detail", "Не удалось создать пользователя")
			raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=detail) from exc
		raise HTTPException(
			status.HTTP_502_BAD_GATEWAY,
			detail=f"Ошибка при создании пользователя: {exc.response.status_code}",
		) from exc
	except httpx.RequestError as exc:
		await _handle_request_error(exc)
		raise  # for mypy

	return UserOut.model_validate(response.json())


async def fetch_user_by_login(login: str) -> dict | None:
	"""
	Получает пользователя по логину (email/username).
	Возвращает словарь с данными (включая hashed_password) или None, если пользователь не найден.
	"""
	try:
		client = await get_users_client()
	except RuntimeError as exc:
		raise _handle_configuration_error(exc) from exc
	try:
		response = await client.get(f"/internal/users/by-login/{login}")
		response.raise_for_status()
	except httpx.HTTPStatusError as exc:
		if exc.response.status_code == status.HTTP_404_NOT_FOUND:
			return None
		raise HTTPException(
			status.HTTP_502_BAD_GATEWAY,
			detail=f"Ошибка при запросе пользователя: {exc.response.status_code}",
		) from exc
	except httpx.RequestError as exc:
		await _handle_request_error(exc)
		raise

	return response.json()


async def fetch_user_by_id(user_id: int) -> UserOut:
	"""
	Получает пользователя по ID через users_service.
	"""
	try:
		client = await get_users_client()
	except RuntimeError as exc:
		raise _handle_configuration_error(exc) from exc
	try:
		response = await client.get(f"/internal/users/{user_id}")
		response.raise_for_status()
	except httpx.HTTPStatusError as exc:
		if exc.response.status_code == status.HTTP_404_NOT_FOUND:
			raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Пользователь не найден") from exc
		raise HTTPException(
			status.HTTP_502_BAD_GATEWAY,
			detail=f"Ошибка при запросе пользователя: {exc.response.status_code}",
		) from exc
	except httpx.RequestError as exc:
		await _handle_request_error(exc)
		raise

	return UserOut.model_validate(response.json())

