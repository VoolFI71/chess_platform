import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from common import decode_access_token

from ..config import get_settings
from ..database import get_db
from ..models import Notification
from ..realtime import ConnectionInfo, notification_ws_manager
from ..schemas import (
	NotificationCreate,
	NotificationListResponse,
	NotificationOut,
	NotificationUpdate,
	NotificationWsPayload,
)
from ..security import get_current_user_id, verify_internal_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.post("/", response_model=NotificationOut, status_code=status.HTTP_201_CREATED)
async def create_notification(
	notification: NotificationCreate,
	_: None = Depends(verify_internal_token),
	db: AsyncSession = Depends(get_db),
) -> NotificationOut:
	"""Создать уведомление (для внутреннего использования другими сервисами)"""
	data_json = None
	if notification.data:
		data_json = json.dumps(notification.data)

	db_notification = Notification(
		user_id=notification.user_id,
		type=notification.type,
		title=notification.title,
		message=notification.message,
		data=data_json,
	)

	db.add(db_notification)
	await db.commit()
	await db.refresh(db_notification)

	result_data = None
	if db_notification.data:
		try:
			result_data = json.loads(db_notification.data)
		except json.JSONDecodeError:
			pass

	notification_out = NotificationOut(
		id=db_notification.id,
		user_id=db_notification.user_id,
		type=db_notification.type,
		title=db_notification.title,
		message=db_notification.message,
		read=db_notification.read,
		data=result_data,
		created_at=db_notification.created_at,
	)

	# Отправляем уведомление через WebSocket всем подключенным клиентам пользователя
	try:
		ws_payload = NotificationWsPayload(
			id=notification_out.id,
			user_id=notification_out.user_id,
			notification_type=notification_out.type,
			title=notification_out.title,
			message=notification_out.message,
			read=notification_out.read,
			data=notification_out.data,
			created_at=notification_out.created_at,
		)
		await notification_ws_manager.send_to_user(
			notification_out.user_id, ws_payload.model_dump(mode="json")
		)
	except Exception as e:
		# Логируем ошибку, но не прерываем выполнение - уведомление уже сохранено в БД
		logger.warning(
			f"Failed to send notification via WebSocket to user {notification_out.user_id}: {e}",
			exc_info=True,
		)

	return notification_out


@router.get("/me", response_model=NotificationListResponse)
async def list_my_notifications(
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	read: bool | None = Query(default=None, description="Фильтр по статусу прочтения"),
	limit: int = Query(default=50, ge=1, le=100, description="Количество записей"),
	offset: int = Query(default=0, ge=0, description="Смещение для пагинации"),
	db: AsyncSession = Depends(get_db),
) -> NotificationListResponse:
	"""Получить список уведомлений текущего пользователя"""
	conditions = [Notification.user_id == current_user_id]
	if read is not None:
		conditions.append(Notification.read == read)

	# Получаем общее количество и количество непрочитанных
	total_stmt = select(func.count(Notification.id)).where(Notification.user_id == current_user_id)
	if read is not None:
		total_stmt = total_stmt.where(Notification.read == read)

	unread_stmt = select(func.count(Notification.id)).where(
		Notification.user_id == current_user_id, Notification.read == False
	)

	# Получаем список уведомлений
	stmt = (
		select(Notification, func.count(Notification.id).over().label("total"))
		.where(*conditions)
		.order_by(Notification.created_at.desc())
		.limit(limit)
		.offset(offset)
	)

	result = await db.execute(stmt)
	rows = result.all()

	total_result = await db.execute(total_stmt)
	total = total_result.scalar() or 0

	unread_result = await db.execute(unread_stmt)
	unread_count = unread_result.scalar() or 0

	notifications = []
	for row in rows:
		notification = row.Notification
		data_dict = None
		if notification.data:
			try:
				data_dict = json.loads(notification.data)
			except json.JSONDecodeError:
				pass

		notifications.append(
			NotificationOut(
				id=notification.id,
				user_id=notification.user_id,
				type=notification.type,
				title=notification.title,
				message=notification.message,
				read=notification.read,
				data=data_dict,
				created_at=notification.created_at,
			)
		)

	return NotificationListResponse(
		notifications=notifications, total=total, unread_count=unread_count
	)


@router.get("/me/unread-count", response_model=dict)
async def get_unread_count(
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> dict:
	"""Получить количество непрочитанных уведомлений"""
	stmt = select(func.count(Notification.id)).where(
		Notification.user_id == current_user_id, Notification.read == False
	)
	result = await db.execute(stmt)
	count = result.scalar() or 0
	return {"unread_count": count}


@router.patch("/{notification_id}", response_model=NotificationOut)
async def update_notification(
	notification_id: int,
	update: NotificationUpdate,
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> NotificationOut:
	"""Обновить уведомление (например, пометить как прочитанное)"""
	stmt = select(Notification).where(
		Notification.id == notification_id, Notification.user_id == current_user_id
	)
	result = await db.execute(stmt)
	notification = result.scalar_one_or_none()

	if not notification:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND, detail="Уведомление не найдено"
		)

	notification.read = update.read
	await db.commit()
	await db.refresh(notification)

	data_dict = None
	if notification.data:
		try:
			data_dict = json.loads(notification.data)
		except json.JSONDecodeError:
			pass

	return NotificationOut(
		id=notification.id,
		user_id=notification.user_id,
		type=notification.type,
		title=notification.title,
		message=notification.message,
		read=notification.read,
		data=data_dict,
		created_at=notification.created_at,
	)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
	notification_id: int,
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> None:
	"""Удалить уведомление"""
	stmt = select(Notification).where(
		Notification.id == notification_id, Notification.user_id == current_user_id
	)
	result = await db.execute(stmt)
	notification = result.scalar_one_or_none()

	if not notification:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND, detail="Уведомление не найдено"
		)

	await db.execute(delete(Notification).where(Notification.id == notification_id))
	await db.commit()


@router.post("/me/mark-all-read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_as_read(
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: AsyncSession = Depends(get_db),
) -> None:
	"""Пометить все уведомления как прочитанные"""
	await db.execute(
		update(Notification)
		.where(Notification.user_id == current_user_id, Notification.read == False)
		.values(read=True)
	)
	await db.commit()


# WebSocket endpoint для real-time уведомлений
# Используем отдельный роутер без префикса, чтобы путь был /ws/notifications
ws_router = APIRouter()


@ws_router.websocket("/ws/notifications")
async def notifications_websocket(
	websocket: WebSocket,
	token: Annotated[str | None, Query()] = None,
) -> None:
	"""WebSocket endpoint для real-time уведомлений.
	
	Требует токен авторизации в query параметре: ?token=<access_token>
	"""
	user_id: int | None = None
	
	if not token:
		await websocket.close(code=4401, reason="Token required")
		return

	try:
		settings = get_settings()
		current_user = decode_access_token(
			token, settings.jwt_secret, settings.jwt_algorithm
		)
		user_id = current_user.id
	except Exception:
		await websocket.close(code=4401, reason="Invalid token")
		return

	# Подключаем пользователя
	await notification_ws_manager.connect(
		user_id, ConnectionInfo(websocket=websocket, user_id=user_id)
	)

	try:
		# Ждем сообщений от клиента (можно использовать для ping/pong)
		while True:
			# Пока просто ждем, чтобы соединение оставалось открытым
			# Клиент может отправлять ping сообщения
			data = await websocket.receive_text()
			# Можно обработать ping/pong или другие команды
			if data == "ping":
				await websocket.send_text("pong")
	except WebSocketDisconnect:
		await notification_ws_manager.disconnect(websocket, user_id)
	except Exception:
		await notification_ws_manager.disconnect(websocket, user_id)

