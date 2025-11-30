from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from common import send_notification

from ..config import get_settings
from ..database import get_db
from ..models import Friendship, User
from ..schemas import (
	FriendshipListResponse,
	FriendshipOut,
	FriendshipRequestCreate,
	FriendshipUpdate,
	FriendshipWithUser,
)
from ..security import get_current_user_id
from ..utils import build_user_public


router = APIRouter(prefix="/api/friendships", tags=["friendships"])


async def _get_user_or_404(user_id: int, db: AsyncSession) -> User:
	"""Получить пользователя по ID или выбросить 404"""
	user = await db.get(User, user_id)
	if not user or not user.is_active:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден"
		)
	return user


async def _check_friendship_exists(
	db: AsyncSession, requester_id: int, addressee_id: int
) -> Friendship | None:
	"""Проверить существование дружбы между двумя пользователями"""
	stmt = select(Friendship).where(
		or_(
			and_(Friendship.requester_id == requester_id, Friendship.addressee_id == addressee_id),
			and_(Friendship.requester_id == addressee_id, Friendship.addressee_id == requester_id),
		)
	)
	result = await db.execute(stmt)
	return result.scalar_one_or_none()


async def _get_friendship_or_404(
	friendship_id: int, current_user_id: int, db: AsyncSession
) -> Friendship:
	"""Получить дружбу по ID с проверкой прав доступа"""
	friendship = await db.get(Friendship, friendship_id)
	if not friendship:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND, detail="Дружба не найдена"
		)
	# Проверяем, что текущий пользователь является участником дружбы
	if friendship.requester_id != current_user_id and friendship.addressee_id != current_user_id:
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этой дружбе"
		)
	return friendship


def _build_friendship_with_user(
	friendship: Friendship, friend_user: User, current_user_id: int
) -> FriendshipWithUser:
	"""Построить ответ с информацией о друге"""
	friend_public = build_user_public(friend_user)

	return FriendshipWithUser(
		id=friendship.id,
		requester_id=friendship.requester_id,
		addressee_id=friendship.addressee_id,
		status=friendship.status,
		created_at=friendship.created_at,
		updated_at=friendship.updated_at,
		user=friend_public,
	)


@router.post("/", response_model=FriendshipOut, status_code=status.HTTP_201_CREATED)
async def create_friendship_request(
	data: FriendshipRequestCreate,
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> FriendshipOut:
	"""Отправить запрос на дружбу"""
	# Проверка, что не отправляем самому себе
	if data.addressee_id == current_user_id:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя отправить запрос самому себе"
		)

	# Проверка существования пользователя
	await _get_user_or_404(data.addressee_id, db)

	# Проверка, что запрос еще не существует
	existing = await _check_friendship_exists(db, current_user_id, data.addressee_id)
	if existing:
		# Если запрос уже существует, возвращаем существующий
		return FriendshipOut(
			id=existing.id,
			requester_id=existing.requester_id,
			addressee_id=existing.addressee_id,
			status=existing.status,
			created_at=existing.created_at,
			updated_at=existing.updated_at,
		)

	# Создание нового запроса
	friendship = Friendship(
		requester_id=current_user_id, addressee_id=data.addressee_id, status="pending"
	)
	db.add(friendship)
	await db.commit()
	await db.refresh(friendship)

	# Отправляем уведомление получателю запроса
	settings = get_settings()
	if settings.notifications_service_url:
		requester = await db.get(User, current_user_id)
		if requester:
			await send_notification(
				notifications_service_url=settings.notifications_service_url,
				user_id=data.addressee_id,
				notification_type="friend_request",
				title="Новый запрос на дружбу",
				message=f"{requester.username} отправил вам запрос на дружбу",
				data={"friendship_id": friendship.id, "requester_id": current_user_id, "requester_username": requester.username},
				internal_token=settings.notifications_internal_token,
			)

	return FriendshipOut(
		id=friendship.id,
		requester_id=friendship.requester_id,
		addressee_id=friendship.addressee_id,
		status=friendship.status,
		created_at=friendship.created_at,
		updated_at=friendship.updated_at,
	)


@router.get("/me", response_model=FriendshipListResponse)
async def list_my_friendships(
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	status_filter: Literal["accepted", "pending"] = Query(
		default="accepted", alias="status", description="Фильтр по статусу"
	),
	limit: int = Query(default=50, ge=1, le=100, description="Количество записей"),
	offset: int = Query(default=0, ge=0, description="Смещение для пагинации"),
	db: AsyncSession = Depends(get_db),
) -> FriendshipListResponse:
	"""Получить список друзей текущего пользователя"""
	# Базовое условие для фильтрации
	base_condition = and_(
		or_(
			Friendship.requester_id == current_user_id,
			Friendship.addressee_id == current_user_id,
		),
		Friendship.status == status_filter,
	)

	# Запрос с JOIN для загрузки пользователей одним запросом
	# Используем CASE для определения, кто является другом
	stmt = (
		select(
			Friendship,
			User,
			func.count(Friendship.id).over().label("total"),
		)
		.join(
			User,
			or_(
				and_(
					Friendship.requester_id == current_user_id,
					User.id == Friendship.addressee_id,
				),
				and_(
					Friendship.addressee_id == current_user_id,
					User.id == Friendship.requester_id,
				),
			),
		)
		.where(base_condition)
		.where(User.is_active == True)
		.order_by(Friendship.created_at.desc())
		.limit(limit)
		.offset(offset)
	)

	result = await db.execute(stmt)
	rows = result.all()

	if not rows:
		return FriendshipListResponse(friendships=[], total=0)

	# Извлекаем total из первой строки (window function возвращает одинаковое значение для всех строк)
	# Доступ к атрибутам через индексацию или getattr
	total = getattr(rows[0], "total", 0) if rows else 0

	# Построение ответов с информацией о пользователях
	friendships_with_users = [
		_build_friendship_with_user(row.Friendship, row.User, current_user_id) for row in rows
	]

	return FriendshipListResponse(friendships=friendships_with_users, total=total)


@router.get("/requests/incoming", response_model=FriendshipListResponse)
async def list_incoming_requests(
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	limit: int = Query(default=50, ge=1, le=100, description="Количество записей"),
	offset: int = Query(default=0, ge=0, description="Смещение для пагинации"),
	db: AsyncSession = Depends(get_db),
) -> FriendshipListResponse:
	"""Получить список входящих запросов на дружбу"""
	base_condition = and_(
		Friendship.addressee_id == current_user_id,
		Friendship.status == "pending",
	)

	# Запрос с JOIN для загрузки пользователей одним запросом
	stmt = (
		select(
			Friendship,
			User,
			func.count(Friendship.id).over().label("total"),
		)
		.join(User, User.id == Friendship.requester_id)
		.where(base_condition)
		.where(User.is_active == True)
		.order_by(Friendship.created_at.desc())
		.limit(limit)
		.offset(offset)
	)

	result = await db.execute(stmt)
	rows = result.all()

	if not rows:
		return FriendshipListResponse(friendships=[], total=0)

	# Извлекаем total из первой строки (window function возвращает одинаковое значение)
	total = getattr(rows[0], "total", 0) if rows else 0

	# Построение ответов с информацией о пользователях
	friendships_with_users = [
		_build_friendship_with_user(row.Friendship, row.User, current_user_id) for row in rows
	]

	return FriendshipListResponse(friendships=friendships_with_users, total=total)


@router.get("/requests/outgoing", response_model=FriendshipListResponse)
async def list_outgoing_requests(
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	limit: int = Query(default=50, ge=1, le=100, description="Количество записей"),
	offset: int = Query(default=0, ge=0, description="Смещение для пагинации"),
	db: AsyncSession = Depends(get_db),
) -> FriendshipListResponse:
	"""Получить список исходящих запросов на дружбу"""
	base_condition = and_(
		Friendship.requester_id == current_user_id,
		Friendship.status == "pending",
	)

	# Запрос с JOIN для загрузки пользователей одним запросом
	stmt = (
		select(
			Friendship,
			User,
			func.count(Friendship.id).over().label("total"),
		)
		.join(User, User.id == Friendship.addressee_id)
		.where(base_condition)
		.where(User.is_active == True)
		.order_by(Friendship.created_at.desc())
		.limit(limit)
		.offset(offset)
	)

	result = await db.execute(stmt)
	rows = result.all()

	if not rows:
		return FriendshipListResponse(friendships=[], total=0)

	# Извлекаем total из первой строки (window function возвращает одинаковое значение)
	total = getattr(rows[0], "total", 0) if rows else 0

	# Построение ответов с информацией о пользователях
	friendships_with_users = [
		_build_friendship_with_user(row.Friendship, row.User, current_user_id) for row in rows
	]

	return FriendshipListResponse(friendships=friendships_with_users, total=total)


@router.patch("/{friendship_id}", response_model=FriendshipOut)
async def update_friendship_status(
	friendship_id: int,
	data: FriendshipUpdate,
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> FriendshipOut:
	"""Обновить статус дружбы (принять или отклонить запрос)"""
	friendship = await _get_friendship_or_404(friendship_id, current_user_id, db)

	# Проверка, что запрос в статусе pending
	if friendship.status != "pending":
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=f"Нельзя изменить статус дружбы со статусом '{friendship.status}'",
		)

	# Проверка прав: только addressee может принять/отклонить запрос
	if friendship.addressee_id != current_user_id:
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="Только получатель запроса может принять или отклонить его",
		)

	# Обновление статуса
	friendship.status = data.status
	await db.commit()
	await db.refresh(friendship)

	# Отправляем уведомление, если запрос принят
	if data.status == "accepted":
		settings = get_settings()
		if settings.notifications_service_url:
			addressee = await db.get(User, current_user_id)
			if addressee:
				await send_notification(
					notifications_service_url=settings.notifications_service_url,
					user_id=friendship.requester_id,
					notification_type="friend_request_accepted",
					title="Запрос на дружбу принят",
					message=f"{addressee.username} принял ваш запрос на дружбу",
					data={"friendship_id": friendship.id, "addressee_id": current_user_id, "addressee_username": addressee.username},
					internal_token=settings.notifications_internal_token,
				)

	return FriendshipOut(
		id=friendship.id,
		requester_id=friendship.requester_id,
		addressee_id=friendship.addressee_id,
		status=friendship.status,
		created_at=friendship.created_at,
		updated_at=friendship.updated_at,
	)


@router.delete("/{friendship_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_friendship(
	friendship_id: int,
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> None:
	"""Удалить дружбу"""
	friendship = await _get_friendship_or_404(friendship_id, current_user_id, db)

	await db.execute(delete(Friendship).where(Friendship.id == friendship_id))
	await db.commit()


@router.get("/status/{user_id}", response_model=FriendshipOut | None)
async def get_friendship_status(
	user_id: int,
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> FriendshipOut | None:
	"""Получить статус дружбы между текущим пользователем и указанным пользователем"""
	if user_id == current_user_id:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя проверить дружбу с самим собой"
		)

	friendship = await _check_friendship_exists(db, current_user_id, user_id)
	if not friendship:
		return None

	return FriendshipOut(
		id=friendship.id,
		requester_id=friendship.requester_id,
		addressee_id=friendship.addressee_id,
		status=friendship.status,
		created_at=friendship.created_at,
		updated_at=friendship.updated_at,
	)

