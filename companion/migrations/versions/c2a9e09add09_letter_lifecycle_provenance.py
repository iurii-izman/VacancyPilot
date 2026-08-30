"""Add AOPS-09 letter lifecycle provenance and deterministic diff fields.

Revision ID: c2a9e09add09
Revises: a1f4c9d2e7b8
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'c2a9e09add09'
down_revision = 'a1f4c9d2e7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('letter_versions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('engine_run_id', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('bridge_request_id', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('vacancy_hash', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('validation_json', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('diff_json', sa.Text(), nullable=True))
        batch_op.create_foreign_key(
            'fk_letter_versions_engine_run_id',
            'engine_runs',
            ['engine_run_id'],
            ['id'],
            ondelete='SET NULL',
        )


def downgrade() -> None:
    with op.batch_alter_table('letter_versions', schema=None) as batch_op:
        batch_op.drop_constraint('fk_letter_versions_engine_run_id', type_='foreignkey')
        batch_op.drop_column('diff_json')
        batch_op.drop_column('validation_json')
        batch_op.drop_column('vacancy_hash')
        batch_op.drop_column('bridge_request_id')
        batch_op.drop_column('engine_run_id')
