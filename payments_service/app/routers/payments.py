from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Order, OrderStatusEnum
from ..schemas import OrderOut, WebhookResponse
from ..security import get_current_user_id


router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.post("/webhook", response_model=WebhookResponse)
async def yookassa_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> WebhookResponse:
	# YooKassa sends various events. We care about payment.succeeded and payment.canceled
	payload = await request.json()
	event = payload.get("event")
	obj = payload.get("object") or {}
	payment_id = obj.get("id")
	metadata = obj.get("metadata") or {}
	order_id = metadata.get("order_id")

	if not payment_id or not order_id:
		return WebhookResponse(status="ignored")

	order = await db.get(Order, int(order_id))
	if not order:
		return WebhookResponse(status="ignored")

	if event == "payment.succeeded":
		order.status = OrderStatusEnum.PAID.value
		order.provider_payment_id = payment_id
		await db.commit()
		return WebhookResponse(status="ok")

	if event in ("payment.canceled", "payment.expired", "refund.succeeded"):
		order.status = OrderStatusEnum.CANCELLED.value
		await db.commit()
		return WebhookResponse(status="ok")

	return WebhookResponse(status="ignored")


@router.get("/order/{order_id}", response_model=OrderOut)
async def get_order(
	order_id: int,
	current_user_id: int = Depends(get_current_user_id),
	db: AsyncSession = Depends(get_db),
) -> OrderOut:
	order = await db.get(Order, order_id)
	if not order:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Заказ не найден"
		)
	if order.user_id != current_user_id:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Заказ не найден"
		)
	return OrderOut(id=order.id, status=order.status)
