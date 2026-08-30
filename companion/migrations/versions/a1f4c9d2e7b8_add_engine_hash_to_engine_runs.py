"""Add engine_hash to engine_runs — AOPS-08 run identity.

Revision ID: a1f4c9d2e7b8
Revises: 9f6dc2bb4869
Create Date: 2026-08-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'a1f4c9d2e7b8'
down_revision = '9f6dc2bb4869'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('engine_runs', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('engine_hash', sa.String(), nullable=False, server_default='')
        )


def downgrade() -> None:
    with op.batch_alter_table('engine_runs', schema=None) as batch_op:
        batch_op.drop_column('engine_hash')
