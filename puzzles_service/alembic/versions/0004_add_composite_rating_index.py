"""
Add composite index for ORDER BY rating, puzzle_id optimization.

Этот индекс критичен для производительности GET /puzzles/.
Без него PostgreSQL не может эффективно использовать индекс для сортировки
по двум полям одновременно, что приводит к медленным запросам (176ms).
"""
from __future__ import annotations

from alembic import op


revision = "0004_add_composite_rating_index"
down_revision = "0003_add_rating_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Проверяем существование индексов перед созданием
    from sqlalchemy import inspect
    inspector = inspect(op.get_bind())
    indexes = [idx["name"] for idx in inspector.get_indexes("puzzles")]
    
    # Композитный индекс для ORDER BY rating, puzzle_id
    # Это критично для производительности GET /puzzles/
    # Запрос: SELECT * FROM puzzles ORDER BY rating ASC, puzzle_id ASC LIMIT 20
    # Без этого индекса PostgreSQL делает полное сканирование или сортировку в памяти
    # С индексом - использует индекс для быстрой сортировки
    if "ix_puzzles_rating_puzzle_id" not in indexes:
        op.create_index(
            "ix_puzzles_rating_puzzle_id",
            "puzzles",
            ["rating", "puzzle_id"],
        )


def downgrade() -> None:
    op.drop_index("ix_puzzles_rating_puzzle_id", table_name="puzzles")
