"""Add indexes for attempt history and aggregate success counts."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0007_add_attempt_performance_indexes"
down_revision = "0006_add_daily_puzzle_solutions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_puzzle_attempts_user_created_at",
        "puzzle_attempts",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_puzzle_attempts_success",
        "puzzle_attempts",
        ["id"],
        postgresql_where=sa.text("status = 'success'"),
    )


def downgrade() -> None:
    op.drop_index("ix_puzzle_attempts_success", table_name="puzzle_attempts")
    op.drop_index("ix_puzzle_attempts_user_created_at", table_name="puzzle_attempts")
