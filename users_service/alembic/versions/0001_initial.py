"""Baseline schema for users_service."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "schools",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("subdomain", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_schools_slug", "schools", ["slug"], unique=True)
    op.create_index("ix_schools_subdomain", "schools", ["subdomain"], unique=True)
    op.execute(sa.text("INSERT INTO schools (id, name, slug) VALUES (1, 'ChessMint', 'chessmint')"))
    op.execute(sa.text("SELECT setval(pg_get_serial_sequence('schools', 'id'), 1, true)"))

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=32), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("blitz_rating", sa.Integer(), nullable=False, server_default=sa.text("1200")),
        sa.Column("bullet_rating", sa.Integer(), nullable=False, server_default=sa.text("1200")),
        sa.Column("rapid_rating", sa.Integer(), nullable=False, server_default=sa.text("1200")),
        sa.Column("puzzle_rating", sa.Integer(), nullable=False, server_default=sa.text("1200")),
        sa.Column("games_played", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("school_id", sa.Integer(), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=False, server_default=sa.text("'student'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], name="fk_users_school", ondelete="SET NULL"),
        sa.UniqueConstraint("username", name="uq_users_username"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_blitz_rating", "users", ["blitz_rating"])
    op.create_index("ix_users_bullet_rating", "users", ["bullet_rating"])
    op.create_index("ix_users_rapid_rating", "users", ["rapid_rating"])
    op.create_index("ix_users_puzzle_rating", "users", ["puzzle_rating"])
    op.create_index("ix_users_school_id", "users", ["school_id"])
    op.create_index("ix_users_role", "users", ["role"])

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
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_rating_history_user", ondelete="CASCADE"),
    )
    op.create_index("ix_rating_history_user_id", "rating_history", ["user_id"])
    op.create_index("ix_rating_history_format_type", "rating_history", ["format_type"])
    op.create_index("ix_rating_history_created_at", "rating_history", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_rating_history_created_at", table_name="rating_history")
    op.drop_index("ix_rating_history_format_type", table_name="rating_history")
    op.drop_index("ix_rating_history_user_id", table_name="rating_history")
    op.drop_table("rating_history")

    op.drop_index("ix_users_role", table_name="users")
    op.drop_index("ix_users_school_id", table_name="users")
    op.drop_index("ix_users_puzzle_rating", table_name="users")
    op.drop_index("ix_users_rapid_rating", table_name="users")
    op.drop_index("ix_users_bullet_rating", table_name="users")
    op.drop_index("ix_users_blitz_rating", table_name="users")
    op.drop_table("users")

    op.drop_index("ix_schools_subdomain", table_name="schools")
    op.drop_index("ix_schools_slug", table_name="schools")
    op.drop_table("schools")
