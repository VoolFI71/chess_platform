"""
Add verification_codes table.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0002_add_verification_codes"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
	op.create_table(
		"verification_codes",
		sa.Column("id", sa.Integer(), primary_key=True),
		sa.Column("email", sa.String(length=320), nullable=False),
		sa.Column("code", sa.String(length=6), nullable=False),
		sa.Column("purpose", sa.String(length=50), nullable=False),
		sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
		sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.false()),
		sa.Column(
			"created_at",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
	)
	op.create_index("ix_verification_codes_email", "verification_codes", ["email"])
	op.create_index("ix_verification_codes_expires_at", "verification_codes", ["expires_at"])


def downgrade() -> None:
	op.drop_index("ix_verification_codes_expires_at", table_name="verification_codes")
	op.drop_index("ix_verification_codes_email", table_name="verification_codes")
	op.drop_table("verification_codes")

