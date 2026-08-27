"""
Drop friendships table (friends feature removed).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0004_drop_friendships"
down_revision = "0003_add_schools"
branch_labels = None
depends_on = None


def upgrade() -> None:
	op.drop_index("ix_friendships_status", table_name="friendships")
	op.drop_index("ix_friendships_addressee_id", table_name="friendships")
	op.drop_index("ix_friendships_requester_id", table_name="friendships")
	op.drop_table("friendships")


def downgrade() -> None:
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
