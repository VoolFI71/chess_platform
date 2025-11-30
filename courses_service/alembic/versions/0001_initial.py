"""
Initial schema for courses_service.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
	op.create_table(
		"courses",
		sa.Column("id", sa.Integer(), primary_key=True),
		sa.Column("slug", sa.String(length=255), nullable=False),
		sa.Column("title", sa.String(length=255), nullable=False),
		sa.Column("description", sa.String(length=2048), nullable=False, server_default=sa.text("''")),
		sa.Column("price_cents", sa.Integer(), nullable=False, server_default=sa.text("0")),
		sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
		sa.Column(
			"created_at",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
		sa.Column(
			"updated_at",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
	)
	op.create_index("ix_courses_slug", "courses", ["slug"], unique=True)
	op.create_index("ix_courses_is_active", "courses", ["is_active"])


def downgrade() -> None:
	op.drop_index("ix_courses_is_active", table_name="courses")
	op.drop_index("ix_courses_slug", table_name="courses")
	op.drop_table("courses")

