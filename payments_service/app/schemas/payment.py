from pydantic import BaseModel


class CheckoutResponse(BaseModel):
	"""Ответ на создание checkout"""
	payment_url: str | None = None
	order_id: int | None = None
	status: str | None = None
	message: str | None = None


class OrderOut(BaseModel):
	"""Информация о заказе"""
	id: int
	status: str


class WebhookResponse(BaseModel):
	"""Ответ на webhook от платежного провайдера"""
	status: str


class SimulateResponse(BaseModel):
	"""Ответ на симуляцию успешной оплаты"""
	status: str

