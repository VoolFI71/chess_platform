import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..config import get_settings
from ..security import CurrentUser, get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

settings = get_settings()


class SendNotificationRequest(BaseModel):
    """Схема для отправки уведомления"""
    user_id: int
    type: str
    title: str
    message: str
    data: dict | None = None


@router.post("/send", status_code=status.HTTP_201_CREATED)
async def send_notification(
    request: SendNotificationRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Отправить уведомление другому пользователю.
    Требует авторизации - только авторизованные пользователи могут отправлять уведомления.
    """
    # Получаем внутренний токен для вызова notifications_service
    # Проверяем через переменную окружения, так как notifications_service использует INTERNAL_TOKEN
    import os
    internal_token = os.getenv("INTERNAL_TOKEN") or settings.api_internal_token
    if not internal_token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Notifications service is not configured (INTERNAL_TOKEN missing)",
        )

    # Вызываем notifications_service
    notifications_service_url = "http://notifications:8000/api/notifications/"
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                notifications_service_url,
                json={
                    "user_id": request.user_id,
                    "type": request.type,
                    "title": request.title,
                    "message": request.message,
                    "data": request.data,
                },
                headers={
                    "Authorization": f"Bearer {internal_token}",
                    "Content-Type": "application/json",
                },
            )

            if response.status_code == 201:
                return response.json()
            elif response.status_code == 401:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to authenticate with notifications service",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Notifications service returned error: {response.status_code}",
                )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Notifications service timeout",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to notifications service: {str(e)}",
        )

