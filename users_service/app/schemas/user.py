from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, HttpUrl


class UserPublic(BaseModel):
	id: int
	username: Optional[str] = None
	display_name: Optional[str] = None
	title: Optional[str] = None
	rating: Optional[int] = None
	blitz_rating: Optional[int] = None
	bullet_rating: Optional[int] = None
	rapid_rating: Optional[int] = None
	puzzle_rating: Optional[int] = None
	games_played: Optional[int] = None
	country: Optional[str] = None
	avatar_url: Optional[HttpUrl] = None
	created_at: Optional[datetime] = None
	updated_at: Optional[datetime] = None
	school_id: Optional[int] = None
	role: Optional[str] = None

	model_config = {"from_attributes": True}


class InternalUserCreate(BaseModel):
	username: str = Field(..., min_length=3, max_length=32)
	email: EmailStr
	hashed_password: str = Field(..., min_length=1, max_length=512)
	school_id: int | None = None  # По умолчанию школа 1 (ChessMint)


class InternalUser(BaseModel):
	id: int
	username: str
	email: EmailStr
	is_active: bool
	school_id: int | None = None
	role: str = "student"
	blitz_rating: int
	bullet_rating: int
	rapid_rating: int
	puzzle_rating: int
	games_played: int
	created_at: datetime
	updated_at: datetime
	hashed_password: str | None = None

	model_config = {"from_attributes": True, "extra": "ignore"}
