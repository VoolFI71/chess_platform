"""
Initial schema for puzzles_service.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "puzzles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("puzzle_id", sa.String(length=16), nullable=False),
        sa.Column("fen", sa.Text(), nullable=False),
        sa.Column("moves", postgresql.ARRAY(sa.String(length=8)), nullable=False),
        sa.Column("move_count", sa.Integer(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("rating_deviation", sa.Integer(), nullable=False),
        sa.Column("popularity", sa.Integer(), nullable=False),
        sa.Column("nb_plays", sa.Integer(), nullable=False),
        sa.Column("solved_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "themes",
            postgresql.ARRAY(sa.String(length=64)),
            nullable=False,
            server_default=sa.text("'{}'::varchar[]"),
        ),
        sa.Column(
            "opening_tags",
            postgresql.ARRAY(sa.String(length=64)),
            nullable=False,
            server_default=sa.text("'{}'::varchar[]"),
        ),
        sa.Column("game_url", sa.String(length=255), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_puzzles_puzzle_id", "puzzles", ["puzzle_id"], unique=True)

    op.create_table(
        "puzzle_user_stats",
        sa.Column("user_id", sa.Integer(), primary_key=True),
        sa.Column("solved_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("current_streak", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("best_streak", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("puzzle_rating", sa.Integer(), nullable=False, server_default=sa.text("1200")),
        sa.Column("provisional_games", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_time_ms", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_puzzle_id", sa.String(length=16), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "puzzle_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("puzzle_id", sa.String(length=16), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(length=20), nullable=False, server_default=sa.text("'survival'")),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("time_spent_ms", sa.Integer(), nullable=True),
        sa.Column("mistake_count", sa.Integer(), nullable=True),
        sa.Column("moves_played", sa.Integer(), nullable=True),
        sa.Column("rating_before", sa.Integer(), nullable=True),
        sa.Column("rating_after", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["puzzle_id"],
            ["puzzles.puzzle_id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_puzzle_attempts_puzzle_id", "puzzle_attempts", ["puzzle_id"])
    op.create_index("ix_puzzle_attempts_user_id", "puzzle_attempts", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_puzzle_attempts_user_id", table_name="puzzle_attempts")
    op.drop_index("ix_puzzle_attempts_puzzle_id", table_name="puzzle_attempts")
    op.drop_table("puzzle_attempts")

    op.drop_table("puzzle_user_stats")

    op.drop_index("ix_puzzles_puzzle_id", table_name="puzzles")
    op.drop_table("puzzles")
