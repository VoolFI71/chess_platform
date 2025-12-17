from datetime import datetime, timezone
import httpx
import random
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import VerificationCode
from ..schemas import (
	LoginInput,
	PasswordResetRequest,
	PasswordResetResponse,
	RefreshInput,
	RegisterWithCodeRequest,
	ResetPasswordRequest,
	Token,
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


@router.post("/login", response_model=Token)
async def login(data: LoginInput, db: AsyncSession = Depends(get_db)) -> Token:
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
	return Token(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=Token)
async def refresh(data: RefreshInput, db: AsyncSession = Depends(get_db)) -> Token:
	try:
		token_record = await validate_refresh_token(db, data.refresh_token)
	except RefreshTokenError as exc:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.detail)

	# ОПТИМИЗАЦИЯ: Убираем fetch_user_by_id - is_active уже проверен в validate_refresh_token из JWT payload
	# Это ускоряет эндпоинт на 10-50ms, убирая HTTP запрос к users_service

	# ОПТИМИЗАЦИЯ: UPDATE старого токена
	token_record.revoked = True
	token_record.revoked_at = datetime.now(timezone.utc)

	# ОПТИМИЗАЦИЯ: Получаем is_active из payload старого токена для нового токена
	from ..security import decode_token

	payload = decode_token(data.refresh_token)
	is_active = payload.get("is_active", True)

	access = create_access_token(token_record.user_id)
	# ОПТИМИЗАЦИЯ: Не коммитим внутри create_refresh_token, сделаем один COMMIT для UPDATE + INSERT
	refresh_token = await create_refresh_token(
		db, token_record.user_id, is_active=is_active, commit=False
	)
	# Один COMMIT для обеих операций (UPDATE старого токена + INSERT нового токена)
	await db.commit()
	return Token(access_token=access, refresh_token=refresh_token)


@router.get("/me", response_model=UserOut)
async def me(current_user: UserOut = Depends(get_current_user)) -> UserOut:
	return current_user


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




