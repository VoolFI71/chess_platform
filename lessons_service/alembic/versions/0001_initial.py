"""
Initial schema for lessons_service.
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
		"lessons",
		sa.Column("id", sa.Integer(), primary_key=True),
		sa.Column("course_id", sa.Integer(), nullable=False),
		sa.Column("title", sa.String(length=255), nullable=False),
		sa.Column("content", sa.Text(), nullable=False, server_default=sa.text("''")),
		sa.Column("pgn_content", sa.Text(), nullable=True),
		sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("1")),
		sa.Column("duration_sec", sa.Integer(), nullable=False, server_default=sa.text("0")),
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
		sa.ForeignKeyConstraint(
			["course_id"],
			["courses.id"],
			name="fk_lessons_course",
			ondelete="CASCADE",
		),
	)
	op.create_index("ix_lessons_course_id", "lessons", ["course_id"])
	op.create_index("ix_lessons_order_index", "lessons", ["course_id", "order_index"])


def downgrade() -> None:
	op.drop_index("ix_lessons_order_index", table_name="lessons")
	op.drop_index("ix_lessons_course_id", table_name="lessons")
	op.drop_table("lessons")

