"""Add daily_puzzle_solutions table

Revision ID: 0006
Revises: 0005
Create Date: 2025-01-XX

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0006_add_daily_puzzle_solutions'
down_revision = '0005_add_daily_puzzles'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'daily_puzzle_solutions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('solved_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_daily_puzzle_solutions_user_id'), 'daily_puzzle_solutions', ['user_id'], unique=False)
    op.create_index(op.f('ix_daily_puzzle_solutions_date'), 'daily_puzzle_solutions', ['date'], unique=False)
    op.create_unique_constraint('uq_daily_puzzle_solutions_user_date', 'daily_puzzle_solutions', ['user_id', 'date'])


def downgrade() -> None:
    op.drop_constraint('uq_daily_puzzle_solutions_user_date', 'daily_puzzle_solutions', type_='unique')
    op.drop_index(op.f('ix_daily_puzzle_solutions_date'), table_name='daily_puzzle_solutions')
    op.drop_index(op.f('ix_daily_puzzle_solutions_user_id'), table_name='daily_puzzle_solutions')
    op.drop_table('daily_puzzle_solutions')

