"""Add sanitized AOPS-10 sync result projection.

Revision ID: 3b7a1d2e9f10
Revises: c2a9e09add09
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '3b7a1d2e9f10'
down_revision = 'c2a9e09add09'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('hh_sync_runs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('result_json', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('hh_sync_runs', schema=None) as batch_op:
        batch_op.drop_column('result_json')
