"""
Initial schema for payments_service.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
	# Проверяем, существует ли таблица courses (она может быть создана courses_service)
	from sqlalchemy import inspect
	inspector = inspect(op.get_bind())
	if not inspector.has_table("courses"):
		op.create_table(
			"courses",
			sa.Column("id", sa.Integer(), primary_key=True),
			sa.Column("slug", sa.String(length=255), nullable=False, unique=True),
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
		)

	# Проверяем, существует ли таблица enrollments (она может быть создана enrollments_service)
	if not inspector.has_table("enrollments"):
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
	else:
		# Таблица существует, но проверяем индексы
		indexes = [idx["name"] for idx in inspector.get_indexes("enrollments")]
		if "ix_enrollments_user_id" not in indexes:
			op.create_index("ix_enrollments_user_id", "enrollments", ["user_id"])
		if "ix_enrollments_course_id" not in indexes:
			op.create_index("ix_enrollments_course_id", "enrollments", ["course_id"])

	# Проверяем, существует ли таблица orders
	if not inspector.has_table("orders"):
		op.create_table(
			"orders",
			sa.Column("id", sa.Integer(), primary_key=True),
			sa.Column("user_id", sa.Integer(), nullable=True),
			sa.Column("course_id", sa.Integer(), nullable=True),
			sa.Column("amount_cents", sa.Integer(), nullable=False),
			sa.Column("currency", sa.String(length=3), nullable=False, server_default=sa.text("'RUB'")),
			sa.Column("provider", sa.String(length=32), nullable=False, server_default=sa.text("'manual'")),
			sa.Column("provider_payment_id", sa.String(length=128), nullable=True),
			sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'pending'")),
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
				["user_id"],
				["users.id"],
				name="fk_orders_user",
				ondelete="SET NULL",
			),
			sa.ForeignKeyConstraint(
				["course_id"],
				["courses.id"],
				name="fk_orders_course",
				ondelete="SET NULL",
			),
		)
		op.create_index("ix_orders_user_id", "orders", ["user_id"])
		op.create_index("ix_orders_course_id", "orders", ["course_id"])
		op.create_index("ix_orders_provider_payment_id", "orders", ["provider_payment_id"])
	else:
		# Таблица существует, но проверяем индексы
		indexes = [idx["name"] for idx in inspector.get_indexes("orders")]
		if "ix_orders_user_id" not in indexes:
			op.create_index("ix_orders_user_id", "orders", ["user_id"])
		if "ix_orders_course_id" not in indexes:
			op.create_index("ix_orders_course_id", "orders", ["course_id"])
		if "ix_orders_provider_payment_id" not in indexes:
			op.create_index("ix_orders_provider_payment_id", "orders", ["provider_payment_id"])


def downgrade() -> None:
	op.drop_index("ix_orders_provider_payment_id", table_name="orders")
	op.drop_index("ix_orders_course_id", table_name="orders")
	op.drop_index("ix_orders_user_id", table_name="orders")
	op.drop_table("orders")

	op.drop_index("ix_enrollments_course_id", table_name="enrollments")
	op.drop_index("ix_enrollments_user_id", table_name="enrollments")
	op.drop_table("enrollments")

	op.drop_table("courses")

