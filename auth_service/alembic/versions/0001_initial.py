"""
Initial schema for auth_service.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
	op.create_table(
		"refresh_tokens",
		sa.Column("id", sa.Integer(), primary_key=True),
		sa.Column("token_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
		sa.Column("user_id", sa.Integer(), nullable=False),
		sa.Column("token_hash", sa.String(length=64), nullable=False),
		sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
		sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
		sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
		sa.Column(
			"created_at",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
		sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
	)
	op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
	op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])


def downgrade() -> None:
	op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens")
	op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
	op.drop_table("refresh_tokens")

