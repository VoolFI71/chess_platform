"""
Initial schema for users_service.
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
		sa.UniqueConstraint("username", name="uq_users_username"),
		sa.UniqueConstraint("email", name="uq_users_email"),
	)
	op.create_index("ix_users_blitz_rating", "users", ["blitz_rating"])
	op.create_index("ix_users_bullet_rating", "users", ["bullet_rating"])
	op.create_index("ix_users_rapid_rating", "users", ["rapid_rating"])
	op.create_index("ix_users_puzzle_rating", "users", ["puzzle_rating"])

	op.create_table(
		"friendships",
		sa.Column("id", sa.Integer(), primary_key=True),
		sa.Column("requester_id", sa.Integer(), nullable=False),
		sa.Column("addressee_id", sa.Integer(), nullable=False),
		sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'pending'")),
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
			["requester_id"],
			["users.id"],
			name="fk_friendships_requester",
			ondelete="CASCADE",
		),
		sa.ForeignKeyConstraint(
			["addressee_id"],
			["users.id"],
			name="fk_friendships_addressee",
			ondelete="CASCADE",
		),
		sa.UniqueConstraint("requester_id", "addressee_id", name="uq_friendships_pair"),
		sa.CheckConstraint("requester_id <> addressee_id", name="ck_friendships_not_self"),
	)
	op.create_index("ix_friendships_requester_id", "friendships", ["requester_id"])
	op.create_index("ix_friendships_addressee_id", "friendships", ["addressee_id"])
	op.create_index("ix_friendships_status", "friendships", ["status"])


def downgrade() -> None:
	op.drop_index("ix_friendships_status", table_name="friendships")
	op.drop_index("ix_friendships_addressee_id", table_name="friendships")
	op.drop_index("ix_friendships_requester_id", table_name="friendships")
	op.drop_table("friendships")

	op.drop_index("ix_users_puzzle_rating", table_name="users")
	op.drop_index("ix_users_rapid_rating", table_name="users")
	op.drop_index("ix_users_bullet_rating", table_name="users")
	op.drop_index("ix_users_blitz_rating", table_name="users")
	op.drop_table("users")

