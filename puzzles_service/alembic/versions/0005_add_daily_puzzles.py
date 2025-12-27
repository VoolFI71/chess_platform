"""
Add daily_puzzles table for storing daily puzzle selections.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0005_add_daily_puzzles"
down_revision = "0004_add_composite_rating_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
	op.create_table(
		"daily_puzzles",
		sa.Column("id", sa.Integer(), primary_key=True),
		sa.Column("puzzle_id", sa.String(length=16), nullable=False),
		sa.Column("date", sa.Date(), nullable=False),
		sa.Column("rating", sa.Integer(), nullable=False),
		sa.Column(
			"chosen_at",
			sa.DateTime(timezone=True),
			nullable=False,
			server_default=sa.text("now()"),
		),
	)
	op.create_index("ix_daily_puzzles_puzzle_id", "daily_puzzles", ["puzzle_id"])
	# Unique constraint автоматически создает индекс, поэтому отдельный индекс не нужен
	op.create_unique_constraint("uq_daily_puzzles_date", "daily_puzzles", ["date"])


def downgrade() -> None:
	op.drop_constraint("uq_daily_puzzles_date", "daily_puzzles", type_="unique")
	op.drop_index("ix_daily_puzzles_puzzle_id", table_name="daily_puzzles")
	op.drop_table("daily_puzzles")

