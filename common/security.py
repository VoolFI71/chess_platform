"""Общие функции безопасности для всех сервисов."""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt


bearer_scheme = HTTPBearer(auto_error=True)
optional_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
	"""Текущий пользователь из JWT токена."""
	id: int
	token: str


def decode_access_token(
	token: str,
	jwt_secret: str,
	jwt_algorithm: str = "HS256",
) -> CurrentUser:
	"""
	Декодирует и валидирует access токен.
	
	Args:
		token: JWT токен
		jwt_secret: Секретный ключ для подписи токена
		jwt_algorithm: Алгоритм подписи (по умолчанию HS256)
	
	Returns:
		CurrentUser: Объект с id пользователя и токеном
	
	Raises:
		HTTPException: Если токен невалиден, истек или имеет неверный тип
	"""
	try:
		payload = jwt.decode(token, jwt_secret, algorithms=[jwt_algorithm])
	except JWTError:
		raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")

	if payload.get("type") != "access":
		raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Неверный тип токена")

	exp = payload.get("exp")
	if exp and datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc):
		raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Токен истек")

	sub = payload.get("sub")
	if not sub:
		raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Неверный формат токена")

	return CurrentUser(id=int(sub), token=token)


def make_get_current_user(
	get_settings: Callable,
) -> Callable:
	"""
	Создает функцию get_current_user для использования в FastAPI зависимостях.
	
	Args:
		get_settings: Функция для получения настроек (должна возвращать объект с атрибутами:
			jwt_secret, jwt_algorithm)
	
	Returns:
		Функция get_current_user для использования в Depends()
	"""
	async def get_current_user(
		credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
	) -> CurrentUser:
		settings = get_settings()
		return decode_access_token(
			credentials.credentials,
			settings.jwt_secret,
			settings.jwt_algorithm,
		)
	
	return get_current_user


def make_get_current_user_id(
	get_current_user: Callable,
) -> Callable:
	"""
	Создает функцию get_current_user_id для получения только ID пользователя.
	
	Args:
		get_current_user: Функция get_current_user
	
	Returns:
		Функция get_current_user_id для использования в Depends()
	"""
	async def get_current_user_id(
		current_user: CurrentUser = Depends(get_current_user),
	) -> int:
		return current_user.id
	
	return get_current_user_id


def make_get_current_user_optional(
	get_settings: Callable,
) -> Callable:
	"""
	Создает опциональную функцию get_current_user, которая не требует аутентификацию.
	
	Args:
		get_settings: Функция для получения настроек
	
	Returns:
		Функция get_current_user_optional для использования в Depends()
	"""
	async def get_current_user_optional(
		credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer_scheme),
	) -> CurrentUser | None:
		if not credentials:
			return None
		settings = get_settings()
		try:
			return decode_access_token(
				credentials.credentials,
				settings.jwt_secret,
				settings.jwt_algorithm,
			)
		except HTTPException:
			return None
	
	return get_current_user_optional


def make_get_current_user_id_optional(
	get_current_user_optional: Callable,
) -> Callable:
	"""
	Создает опциональную функцию get_current_user_id, которая не требует аутентификацию.
	
	Args:
		get_current_user_optional: Функция get_current_user_optional
	
	Returns:
		Функция get_current_user_id_optional для использования в Depends()
	"""
	async def get_current_user_id_optional(
		current_user: CurrentUser | None = Depends(get_current_user_optional),
	) -> int | None:
		return current_user.id if current_user else None
	
	return get_current_user_id_optional

