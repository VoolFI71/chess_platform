"""
Add GIN indexes for puzzle filtering fields.
"""
from __future__ import annotations

from alembic import op


revision = "0002_add_gin_indexes"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_puzzles_themes_gin",
        "puzzles",
        ["themes"],
        postgresql_using="gin",
    )
    op.create_index(
        "ix_puzzles_opening_tags_gin",
        "puzzles",
        ["opening_tags"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("ix_puzzles_opening_tags_gin", table_name="puzzles")
    op.drop_index("ix_puzzles_themes_gin", table_name="puzzles")

