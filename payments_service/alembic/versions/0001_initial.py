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
	from sqlalchemy import inspect
	inspector = inspect(op.get_bind())

	# Orders table (no course_id - courses/lessons/enrollments removed)
	if not inspector.has_table("orders"):
		op.create_table(
			"orders",
			sa.Column("id", sa.Integer(), primary_key=True),
			sa.Column("user_id", sa.Integer(), nullable=True),
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
		)
		op.create_index("ix_orders_user_id", "orders", ["user_id"])
		op.create_index("ix_orders_provider_payment_id", "orders", ["provider_payment_id"])
	else:
		# Table exists, ensure indexes
		indexes = [idx["name"] for idx in inspector.get_indexes("orders")]
		if "ix_orders_user_id" not in indexes:
			op.create_index("ix_orders_user_id", "orders", ["user_id"])
		if "ix_orders_provider_payment_id" not in indexes:
			op.create_index("ix_orders_provider_payment_id", "orders", ["provider_payment_id"])


def downgrade() -> None:
	op.drop_index("ix_orders_provider_payment_id", table_name="orders")
	op.drop_index("ix_orders_user_id", table_name="orders")
	op.drop_table("orders")

