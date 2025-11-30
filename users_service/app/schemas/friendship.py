from datetime import datetime
from typing import List, Literal

from pydantic import BaseModel, Field

from .user import UserPublic


class FriendshipRequestCreate(BaseModel):
	"""Схема для создания запроса на дружбу"""
	addressee_id: int = Field(gt=0, description="ID пользователя, которому отправляется запрос")


class FriendshipUpdate(BaseModel):
	"""Схема для обновления статуса дружбы"""
	status: Literal["accepted", "declined"] = Field(description="Новый статус дружбы")


class FriendshipOut(BaseModel):
	"""Базовая схема дружбы для ответа API"""
	id: int
	requester_id: int
	addressee_id: int
	status: str
	created_at: datetime
	updated_at: datetime

	class Config:
		from_attributes = True


class FriendshipWithUser(BaseModel):
	"""Дружба с информацией о пользователе"""
	id: int
	requester_id: int
	addressee_id: int
	status: str
	created_at: datetime
	updated_at: datetime
	user: UserPublic = Field(description="Информация о друге (requester или addressee)")

	class Config:
		from_attributes = True


class FriendshipListResponse(BaseModel):
	"""Список друзей/запросов с пагинацией"""
	friendships: List[FriendshipWithUser] = Field(default_factory=list)
	total: int = Field(description="Общее количество записей")

