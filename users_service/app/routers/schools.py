"""
CRUD API для школ. Доступ только для platform_admin.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from starlette.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import School, User
from ..schemas.school import SchoolCreate, SchoolOut, SchoolUpdate
from ..security import get_current_user_id


router = APIRouter(prefix="/api/schools", tags=["schools"])


async def require_platform_admin(
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> int:
	"""Проверяет, что текущий пользователь — platform_admin."""
	user = await db.get(User, current_user_id)
	if not user or not user.is_active:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
	if user.role != "platform_admin":
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Требуется роль platform_admin")
	return current_user_id


@router.get("/", response_model=list[SchoolOut])
async def list_schools(
	_: Annotated[int, Depends(require_platform_admin)],
	db: AsyncSession = Depends(get_db),
) -> list[SchoolOut]:
	"""Список всех школ."""
	stmt = select(School).order_by(School.id.asc())
	result = await db.execute(stmt)
	return list(result.scalars().all())


@router.get("/{school_id}", response_model=SchoolOut)
async def get_school(
	school_id: int,
	_: Annotated[int, Depends(require_platform_admin)],
	db: AsyncSession = Depends(get_db),
) -> SchoolOut:
	"""Получить школу по ID."""
	school = await db.get(School, school_id)
	if not school:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Школа не найдена")
	return school


async def require_school_access(
	school_id: int,
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> int:
	"""Проверяет доступ к школе: platform_admin или school_admin/coach своей школы."""
	user = await db.get(User, current_user_id)
	if not user or not user.is_active:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
	if user.role == "platform_admin":
		return current_user_id
	if user.school_id != school_id:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этой школе")
	if user.role not in ("school_admin", "coach"):
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Требуется роль school_admin или coach")
	return current_user_id


@router.get("/{school_id}/users", response_model=list[dict])
async def list_school_users(
	school_id: int,
	_: Annotated[int, Depends(require_school_access)],
	db: AsyncSession = Depends(get_db),
) -> list[dict]:
	"""Список пользователей школы (ученики для coach, все для school_admin)."""
	stmt = select(User).where(User.school_id == school_id, User.is_active == True).order_by(User.username)
	result = await db.execute(stmt)
	users = result.scalars().all()
	return [
		{
			"id": u.id,
			"username": u.username,
			"role": u.role,
			"blitz_rating": u.blitz_rating,
			"puzzle_rating": u.puzzle_rating,
		}
		for u in users
	]


@router.post("/", response_model=SchoolOut, status_code=status.HTTP_201_CREATED)
async def create_school(
	data: SchoolCreate,
	_: Annotated[int, Depends(require_platform_admin)],
	db: AsyncSession = Depends(get_db),
) -> SchoolOut:
	"""Создать новую школу."""
	stmt = select(School).where(School.slug == data.slug)
	if (await db.execute(stmt)).scalar_one_or_none():
		raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug уже существует")
	if data.subdomain:
		stmt = select(School).where(School.subdomain == data.subdomain)
		if (await db.execute(stmt)).scalar_one_or_none():
			raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Subdomain уже занят")

	school = School(
		name=data.name,
		slug=data.slug,
		subdomain=data.subdomain or None,
	)
	db.add(school)
	await db.commit()
	await db.refresh(school)
	return school


@router.patch("/{school_id}", response_model=SchoolOut)
async def update_school(
	school_id: int,
	data: SchoolUpdate,
	_: Annotated[int, Depends(require_platform_admin)],
	db: AsyncSession = Depends(get_db),
) -> SchoolOut:
	"""Обновить школу."""
	school = await db.get(School, school_id)
	if not school:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Школа не найдена")

	if data.name is not None:
		school.name = data.name
	if data.slug is not None:
		stmt = select(School).where(School.slug == data.slug, School.id != school_id)
		if (await db.execute(stmt)).scalar_one_or_none():
			raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug уже существует")
		school.slug = data.slug
	if data.subdomain is not None:
		if data.subdomain:
			stmt = select(School).where(School.subdomain == data.subdomain, School.id != school_id)
			if (await db.execute(stmt)).scalar_one_or_none():
				raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Subdomain уже занят")
		school.subdomain = data.subdomain or None

	await db.commit()
	await db.refresh(school)
	return school


@router.delete("/{school_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_school(
	school_id: int,
	_: Annotated[int, Depends(require_platform_admin)],
	db: AsyncSession = Depends(get_db),
) -> Response:
	"""Удалить школу."""
	school = await db.get(School, school_id)
	if not school:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Школа не найдена")
	if school_id == 1:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя удалить школу по умолчанию")
	await db.delete(school)
	await db.commit()
	return Response(status_code=status.HTTP_204_NO_CONTENT)
