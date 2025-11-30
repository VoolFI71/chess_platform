from __future__ import annotations

import asyncio
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..models import Course
from ..schemas import CourseCreate, CourseOut
from ..security import get_current_user_id


router = APIRouter(prefix="/api/courses", tags=["courses"])

_enrollments_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()


async def _get_enrollments_client() -> httpx.AsyncClient:
	settings = get_settings()
	if not settings.enrollments_service_url or not settings.enrollments_internal_token:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Сервис зачислений недоступен")

	base_url = settings.enrollments_service_url.rstrip("/")
	headers = {"X-Internal-Token": settings.enrollments_internal_token}

	global _enrollments_client
	if _enrollments_client is None:
		async with _client_lock:
			if _enrollments_client is None:
				timeout = httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=10.0)
				limits = httpx.Limits(max_connections=20, max_keepalive_connections=5)
				_enrollments_client = httpx.AsyncClient(
					base_url=base_url,
					headers=headers,
					timeout=timeout,
					limits=limits,
				)
	return _enrollments_client


async def close_enrollments_client() -> None:
	global _enrollments_client
	async with _client_lock:
		if _enrollments_client is not None:
			await _enrollments_client.aclose()
			_enrollments_client = None


async def _fetch_user_enrollment_course_ids(user_id: int) -> List[int]:
	client = await _get_enrollments_client()
	try:
		res = await client.get(f"/api/enrollments/internal/user/{user_id}")
	except httpx.RequestError:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Сервис зачислений недоступен")

	if res.status_code != status.HTTP_200_OK:
		raise HTTPException(
			status.HTTP_502_BAD_GATEWAY,
			detail=f"Ошибка сервиса зачислений ({res.status_code})",
		)

	try:
		data = res.json()
	except ValueError:
		raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Неверный ответ от сервиса зачислений")

	ids: List[int] = []
	for item in data:
		course_id = item.get("course_id")
		if isinstance(course_id, int):
			ids.append(course_id)
	return ids


async def _ensure_enrollment(user_id: int, course_id: int) -> None:
	client = await _get_enrollments_client()
	payload = {"user_id": user_id, "course_id": course_id}
	try:
		res = await client.post("/api/enrollments/internal", json=payload)
	except httpx.RequestError:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Сервис зачислений недоступен")

	if res.status_code not in (status.HTTP_200_OK, status.HTTP_201_CREATED):
		try:
			detail = res.json().get("detail")
		except Exception:
			detail = res.text
		raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=detail or "Ошибка сервиса зачислений")


@router.get("/", response_model=List[CourseOut])
async def list_courses(db: AsyncSession = Depends(get_db)) -> List[CourseOut]:
	stmt = (
		select(Course)
		.where(Course.is_active == True)  # noqa: E712
		.order_by(Course.created_at.desc())
	)
	result = await db.execute(stmt)
	return list(result.scalars().all())


@router.get("/me", response_model=List[CourseOut])
async def my_courses(
	current_user_id: int = Depends(get_current_user_id),
	db: AsyncSession = Depends(get_db),
) -> List[CourseOut]:
	course_ids = await _fetch_user_enrollment_course_ids(current_user_id)
	if not course_ids:
		return []
	stmt = select(Course).where(Course.id.in_(course_ids))
	result = await db.execute(stmt)
	return list(result.scalars().all())


async def _create_course_record(db: AsyncSession, data: CourseCreate) -> Course:
	stmt = select(Course).where(Course.slug == data.slug)
	exists = await db.execute(stmt)
	if exists.scalars().first():
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Slug уже существует")

	course = Course(
		id=data.id,
		slug=data.slug,
		title=data.title,
		description=data.description,
		price_cents=data.price_cents,
		is_active=data.is_active,
	)
	db.add(course)
	await db.commit()
	await db.refresh(course)
	return course


@router.post("/", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
async def create_course(data: CourseCreate, db: AsyncSession = Depends(get_db)) -> CourseOut:
	return await _create_course_record(db, data)


@router.post("/{course_id}/enroll", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
async def enroll_course(
	course_id: int,
	current_user_id: int = Depends(get_current_user_id),
	db: AsyncSession = Depends(get_db),
) -> CourseOut:
	course = await db.get(Course, course_id)
	if not course or not course.is_active:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Курс не найден")

	await _ensure_enrollment(user_id=current_user_id, course_id=course_id)
	return course


