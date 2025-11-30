from __future__ import annotations

from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..enrollments_client import EnrollmentsClientUnavailable, get_enrollments_client
from ..database import get_db
from ..models import Course, Lesson
from ..schemas import PGNFileOut
from ..security import get_current_user_id


router = APIRouter(prefix="/api/pgn-files", tags=["pgn-files"])


async def _fetch_user_enrolled_course_ids(user_id: int) -> List[int]:
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

	course_ids: List[int] = []
	for item in data:
		course_id = item.get("course_id")
		if isinstance(course_id, int):
			course_ids.append(course_id)
	return course_ids


@router.get("/", response_model=List[PGNFileOut])
async def list_user_pgn_files(
	db: AsyncSession = Depends(get_db),
	user_id: int = Depends(get_current_user_id),
) -> List[PGNFileOut]:
	course_ids = await _fetch_user_enrolled_course_ids(user_id)
	if not course_ids:
		return []

	stmt = (
		select(Lesson)
		.join(Course)
		.where(
			Lesson.course_id.in_(course_ids),
			Lesson.pgn_content.isnot(None),
			Lesson.pgn_content != "",
			Course.is_active == True,  # noqa: E712
		)
		.order_by(Course.title.asc(), Lesson.order_index.asc())
	)
	result = await db.execute(stmt)
	lessons = result.scalars().all()

	output: List[PGNFileOut] = []
	for lesson in lessons:
		if lesson.pgn_content is None:
			continue
		output.append(
			PGNFileOut(
				id=lesson.id,
				course_id=lesson.course_id,
				course_title=lesson.course.title if lesson.course else "",
				lesson_number=lesson.order_index,
				lesson_title=lesson.title,
				pgn_content=lesson.pgn_content,
				created_at=lesson.created_at,
			)
		)

	return output


