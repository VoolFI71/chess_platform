"""
Initial schema for games_service.
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
        "games",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("white_id", sa.Integer(), nullable=True),
        sa.Column("black_id", sa.Integer(), nullable=True),
        sa.Column("initial_pos", sa.Text(), nullable=False, server_default=sa.text("'startpos'")),
        sa.Column("current_pos", sa.Text(), nullable=False),
        sa.Column("next_turn", sa.Text(), nullable=False, server_default=sa.text("'w'")),
        sa.Column("time_control", sa.JSON(), nullable=True),
        sa.Column("move_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'CREATED'")),
        sa.Column("white_clock_ms", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("black_clock_ms", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("termination_reason", sa.Text(), nullable=True),
        sa.Column("ended_by", sa.Integer(), nullable=True),
        sa.Column("pgn", sa.Text(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("white_clock_ms >= 0", name="games_white_clock_non_negative"),
        sa.CheckConstraint("black_clock_ms >= 0", name="games_black_clock_non_negative"),
    )
    op.create_index("ix_games_white_id", "games", ["white_id"])
    op.create_index("ix_games_black_id", "games", ["black_id"])
    op.create_index("ix_games_status_created_at", "games", ["status", "created_at"])

    op.create_table(
        "game_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("snapshot_move_index", sa.Integer(), nullable=False),
        sa.Column("fen", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_game_snapshots_game_id", "game_snapshots", ["game_id"])
    op.create_index(
        "uq_game_snapshots_game_move_index",
        "game_snapshots",
        ["game_id", "snapshot_move_index"],
        unique=True,
    )

    op.create_table(
        "moves",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("move_index", sa.Integer(), nullable=False),
        sa.Column("uci", sa.String(length=12), nullable=False),
        sa.Column("san", sa.String(length=32), nullable=True),
        sa.Column("fen_after", sa.Text(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=True),
        sa.Column("clocks_after", sa.JSON(), nullable=True),
        sa.Column("is_capture", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("promotion", sa.String(length=1), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_moves_game_id", "moves", ["game_id"])
    op.create_index(
        "uq_moves_game_move_index",
        "moves",
        ["game_id", "move_index"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_moves_game_move_index", table_name="moves")
    op.drop_index("ix_moves_game_id", table_name="moves")
    op.drop_table("moves")

    op.drop_index("uq_game_snapshots_game_move_index", table_name="game_snapshots")
    op.drop_index("ix_game_snapshots_game_id", table_name="game_snapshots")
    op.drop_table("game_snapshots")

    op.drop_index("ix_games_status_created_at", table_name="games")
    op.drop_index("ix_games_black_id", table_name="games")
    op.drop_index("ix_games_white_id", table_name="games")
    op.drop_table("games")
