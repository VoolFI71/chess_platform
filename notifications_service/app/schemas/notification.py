from datetime import datetime
from typing import List, Literal

from pydantic import BaseModel, Field


class NotificationCreate(BaseModel):
	"""Схема для создания уведомления"""
	user_id: int = Field(gt=0, description="ID пользователя, которому отправляется уведомление")
	type: str = Field(max_length=50, description="Тип уведомления (например: friend_request, game_invite, etc.)")
	title: str = Field(max_length=200, description="Заголовок уведомления")
	message: str = Field(description="Текст уведомления")
	data: dict | None = Field(default=None, description="Дополнительные данные в формате JSON")


class NotificationUpdate(BaseModel):
	"""Схема для обновления уведомления"""
	read: bool = Field(description="Пометить как прочитанное/непрочитанное")


class NotificationOut(BaseModel):
	"""Схема уведомления для ответа API"""
	id: int
	user_id: int
	type: str
	title: str
	message: str
	read: bool
	data: dict | None = None
	created_at: datetime

	class Config:
		from_attributes = True


class NotificationListResponse(BaseModel):
	"""Список уведомлений с пагинацией"""
	notifications: List[NotificationOut] = Field(default_factory=list)
	total: int = Field(description="Общее количество уведомлений")
	unread_count: int = Field(description="Количество непрочитанных уведомлений")

