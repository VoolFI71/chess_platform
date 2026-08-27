"""
Add schools table and school_id, role to users (multi-tenancy foundation).
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0003_add_schools"
down_revision = "0002_add_rating_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
	# 1. Create schools table
	op.create_table(
		"schools",
		sa.Column("id", sa.Integer(), primary_key=True),
		sa.Column("name", sa.String(length=255), nullable=False),
		sa.Column("slug", sa.String(length=64), nullable=False),
		sa.Column("subdomain", sa.String(length=64), nullable=True),
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
	)
	op.create_index("ix_schools_slug", "schools", ["slug"], unique=True)
	op.create_index("ix_schools_subdomain", "schools", ["subdomain"], unique=True)

	# 2. Insert default school (first tenant)
	op.execute(
		sa.text(
			"INSERT INTO schools (id, name, slug, subdomain) VALUES (1, 'ChessMint', 'chessmint', NULL)"
		)
	)

	# 3. Add school_id and role to users
	op.add_column("users", sa.Column("school_id", sa.Integer(), nullable=True))
	op.add_column("users", sa.Column("role", sa.String(length=32), nullable=False, server_default=sa.text("'student'")))
	op.create_foreign_key(
		"fk_users_school",
		"users",
		"schools",
		["school_id"],
		["id"],
		ondelete="SET NULL",
	)
	op.create_index("ix_users_school_id", "users", ["school_id"])
	op.create_index("ix_users_role", "users", ["role"])

	# 4. Backfill existing users with default school
	op.execute(sa.text("UPDATE users SET school_id = 1 WHERE school_id IS NULL"))


def downgrade() -> None:
	op.drop_index("ix_users_role", table_name="users")
	op.drop_index("ix_users_school_id", table_name="users")
	op.drop_constraint("fk_users_school", "users", type_="foreignkey")
	op.drop_column("users", "role")
	op.drop_column("users", "school_id")

	op.drop_index("ix_schools_subdomain", table_name="schools")
	op.drop_index("ix_schools_slug", table_name="schools")
	op.drop_table("schools")
