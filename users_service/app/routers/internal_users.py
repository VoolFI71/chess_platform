from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User
from ..schemas import InternalUser, InternalUserCreate
from ..security import verify_internal_token
from ..utils import build_internal_user

router = APIRouter(prefix="/internal/users", tags=["internal-users"])

USERNAME_ALLOWED_RE = re.compile(r"[^A-Za-z0-9_.-]+")


def _sanitize_username(raw: str, email: str) -> str:
	"""
	Проводит лёгкую очистку username: заменяет запрещённые символы, обрезает длину,
	подставляет имя из email, если username пустой.
	"""
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


@router.post(
	"",
	response_model=InternalUser,
	status_code=status.HTTP_201_CREATED,
	dependencies=[Depends(verify_internal_token)],
)
async def create_user(data: InternalUserCreate, db: AsyncSession = Depends(get_db)) -> InternalUser:
	email = data.email.lower()
	username = _sanitize_username(data.username, email)

	# Проверяем уникальность email
	stmt_email = select(User.id).where(func.lower(User.email) == email)
	if await db.scalar(stmt_email):
		raise HTTPException(status.HTTP_409_CONFLICT, detail="Email уже зарегистрирован")

	# Проверяем уникальность username (case-insensitive)
	stmt_username = select(User.id).where(func.lower(User.username) == username.lower())
	if await db.scalar(stmt_username):
		raise HTTPException(status.HTTP_409_CONFLICT, detail="Имя пользователя уже занято")

	user = User(
		email=email,
		username=username,
		hashed_password=data.hashed_password,
	)
	db.add(user)
	await db.commit()
	await db.refresh(user)

	return build_internal_user(user, include_secret=True)


@router.get(
	"/by-login/{login}",
	response_model=InternalUser,
	dependencies=[Depends(verify_internal_token)],
)
async def get_user_by_login(login: str, db: AsyncSession = Depends(get_db)) -> InternalUser:
	login_value = login.strip().lower()
	if not login_value:
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Логин не может быть пустым")

	stmt = select(User).where(
		(func.lower(User.email) == login_value) | (func.lower(User.username) == login_value)
	)
	result = await db.execute(stmt)
	user = result.scalar_one_or_none()
	if not user:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

	return build_internal_user(user, include_secret=True)


@router.get(
	"/{user_id}",
	response_model=InternalUser,
	dependencies=[Depends(verify_internal_token)],
)
async def get_user_by_id(user_id: int, db: AsyncSession = Depends(get_db)) -> InternalUser:
	user = await db.get(User, user_id)
	if not user:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

	return build_internal_user(user, include_secret=False)


@router.put(
	"/{user_id}/password",
	dependencies=[Depends(verify_internal_token)],
)
async def update_user_password(
	user_id: int, data: dict[str, str], db: AsyncSession = Depends(get_db)
) -> dict[str, str]:
	"""
	Обновляет пароль пользователя.
	Ожидает в теле запроса: {"hashed_password": "..."}
	"""
	user = await db.get(User, user_id)
	if not user:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

	hashed_password = data.get("hashed_password")
	if not hashed_password:
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="hashed_password обязателен")

	user.hashed_password = hashed_password
	await db.commit()

	return {"message": "Пароль успешно обновлён"}
