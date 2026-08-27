from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SchoolOut(BaseModel):
	id: int
	name: str
	slug: str
	subdomain: str | None
	created_at: datetime
	updated_at: datetime

	model_config = {"from_attributes": True}


class SchoolCreate(BaseModel):
	name: str = Field(..., min_length=1, max_length=255)
	slug: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z0-9-]+$")
	subdomain: str | None = Field(None, max_length=64, pattern=r"^[a-z0-9-]*$")


class SchoolUpdate(BaseModel):
	name: str | None = Field(None, min_length=1, max_length=255)
	slug: str | None = Field(None, min_length=1, max_length=64, pattern=r"^[a-z0-9-]+$")
	subdomain: str | None = Field(None, max_length=64, pattern=r"^[a-z0-9-]*$")
