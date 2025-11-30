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


async def _ensure_unique_username(base: str, db: AsyncSession) -> str:
	"""Подбирает уникальный username, добавляя суффиксы при необходимости."""
	candidate = base
	suffix = 1
	while True:
		stmt = select(User.id).where(func.lower(User.username) == candidate.lower())
		exists = await db.scalar(stmt)
		if not exists:
			return candidate
		suffix += 1
		suffix_str = f"-{suffix}"
		max_len = 32 - len(suffix_str)
		candidate = f"{base[:max_len]}{suffix_str}"


@router.post(
	"",
	response_model=InternalUser,
	status_code=status.HTTP_201_CREATED,
	dependencies=[Depends(verify_internal_token)],
)
async def create_user(data: InternalUserCreate, db: AsyncSession = Depends(get_db)) -> InternalUser:
	email = data.email.lower()
	username = _sanitize_username(data.username, email)

	# Проверяем уникальность email и username
	stmt_email = select(User.id).where(func.lower(User.email) == email)
	if await db.scalar(stmt_email):
		raise HTTPException(status.HTTP_409_CONFLICT, detail="Email уже зарегистрирован")

	username = await _ensure_unique_username(username, db)

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

