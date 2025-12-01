"""
Add rating_history table.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0002_add_rating_history"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
	op.create_table(
		"rating_history",
		sa.Column("id", sa.Integer(), primary_key=True),
		sa.Column("user_id", sa.Integer(), nullable=False),
		sa.Column("format_type", sa.String(length=20), nullable=False),
		sa.Column("rating_before", sa.Integer(), nullable=False),
		sa.Column("rating_after", sa.Integer(), nullable=False),
		sa.Column("rating_change", sa.Integer(), nullable=False),
		sa.Column("game_id", sa.Text(), nullable=True),
		sa.Column("result", sa.String(length=20), nullable=True),
		sa.Column("opponent_id", sa.Integer(), nullable=True),
		sa.Column(
			"created_at",
			sa.DateTime(timezone=True),
			server_default=sa.text("now()"),
			nullable=False,
		),
		sa.ForeignKeyConstraint(
			["user_id"],
			["users.id"],
			name="fk_rating_history_user",
			ondelete="CASCADE",
		),
	)
	op.create_index("ix_rating_history_user_id", "rating_history", ["user_id"])
	op.create_index("ix_rating_history_format_type", "rating_history", ["format_type"])
	op.create_index("ix_rating_history_created_at", "rating_history", ["created_at"])


def downgrade() -> None:
	op.drop_index("ix_rating_history_created_at", table_name="rating_history")
	op.drop_index("ix_rating_history_format_type", table_name="rating_history")
	op.drop_index("ix_rating_history_user_id", table_name="rating_history")
	op.drop_table("rating_history")

