from datetime import datetime, timezone
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas import LoginInput, RefreshInput, Token, UserCreate, UserOut
from ..security import (
	RefreshTokenError,
	create_access_token,
	create_refresh_token,
	get_current_user,
	get_password_hash,
	validate_refresh_token,
	verify_password,
)
from ..services.users_api import create_user, fetch_user_by_id, fetch_user_by_login

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


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate) -> UserOut:
	email = user_in.email.lower()
	username = _sanitize_username(getattr(user_in, "username", None), email)
	hashed_password = get_password_hash(user_in.password)
	return await create_user(username=username, email=email, hashed_password=hashed_password)


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
	access = create_access_token(user_id)
	refresh = await create_refresh_token(db, user_id)
	return Token(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=Token)
async def refresh(data: RefreshInput, db: AsyncSession = Depends(get_db)) -> Token:
	try:
		token_record = await validate_refresh_token(db, data.refresh_token)
	except RefreshTokenError as exc:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.detail)

	user = await fetch_user_by_id(token_record.user_id)
	if not user.is_active:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден или неактивен"
		)

	token_record.revoked = True
	token_record.revoked_at = datetime.now(timezone.utc)

	access = create_access_token(user.id)
	refresh_token = await create_refresh_token(db, user.id)
	return Token(access_token=access, refresh_token=refresh_token)


@router.get("/me", response_model=UserOut)
async def me(current_user: UserOut = Depends(get_current_user)) -> UserOut:
	return current_user




