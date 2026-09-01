from datetime import datetime, timezone
import httpx
import random
import re
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Response, status, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models import VerificationCode
from ..schemas import (
	LoginInput,
	PasswordResetRequest,
	PasswordResetResponse,
	AuthSuccess,
	RegisterWithCodeRequest,
	ResetPasswordRequest,
	UserCreate,
	UserOut,
	VerifyResetCodeRequest,
)
from ..security import (
	RefreshTokenError,
	create_access_token,
	create_refresh_token,
	get_current_user,
	get_password_hash,
	validate_refresh_token,
	verify_password,
)
from ..services.email_api import send_verification_code_email
from ..services.users_api import create_user, fetch_user_by_login

USERNAME_ALLOWED_RE = re.compile(r"[^A-Za-z0-9_.-]+")


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
	"""Store application tokens in HttpOnly cookies while keeping JSON compatibility."""
	settings = get_settings()
	secure = settings.environment.lower() == "production"
	response.set_cookie(
		"access_token",
		access_token,
		max_age=settings.access_token_expire_minutes * 60,
		http_only=True,
		secure=secure,
		samesite="lax",
		path="/",
	)
	response.set_cookie(
		"refresh_token",
		refresh_token,
		max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
		http_only=True,
		secure=secure,
		samesite="lax",
		path="/api/auth",
	)


def _clear_auth_cookies(response: Response) -> None:
	response.delete_cookie("access_token", path="/")
	response.delete_cookie("refresh_token", path="/api/auth")


def _generate_oauth_username() -> str:
	"""
	Генерирует username для OAuth регистрации в формате: user + случайное 10-значное число.
	Пример: user1938475618
	"""
	return f"user{random.randint(1000000000, 9999999999)}"


async def _generate_unique_oauth_username() -> str:
	"""
	Генерирует уникальный username для OAuth регистрации.
	Проверяет уникальность через users_service (с запасом на случай коллизий).
	"""
	max_attempts = 10  # Максимум попыток на случай редких коллизий
	for _ in range(max_attempts):
		username = _generate_oauth_username()
		# Проверяем, существует ли пользователь с таким username
		user_data = await fetch_user_by_login(username)
		if not user_data:
			return username
	# Если все попытки исчерпаны (крайне маловероятно), возвращаем последний сгенерированный
	# В этом случае create_user выдаст ошибку о дубликате, но это практически невозможно
	return _generate_oauth_username()


def _sanitize_username(raw: str | None, email: str) -> str:
	base = (raw or "").strip()
	if not base:
		base = email.split("@", 1)[0]
	base = USERNAME_ALLOWED_RE.sub("-", base)
	base = base.strip("-_.")
	if len(base) < 3:
		base = (base + "user") if base else "user"
	base = base[:32]
	if len(base) < 3:
		base = base.ljust(3, "0")
	return base


@router.post("/register", response_model=PasswordResetResponse)
async def register(
	user_in: UserCreate,
	db: AsyncSession = Depends(get_db),
) -> PasswordResetResponse:
	"""
	Регистрация: отправляет код верификации на email.
	После получения кода пользователь должен вызвать /register-verify-code для завершения регистрации.
	"""
	email = user_in.email.lower()
	
	# Проверяем, не существует ли уже пользователь с таким email
	existing_user = await fetch_user_by_login(email)
	if existing_user:
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="Пользователь с таким email уже зарегистрирован",
		)
	
	# Генерируем 6-значный код
	code = f"{random.randint(100000, 999999)}"
	
	# Удаляем старые неиспользованные коды для этого email
	stmt = delete(VerificationCode).where(
		VerificationCode.email == email,
		VerificationCode.purpose == "registration",
		VerificationCode.used == False,
	)
	await db.execute(stmt)
	await db.flush()
	
	# Создаём новый код верификации для регистрации
	verification_code = VerificationCode.create_for_registration(
		email=email, code=code, expires_in_minutes=10
	)
	# Сохраняем данные регистрации в коде (временное решение, лучше использовать отдельную таблицу)
	# Пока что сохраняем хеш пароля и username в purpose или создаём отдельное поле
	# Для простоты используем временное хранилище или Redis, но сейчас используем код
	
	# Временно храним данные регистрации в metadata кода
	# Но у нас нет поля metadata, поэтому используем другой подход:
	# Создаём код с purpose="registration", а данные будем передавать при верификации
	# Или создаём отдельную таблицу для временных данных регистрации
	
	# Пока что просто отправляем код, данные регистрации будем передавать при верификации
	db.add(verification_code)
	await db.commit()
	
	# Отправляем код на email
	username = _sanitize_username(getattr(user_in, "username", None), email)
	try:
		await send_verification_code_email(
			email,
			username,
			code,
			expires_in_minutes=10,
			purpose="Для завершения регистрации используйте следующий код:",
		)
	except HTTPException:
		# Удаляем код, если не удалось отправить письмо
		await db.delete(verification_code)
		await db.commit()
		raise
	
	return PasswordResetResponse(
		message="Код подтверждения отправлен на вашу почту. Введите его для завершения регистрации."
	)


@router.post("/register-verify-code", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register_verify_code(
	request: RegisterWithCodeRequest,
	db: AsyncSession = Depends(get_db),
) -> UserOut:
	"""
	Завершает регистрацию: проверяет код и создаёт пользователя.
	"""
	email = request.email.lower()
	code = request.code
	username = _sanitize_username(request.username, email)
	
	# Проверяем код верификации
	stmt = select(VerificationCode).where(
		VerificationCode.email == email,
		VerificationCode.code == code,
		VerificationCode.purpose == "registration",
	)
	verification_code = await db.scalar(stmt)
	
	if not verification_code or not verification_code.is_valid():
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Неверный или истёкший код верификации",
		)
	
	# Проверяем, не зарегистрировался ли уже пользователь
	existing_user = await fetch_user_by_login(email)
	if existing_user:
		# Помечаем код как использованный
		verification_code.used = True
		await db.commit()
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="Пользователь с таким email уже зарегистрирован",
		)
	
	# Создаём пользователя
	hashed_password = get_password_hash(request.password)
	try:
		user = await create_user(username=username, email=email, hashed_password=hashed_password)
	except HTTPException as exc:
		# Обрабатываем race condition: если пользователь был создан между проверкой и созданием
		if exc.status_code == status.HTTP_409_CONFLICT:
			# Пользователь уже существует - помечаем код как использованный
			verification_code.used = True
			await db.commit()
			# Возвращаем 409 Conflict - пользователь уже зарегистрирован
			raise HTTPException(
				status_code=status.HTTP_409_CONFLICT,
				detail="Пользователь с таким email уже зарегистрирован",
			)
		# Для других ошибок пробрасываем как есть
		raise
	
	# Помечаем код как использованный
	verification_code.used = True
	await db.commit()
	
	return user


@router.post("/login", response_model=AuthSuccess)
async def login(
	data: LoginInput,
	response: Response,
	db: AsyncSession = Depends(get_db),
) -> AuthSuccess:
	login_value = data.login.strip().lower()
	user_data = await fetch_user_by_login(login_value)

	if not user_data or not verify_password(data.password, user_data["hashed_password"]):
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")

	if not user_data.get("is_active", True):
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден или неактивен"
		)

	user_id = int(user_data["id"])
	is_active = user_data.get("is_active", True)
	access = create_access_token(user_id)
	# ОПТИМИЗАЦИЯ: Передаем is_active в create_refresh_token для хранения в JWT payload
	refresh = await create_refresh_token(db, user_id, is_active=is_active)
	_set_auth_cookies(response, access, refresh)
	return AuthSuccess()


@router.post("/refresh", response_model=AuthSuccess)
async def refresh(
	request: Request,
	response: Response,
	db: AsyncSession = Depends(get_db),
) -> AuthSuccess:
	refresh_token_input = request.cookies.get("refresh_token")
	if not refresh_token_input:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh-токен отсутствует")
	try:
		token_record = await validate_refresh_token(db, refresh_token_input)
	except RefreshTokenError as exc:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.detail)

	# ОПТИМИЗАЦИЯ: Убираем fetch_user_by_id - is_active уже проверен в validate_refresh_token из JWT payload
	# Это ускоряет эндпоинт на 10-50ms, убирая HTTP запрос к users_service

	# ОПТИМИЗАЦИЯ: UPDATE старого токена
	token_record.revoked = True
	token_record.revoked_at = datetime.now(timezone.utc)

	# ОПТИМИЗАЦИЯ: Получаем is_active из payload старого токена для нового токена
	from ..security import decode_token

	payload = decode_token(refresh_token_input)
	is_active = payload.get("is_active", True)

	access = create_access_token(token_record.user_id)
	# ОПТИМИЗАЦИЯ: Не коммитим внутри create_refresh_token, сделаем один COMMIT для UPDATE + INSERT
	refresh_token = await create_refresh_token(
		db, token_record.user_id, is_active=is_active, commit=False
	)
	# Один COMMIT для обеих операций (UPDATE старого токена + INSERT нового токена)
	await db.commit()
	_set_auth_cookies(response, access, refresh_token)
	return AuthSuccess()


@router.get("/me", response_model=UserOut)
async def me(current_user: UserOut = Depends(get_current_user)) -> UserOut:
	return current_user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
	_clear_auth_cookies(response)


@router.post("/request-password-reset", response_model=PasswordResetResponse)
async def request_password_reset(
	request: PasswordResetRequest,
	db: AsyncSession = Depends(get_db),
) -> PasswordResetResponse:
	"""
	Запрашивает восстановление пароля.
	Проверяет существование пользователя с указанным email и отправляет код верификации.
	"""
	email = request.email.lower()

	# Проверяем существование пользователя
	user_data = await fetch_user_by_login(email)
	if not user_data:
		# Для безопасности не раскрываем, существует ли пользователь
		return PasswordResetResponse(
			message="Если аккаунт с указанным email существует, на него будет отправлен код верификации."
		)

	username = user_data.get("username", email.split("@")[0])

	# Генерируем 6-значный код
	code = f"{random.randint(100000, 999999)}"

	# Удаляем старые неиспользованные коды для этого email
	stmt = delete(VerificationCode).where(
		VerificationCode.email == email,
		VerificationCode.purpose == "password_reset",
		VerificationCode.used == False,
	)
	await db.execute(stmt)
	await db.flush()  # Применяем удаление перед добавлением нового

	# Создаём новый код верификации
	verification_code = VerificationCode.create_for_password_reset(
		email=email, code=code, expires_in_minutes=10
	)
	db.add(verification_code)
	await db.commit()

	# Отправляем код на email
	try:
		await send_verification_code_email(email, username, code, expires_in_minutes=10)
	except HTTPException:
		# Удаляем код, если не удалось отправить письмо
		await db.delete(verification_code)
		await db.commit()
		raise

	return PasswordResetResponse(
		message="Если аккаунт с указанным email существует, на него будет отправлен код верификации."
	)


@router.post("/verify-reset-code", response_model=PasswordResetResponse)
async def verify_reset_code(
	request: VerifyResetCodeRequest,
	db: AsyncSession = Depends(get_db),
) -> PasswordResetResponse:
	"""
	Проверяет код верификации для восстановления пароля.
	"""
	email = request.email.lower()
	code = request.code

	# Ищем код верификации
	stmt = select(VerificationCode).where(
		VerificationCode.email == email,
		VerificationCode.code == code,
		VerificationCode.purpose == "password_reset",
	)
	verification_code = await db.scalar(stmt)

	if not verification_code or not verification_code.is_valid():
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Неверный или истёкший код верификации",
		)

	return PasswordResetResponse(message="Код верификации подтверждён. Теперь вы можете установить новый пароль.")


@router.post("/reset-password", response_model=PasswordResetResponse)
async def reset_password(
	request: ResetPasswordRequest,
	db: AsyncSession = Depends(get_db),
) -> PasswordResetResponse:
	"""
	Восстанавливает пароль с использованием кода верификации.
	"""
	email = request.email.lower()
	code = request.code
	new_password = request.new_password

	# Проверяем код верификации
	stmt = select(VerificationCode).where(
		VerificationCode.email == email,
		VerificationCode.code == code,
		VerificationCode.purpose == "password_reset",
	)
	verification_code = await db.scalar(stmt)

	if not verification_code or not verification_code.is_valid():
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Неверный или истёкший код верификации",
		)

	# Получаем пользователя
	user_data = await fetch_user_by_login(email)
	if not user_data:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

	# Обновляем пароль через users_service
	from ..clients.users import get_users_client

	hashed_password = get_password_hash(new_password)

	try:
		client = await get_users_client()
		response = await client.put(
			f"/internal/users/{user_data['id']}/password",
			json={"hashed_password": hashed_password},
		)
		response.raise_for_status()
	except httpx.HTTPStatusError as exc:
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail=f"Ошибка при обновлении пароля: {exc.response.status_code}",
		) from exc
	except httpx.RequestError as exc:
		raise HTTPException(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			detail=f"Сервис пользователей недоступен: {exc}",
		) from exc

	# Помечаем код как использованный
	verification_code.used = True
	await db.commit()

	return PasswordResetResponse(message="Пароль успешно изменён. Теперь вы можете войти с новым паролем.")


# Mail.ru OAuth endpoints

@router.get("/mailru/authorize")
async def mailru_authorize(request: Request):
	"""
	Инициациирует OAuth авторизацию через Mail.ru.
	Редиректит пользователя на страницу авторизации Mail.ru.
	"""
	settings = get_settings()
	
	if not settings.mailru_oauth_client_id:
		raise HTTPException(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			detail="Mail.ru OAuth не настроен"
		)
	
	# Генерируем state для защиты от CSRF
	state = secrets.token_urlsafe(32)
	
	# Сохраняем state в cookie или session (для простоты используем cookie через редирект)
	# В production лучше использовать session storage
	
	# Формируем URL для авторизации
	redirect_uri = settings.mailru_oauth_redirect_uri or f"{request.base_url}api/auth/mailru/callback"
	
	params = {
		"client_id": settings.mailru_oauth_client_id,
		"response_type": "code",
		"redirect_uri": redirect_uri,
		"state": state,
		"scope": "userinfo",  # Запрашиваем доступ к userinfo
	}
	
	auth_url = f"{settings.mailru_oauth_authorization_url}?{urlencode(params)}"
	
	# Редиректим с state в cookie
	response = RedirectResponse(url=auth_url)
	response.set_cookie(
		key="oauth_state",
		value=state,
		max_age=600,  # 10 минут
		httponly=True,
		samesite="lax",
		secure=True  # В production используйте HTTPS
	)
	return response


@router.get("/mailru/callback")
async def mailru_callback(
	code: str,
	state: str,
	request: Request,
	db: AsyncSession = Depends(get_db),
):
	"""
	Обрабатывает callback от Mail.ru после авторизации.
	Обменивает code на access_token, получает данные пользователя,
	создает/находит пользователя и выдает JWT токены.
	Делает редирект на фронтенд после установки HttpOnly-cookie.
	"""
	settings = get_settings()
	
	# Проверяем state для защиты от CSRF
	cookie_state = request.cookies.get("oauth_state")
	if not cookie_state or cookie_state != state:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Неверный state параметр"
		)
	
	if not settings.mailru_oauth_client_id or not settings.mailru_oauth_client_secret:
		raise HTTPException(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			detail="Mail.ru OAuth не настроен"
		)
	
	redirect_uri = settings.mailru_oauth_redirect_uri or f"{request.base_url}api/auth/mailru/callback"
	
	# Обмениваем code на access_token
	token_data = {
		"grant_type": "authorization_code",
		"code": code,
		"redirect_uri": redirect_uri,
		"client_id": settings.mailru_oauth_client_id,
		"client_secret": settings.mailru_oauth_client_secret,
	}
	
	try:
		token_response = await httpx.AsyncClient().post(
			settings.mailru_oauth_token_url,
			data=token_data,
			headers={"Content-Type": "application/x-www-form-urlencoded"},
		)
		token_response.raise_for_status()
		token_result = token_response.json()
		access_token = token_result.get("access_token")
		
		if not access_token:
			raise HTTPException(
				status_code=status.HTTP_400_BAD_REQUEST,
				detail="Не удалось получить access_token от Mail.ru"
			)
	except httpx.HTTPStatusError as exc:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=f"Ошибка при обмене code на token: {exc.response.status_code}"
		)
	
	# Получаем данные пользователя
	try:
		userinfo_response = await httpx.AsyncClient().get(
			settings.mailru_oauth_userinfo_url,
			params={"access_token": access_token},
		)
		userinfo_response.raise_for_status()
		userinfo = userinfo_response.json()
	except httpx.HTTPStatusError as exc:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=f"Ошибка при получении данных пользователя: {exc.response.status_code}"
		)
	
	# Извлекаем email (обязательное поле)
	email = userinfo.get("email", "").lower().strip()
	if not email:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Email не предоставлен Mail.ru"
		)
	
	# Проверяем, существует ли пользователь с таким email
	existing_user_data = await fetch_user_by_login(email)
	
	if existing_user_data:
		# Пользователь уже существует - выдаем токены
		user_id = int(existing_user_data["id"])
		is_active = existing_user_data.get("is_active", True)
		
		if not is_active:
			raise HTTPException(
				status_code=status.HTTP_401_UNAUTHORIZED,
				detail="Пользователь неактивен"
			)
		
		access = create_access_token(user_id)
		refresh = await create_refresh_token(db, user_id, is_active=is_active)
	else:
		# Создаем нового пользователя
		username = await _generate_unique_oauth_username()
		
		# Генерируем случайный пароль (для OAuth пользователей пароль не используется, но требуется в схеме)
		random_password = secrets.token_urlsafe(32)
		hashed_password = get_password_hash(random_password)
		
		try:
			user = await create_user(
				username=username,
				email=email,
				hashed_password=hashed_password,
			)
			user_id = user.id
		except HTTPException as exc:
			if exc.status_code == status.HTTP_409_CONFLICT:
				# Race condition: пользователь был создан между проверкой и созданием
				existing_user_data = await fetch_user_by_login(email)
				if not existing_user_data:
					raise HTTPException(
						status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
						detail="Ошибка при создании пользователя"
					)
				user_id = int(existing_user_data["id"])
			else:
				raise
		
		access = create_access_token(user_id)
		refresh = await create_refresh_token(db, user_id, is_active=True)
	
	# Токены уже установлены в HttpOnly-cookie; не передаём их через URL.
	response = RedirectResponse(url="/")
	_set_auth_cookies(response, access, refresh)
	response.set_cookie("oauth_state", "", max_age=0)  # Очищаем cookie
	return response


class MailruTokenRequest(BaseModel):
	access_token: str = Field(..., description="Access token от Mail.ru SDK")


@router.post("/mailru/token", response_model=AuthSuccess)
async def mailru_token(
	request: MailruTokenRequest,
	response: Response,
	db: AsyncSession = Depends(get_db),
):
	"""
	Принимает access_token от Mail.ru SDK (полученный на фронтенде).
	Получает данные пользователя, создает/находит пользователя и выдает JWT токены.
	"""
	settings = get_settings()
	access_token = request.access_token
	
	# Получаем данные пользователя от Mail.ru
	try:
		userinfo_response = await httpx.AsyncClient().get(
			settings.mailru_oauth_userinfo_url,
			params={"access_token": access_token},
		)
		userinfo_response.raise_for_status()
		userinfo = userinfo_response.json()
	except httpx.HTTPStatusError as exc:
		if exc.response.status_code == 401:
			raise HTTPException(
				status_code=status.HTTP_401_UNAUTHORIZED,
				detail="Недействительный access_token от Mail.ru"
			)
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=f"Ошибка при получении данных пользователя: {exc.response.status_code}"
		)
	
	# Извлекаем email (обязательное поле)
	email = userinfo.get("email", "").lower().strip()
	if not email:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Email не предоставлен Mail.ru"
		)
	
	# Проверяем, существует ли пользователь с таким email
	existing_user_data = await fetch_user_by_login(email)
	
	if existing_user_data:
		# Пользователь уже существует - выдаем токены
		user_id = int(existing_user_data["id"])
		is_active = existing_user_data.get("is_active", True)
		
		if not is_active:
			raise HTTPException(
				status_code=status.HTTP_401_UNAUTHORIZED,
				detail="Пользователь неактивен"
			)
		
		access = create_access_token(user_id)
		refresh = await create_refresh_token(db, user_id, is_active=is_active)
	else:
		# Создаем нового пользователя
		username = await _generate_unique_oauth_username()
		
		# Генерируем случайный пароль (для OAuth пользователей пароль не используется, но требуется в схеме)
		random_password = secrets.token_urlsafe(32)
		hashed_password = get_password_hash(random_password)
		
		try:
			user = await create_user(
				username=username,
				email=email,
				hashed_password=hashed_password,
			)
			user_id = user.id
		except HTTPException as exc:
			if exc.status_code == status.HTTP_409_CONFLICT:
				# Race condition: пользователь был создан между проверкой и созданием
				existing_user_data = await fetch_user_by_login(email)
				if not existing_user_data:
					raise HTTPException(
						status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
						detail="Ошибка при создании пользователя"
					)
				user_id = int(existing_user_data["id"])
			else:
				raise
		
		access = create_access_token(user_id)
		refresh = await create_refresh_token(db, user_id, is_active=True)
	
	_set_auth_cookies(response, access, refresh)
	return AuthSuccess()


# ========== Google OAuth ==========

@router.get("/google/authorize")
async def google_authorize(request: Request):
	"""
	Инициациирует OAuth авторизацию через Google.
	Редиректит пользователя на страницу авторизации Google.
	"""
	settings = get_settings()
	
	if not settings.google_oauth_client_id:
		raise HTTPException(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			detail="Google OAuth не настроен"
		)
	
	# Генерируем state для защиты от CSRF
	state = secrets.token_urlsafe(32)
	
	# Формируем URL для авторизации
	redirect_uri = settings.google_oauth_redirect_uri or f"{request.base_url}api/auth/google/callback"
	
	params = {
		"client_id": settings.google_oauth_client_id,
		"response_type": "code",
		"redirect_uri": redirect_uri,
		"scope": "openid email profile",
		"state": state,
		"access_type": "online",  # offline для refresh token (если нужен)
		"prompt": "select_account",  # Запрашиваем выбор аккаунта
	}
	
	auth_url = f"{settings.google_oauth_authorization_url}?{urlencode(params)}"
	
	# Редиректим с state в cookie
	response = RedirectResponse(url=auth_url)
	response.set_cookie(
		key="oauth_state",
		value=state,
		max_age=600,  # 10 минут
		httponly=True,
		samesite="lax",
		secure=True  # В production используйте HTTPS
	)
	return response


@router.get("/google/callback")
async def google_callback(
	code: str,
	state: str,
	request: Request,
	db: AsyncSession = Depends(get_db),
):
	"""
	Обрабатывает callback от Google после авторизации.
	Обменивает code на access_token, получает данные пользователя,
	создает/находит пользователя и выдает JWT токены.
	Делает редирект на фронтенд после установки HttpOnly-cookie.
	"""
	settings = get_settings()
	
	# Проверяем state для защиты от CSRF
	cookie_state = request.cookies.get("oauth_state")
	if not cookie_state or cookie_state != state:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Неверный state параметр"
		)
	
	if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
		raise HTTPException(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			detail="Google OAuth не настроен"
		)
	
	redirect_uri = settings.google_oauth_redirect_uri or f"{request.base_url}api/auth/google/callback"
	
	# Обмениваем code на access_token
	token_data = {
		"code": code,
		"client_id": settings.google_oauth_client_id,
		"client_secret": settings.google_oauth_client_secret,
		"redirect_uri": redirect_uri,
		"grant_type": "authorization_code",
	}
	
	try:
		token_response = await httpx.AsyncClient().post(
			settings.google_oauth_token_url,
			data=token_data,
			headers={"Content-Type": "application/x-www-form-urlencoded"},
		)
		token_response.raise_for_status()
		token_result = token_response.json()
		access_token = token_result.get("access_token")
		
		if not access_token:
			raise HTTPException(
				status_code=status.HTTP_400_BAD_REQUEST,
				detail="Не удалось получить access_token от Google"
			)
	except httpx.HTTPStatusError as exc:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=f"Ошибка при обмене code на token: {exc.response.status_code}"
		)
	
	# Получаем данные пользователя
	try:
		userinfo_response = await httpx.AsyncClient().get(
			settings.google_oauth_userinfo_url,
			headers={"Authorization": f"Bearer {access_token}"},
		)
		userinfo_response.raise_for_status()
		userinfo = userinfo_response.json()
	except httpx.HTTPStatusError as exc:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=f"Ошибка при получении данных пользователя: {exc.response.status_code}"
		)
	
	# Извлекаем email (обязательное поле)
	email = userinfo.get("email", "").lower().strip()
	if not email:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Email не предоставлен Google"
		)
	
	# Проверяем, существует ли пользователь с таким email
	existing_user_data = await fetch_user_by_login(email)
	
	if existing_user_data:
		# Пользователь уже существует - выдаем токены
		user_id = int(existing_user_data["id"])
		is_active = existing_user_data.get("is_active", True)
		
		if not is_active:
			raise HTTPException(
				status_code=status.HTTP_401_UNAUTHORIZED,
				detail="Пользователь неактивен"
			)
		
		access = create_access_token(user_id)
		refresh = await create_refresh_token(db, user_id, is_active=is_active)
	else:
		# Создаем нового пользователя
		username = await _generate_unique_oauth_username()
		
		# Генерируем случайный пароль (для OAuth пользователей пароль не используется, но требуется в схеме)
		random_password = secrets.token_urlsafe(32)
		hashed_password = get_password_hash(random_password)
		
		try:
			user = await create_user(
				username=username,
				email=email,
				hashed_password=hashed_password,
			)
			user_id = user.id
		except HTTPException as exc:
			if exc.status_code == status.HTTP_409_CONFLICT:
				# Race condition: пользователь был создан между проверкой и созданием
				existing_user_data = await fetch_user_by_login(email)
				if not existing_user_data:
					raise HTTPException(
						status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
						detail="Ошибка при создании пользователя"
					)
				user_id = int(existing_user_data["id"])
			else:
				raise
		
		access = create_access_token(user_id)
		refresh = await create_refresh_token(db, user_id, is_active=True)
	
	# Токены уже установлены в HttpOnly-cookie; не передаём их через URL.
	response = RedirectResponse(url="/")
	_set_auth_cookies(response, access, refresh)
	response.set_cookie("oauth_state", "", max_age=0)  # Очищаем cookie
	return response


class GoogleTokenRequest(BaseModel):
	access_token: str = Field(..., description="Access token от Google SDK")


@router.post("/google/token", response_model=AuthSuccess)
async def google_token(
	request: GoogleTokenRequest,
	response: Response,
	db: AsyncSession = Depends(get_db),
):
	"""
	Принимает access_token от Google SDK (полученный на фронтенде).
	Получает данные пользователя, создает/находит пользователя и выдает JWT токены.
	"""
	settings = get_settings()
	access_token = request.access_token
	
	# Получаем данные пользователя от Google
	try:
		userinfo_response = await httpx.AsyncClient().get(
			settings.google_oauth_userinfo_url,
			headers={"Authorization": f"Bearer {access_token}"},
		)
		userinfo_response.raise_for_status()
		userinfo = userinfo_response.json()
	except httpx.HTTPStatusError as exc:
		if exc.response.status_code == 401:
			raise HTTPException(
				status_code=status.HTTP_401_UNAUTHORIZED,
				detail="Недействительный access_token от Google"
			)
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=f"Ошибка при получении данных пользователя: {exc.response.status_code}"
		)
	
	# Извлекаем email (обязательное поле)
	email = userinfo.get("email", "").lower().strip()
	if not email:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Email не предоставлен Google"
		)
	
	# Проверяем, существует ли пользователь с таким email
	existing_user_data = await fetch_user_by_login(email)
	
	if existing_user_data:
		# Пользователь уже существует - выдаем токены
		user_id = int(existing_user_data["id"])
		is_active = existing_user_data.get("is_active", True)
		
		if not is_active:
			raise HTTPException(
				status_code=status.HTTP_401_UNAUTHORIZED,
				detail="Пользователь неактивен"
			)
		
		access = create_access_token(user_id)
		refresh = await create_refresh_token(db, user_id, is_active=is_active)
	else:
		# Создаем нового пользователя
		username = await _generate_unique_oauth_username()
		
		# Генерируем случайный пароль (для OAuth пользователей пароль не используется, но требуется в схеме)
		random_password = secrets.token_urlsafe(32)
		hashed_password = get_password_hash(random_password)
		
		try:
			user = await create_user(
				username=username,
				email=email,
				hashed_password=hashed_password,
			)
			user_id = user.id
		except HTTPException as exc:
			if exc.status_code == status.HTTP_409_CONFLICT:
				# Race condition: пользователь был создан между проверкой и созданием
				existing_user_data = await fetch_user_by_login(email)
				if not existing_user_data:
					raise HTTPException(
						status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
						detail="Ошибка при создании пользователя"
					)
				user_id = int(existing_user_data["id"])
			else:
				raise
		
		access = create_access_token(user_id)
		refresh = await create_refresh_token(db, user_id, is_active=True)
	
	_set_auth_cookies(response, access, refresh)
	return AuthSuccess()
