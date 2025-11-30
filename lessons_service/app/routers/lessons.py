from __future__ import annotations

from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Course, Lesson
from ..schemas import LessonCreate, LessonOut, LessonUpdate
from ..security import get_current_user_id
from ..enrollments_client import EnrollmentsClientUnavailable, get_enrollments_client


router = APIRouter(prefix="/api/courses/{course_id}/lessons", tags=["lessons"])


async def _user_enrolled(course_id: int, user_id: int) -> bool:
	try:
		client = await get_enrollments_client()
	except EnrollmentsClientUnavailable:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Сервис зачислений недоступен")

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

	return any(isinstance(item.get("course_id"), int) and item["course_id"] == course_id for item in data)


@router.get("/", response_model=List[LessonOut])
async def list_lessons(
	course_id: int,
	db: AsyncSession = Depends(get_db),
	user_id: int = Depends(get_current_user_id),
) -> List[LessonOut]:
	course = await db.get(Course, course_id)
	if not course or not course.is_active:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Курс не найден")

	if course.price_cents and course.price_cents > 0 and not await _user_enrolled(course_id, user_id):
		raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому курсу")

	stmt = (
		select(Lesson)
		.where(Lesson.course_id == course_id)
		.order_by(Lesson.order_index.asc(), Lesson.id.asc())
	)
	result = await db.execute(stmt)
	return list(result.scalars().all())


@router.post("/", response_model=LessonOut, status_code=status.HTTP_201_CREATED)
async def create_lesson(
	course_id: int,
	payload: LessonCreate,
	db: AsyncSession = Depends(get_db),
	_: int = Depends(get_current_user_id),
) -> LessonOut:
	course = await db.get(Course, course_id)
	if not course or not course.is_active:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Course not found")

	lesson = Lesson(
		course_id=course_id,
		title=payload.title,
		content=payload.content,
		pgn_content=payload.pgn_content,
		order_index=payload.order_index,
		duration_sec=payload.duration_sec,
	)
	db.add(lesson)
	await db.commit()
	await db.refresh(lesson)
	return lesson


@router.patch("/{lesson_id}", response_model=LessonOut)
async def update_lesson(
	course_id: int,
	lesson_id: int,
	payload: LessonUpdate,
	db: AsyncSession = Depends(get_db),
	_: int = Depends(get_current_user_id),
) -> LessonOut:
	course = await db.get(Course, course_id)
	if not course or not course.is_active:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Курс не найден")

	lesson = await db.get(Lesson, lesson_id)
	if not lesson or lesson.course_id != course_id:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Урок не найден")

	if payload.title is not None:
		lesson.title = payload.title
	if payload.content is not None:
		lesson.content = payload.content
	if payload.pgn_content is not None:
		lesson.pgn_content = payload.pgn_content
	if payload.order_index is not None:
		lesson.order_index = payload.order_index
	if payload.duration_sec is not None:
		lesson.duration_sec = payload.duration_sec

	await db.commit()
	await db.refresh(lesson)
	return lesson


