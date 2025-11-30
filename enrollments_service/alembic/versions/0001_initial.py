"""
Initial schema for enrollments_service.
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
		"enrollments",
		sa.Column("id", sa.Integer(), primary_key=True),
		sa.Column("user_id", sa.Integer(), nullable=False),
		sa.Column("course_id", sa.Integer(), nullable=False),
		sa.Column(
			"created_at",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
		sa.ForeignKeyConstraint(
			["user_id"],
			["users.id"],
			name="fk_enrollments_user",
			ondelete="CASCADE",
		),
		sa.ForeignKeyConstraint(
			["course_id"],
			["courses.id"],
			name="fk_enrollments_course",
			ondelete="CASCADE",
		),
		sa.UniqueConstraint("user_id", "course_id", name="uq_enrollments_user_course"),
	)
	op.create_index("ix_enrollments_user_id", "enrollments", ["user_id"])
	op.create_index("ix_enrollments_course_id", "enrollments", ["course_id"])


def downgrade() -> None:
	op.drop_index("ix_enrollments_course_id", table_name="enrollments")
	op.drop_index("ix_enrollments_user_id", table_name="enrollments")
	op.drop_table("enrollments")

