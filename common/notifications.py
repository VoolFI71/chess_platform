"""
Утилиты для отправки уведомлений из других микросервисов.
Использует HTTP для коммуникации с notifications_service.
"""
import logging
from typing import Any

try:
	import httpx
except ImportError:
	httpx = None  # type: ignore

logger = logging.getLogger(__name__)


async def send_notification(
	notifications_service_url: str,
	user_id: int,
	notification_type: str,
	title: str,
	message: str,
	data: dict[str, Any] | None = None,
	internal_token: str | None = None,
	timeout: float = 5.0,
) -> bool:
	"""
	Отправить уведомление пользователю через notifications_service.

	Args:
		notifications_service_url: URL notifications_service (например, "http://notifications:8000")
		user_id: ID пользователя, которому отправляется уведомление
		notification_type: Тип уведомления (например, "friend_request", "game_invite")
		title: Заголовок уведомления
		message: Текст уведомления
		data: Дополнительные данные в формате dict (опционально)
		internal_token: Токен для внутренних вызовов (опционально)
		timeout: Таймаут запроса в секундах

	Returns:
		True если уведомление успешно отправлено, False в противном случае
	"""
	if not httpx:
		logger.warning("httpx is not installed, cannot send notifications")
		return False

	if not notifications_service_url:
		return False

	base_url = notifications_service_url.rstrip("/")
	url = f"{base_url}/api/notifications/"

	payload = {
		"user_id": user_id,
		"type": notification_type,
		"title": title,
		"message": message,
	}
	if data:
		payload["data"] = data

	headers = {"Content-Type": "application/json"}
	if internal_token:
		headers["X-Internal-Token"] = internal_token

	try:
		async with httpx.AsyncClient(timeout=timeout) as client:
			response = await client.post(url, json=payload, headers=headers)
			if not response.is_success:
				logger.warning(
					f"Failed to send notification to user {user_id}: "
					f"HTTP {response.status_code} - {response.text}"
				)
			return response.is_success
	except httpx.TimeoutException:
		logger.error(f"Timeout sending notification to user {user_id} (timeout={timeout}s)")
		return False
	except Exception as e:
		logger.error(
			f"Failed to send notification to user {user_id}: {e}",
			exc_info=True,
		)
		return False

