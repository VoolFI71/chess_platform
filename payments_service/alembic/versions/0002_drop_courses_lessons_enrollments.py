"""
Drop courses, lessons, enrollments and remove course_id from orders.
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect


revision = "0002_drop_courses_lessons_enrollments"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
	inspector = inspect(op.get_bind())

	# Drop FK and course_id from orders first (orders references courses)
	if inspector.has_table("orders"):
		# Drop FK constraint if exists
		fks = inspector.get_foreign_keys("orders")
		for fk in fks:
			if fk.get("referred_table") == "courses":
				op.drop_constraint(fk["name"], "orders", type_="foreignkey")
				break
		# Drop index and column
		if "course_id" in [c["name"] for c in inspector.get_columns("orders")]:
			op.drop_index("ix_orders_course_id", table_name="orders", if_exists=True)
			op.drop_column("orders", "course_id")

	# Drop in order: lesson_completions -> lessons -> enrollments -> courses
	if inspector.has_table("lesson_completions"):
		op.drop_table("lesson_completions")
	if inspector.has_table("lessons"):
		op.drop_table("lessons")
	if inspector.has_table("enrollments"):
		op.drop_table("enrollments")
	if inspector.has_table("courses"):
		op.drop_table("courses")


def downgrade() -> None:
	# Recreate tables (simplified - for rollback only)
	# In practice, downgrade would need full table recreation from 0001
	raise NotImplementedError("Downgrade not supported for this migration")
