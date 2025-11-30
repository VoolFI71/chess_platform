from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class NotificationWsPayload(BaseModel):
	"""WebSocket payload для отправки уведомления"""
	type: Literal["notification"] = "notification"
	id: int
	user_id: int
	notification_type: str
	title: str
	message: str
	read: bool
	data: dict | None = None
	created_at: datetime

