import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from common import InternalServiceClient, ServiceClientNotConfigured

from ..config import get_settings
from ..security import CurrentUser, get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

settings = get_settings()
_notifications_client = InternalServiceClient(
    "Notifications service",
    lambda: ("http://notifications:8000", os.getenv("INTERNAL_TOKEN") or settings.api_internal_token),
    read_timeout=10.0,
)


class SendNotificationRequest(BaseModel):
    user_id: int
    type: str
    title: str
    message: str
    data: dict | None = None


async def close_notifications_client() -> None:
    await _notifications_client.close()


@router.post("/send", status_code=status.HTTP_201_CREATED)
async def send_notification(
    request: SendNotificationRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Send an authenticated internal request to notifications_service."""
    try:
        client = await _notifications_client.get()
    except ServiceClientNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Notifications service is not configured",
        ) from exc

    try:
        response = await client.post(
            "/api/notifications/",
            json={
                "user_id": request.user_id,
                "type": request.type,
                "title": request.title,
                "message": request.message,
                "data": request.data,
            },
        )
        response.raise_for_status()
        return response.json()
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Notifications service timeout",
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Notifications service returned HTTP {exc.response.status_code}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Notifications service is unavailable",
        ) from exc
