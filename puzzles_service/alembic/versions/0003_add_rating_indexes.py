"""
Add indexes for rating and composite indexes for optimized queries.
"""
from __future__ import annotations

from alembic import op


revision = "0003_add_rating_indexes"
down_revision = "0002_add_gin_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Индекс на rating для быстрой фильтрации по рейтингу
    op.create_index(
        "ix_puzzles_rating",
        "puzzles",
        ["rating"],
    )
    
    # Индекс на popularity для сортировки и фильтрации популярных задач
    op.create_index(
        "ix_puzzles_popularity",
        "puzzles",
        ["popularity"],
    )


def downgrade() -> None:
    op.drop_index("ix_puzzles_popularity", table_name="puzzles")
    op.drop_index("ix_puzzles_rating", table_name="puzzles")

