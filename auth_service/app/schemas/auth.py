from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
	username: str = Field(
		min_length=3,
		max_length=32,
		pattern=r"^[A-Za-z0-9_.-]+$",
		description="Уникальное имя пользователя (латиница, цифры, _ . -)",
	)
	email: EmailStr
	password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
	id: int
	email: EmailStr
	username: str
	is_active: bool
	blitz_rating: int = 1200
	bullet_rating: int = 1200
	rapid_rating: int = 1200
	puzzle_rating: int = 1200
	created_at: datetime
	updated_at: datetime

	model_config = {"from_attributes": True, "extra": "ignore"}


class LoginInput(BaseModel):
	login: str = Field(description="Email или логин пользователя")
	password: str


class RefreshInput(BaseModel):
	refresh_token: str


class Token(BaseModel):
	access_token: str
	refresh_token: str
	token_type: str = "bearer"


class PasswordResetRequest(BaseModel):
	email: EmailStr = Field(description="Email аккаунта для восстановления пароля")


class VerifyResetCodeRequest(BaseModel):
	email: EmailStr
	code: str = Field(min_length=6, max_length=6, description="6-значный код верификации")


class ResetPasswordRequest(BaseModel):
	email: EmailStr
	code: str = Field(min_length=6, max_length=6, description="6-значный код верификации")
	new_password: str = Field(min_length=8, max_length=128, description="Новый пароль")


class PasswordResetResponse(BaseModel):
	message: str


class RegisterWithCodeRequest(BaseModel):
	username: str = Field(
		min_length=3,
		max_length=32,
		pattern=r"^[A-Za-z0-9_.-]+$",
		description="Уникальное имя пользователя (латиница, цифры, _ . -)",
	)
	email: EmailStr
	password: str = Field(min_length=8, max_length=128)
	code: str = Field(min_length=6, max_length=6, description="6-значный код верификации")


