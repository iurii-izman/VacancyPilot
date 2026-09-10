"""Bind provider execution to reviewed plans and an atomic budget ledger."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'f3a1c7d9e2b4'
down_revision = 'e5f7a9b1c3d4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('engine_runs') as batch_op:
        batch_op.add_column(sa.Column('provider_plan_hash', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('operation_key', sa.String(), nullable=True))
        batch_op.add_column(
            sa.Column('attempt_number', sa.Integer(), nullable=False, server_default='0')
        )
    op.create_index('ix_engine_runs_provider_plan_hash', 'engine_runs', ['provider_plan_hash'])
    op.create_table(
        'provider_executions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('operation_key', sa.String(), nullable=False),
        sa.Column('operation_kind', sa.String(), nullable=False),
        sa.Column('domain_identity', sa.String(), nullable=False),
        sa.Column('subject_key', sa.String(), nullable=False),
        sa.Column('provider_plan_hash', sa.String(), nullable=False),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('model', sa.String(), nullable=False),
        sa.Column('state', sa.String(), nullable=False, server_default='claimed'),
        sa.Column('owner_token', sa.String(), nullable=False),
        sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('run_id', sa.String(), nullable=True),
        sa.Column('error_category', sa.String(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('operation_key'),
        sa.CheckConstraint(
            "state IN ('claimed', 'dispatching', 'repairing', 'completed', "
            "'failed_before_dispatch', 'failed', 'outcome_unknown', 'budget_blocked')",
            name='ck_provider_execution_state',
        ),
    )
    op.create_index(
        'ix_provider_executions_plan_hash', 'provider_executions', ['provider_plan_hash']
    )
    op.create_table(
        'provider_attempts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('execution_id', sa.String(), nullable=False),
        sa.Column('attempt_number', sa.Integer(), nullable=False),
        sa.Column('scope', sa.String(), nullable=False),
        sa.Column('day_key', sa.String(), nullable=False),
        sa.Column('state', sa.String(), nullable=False, server_default='reserved'),
        sa.Column('dispatched_at', sa.String(), nullable=True),
        sa.Column('released_at', sa.String(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['execution_id'], ['provider_executions.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('execution_id', 'attempt_number', name='uq_provider_attempt_execution'),
        sa.CheckConstraint(
            "state IN ('reserved', 'consumed', 'released')",
            name='ck_provider_attempt_state',
        ),
    )
    op.create_index(
        'ix_provider_attempts_budget_day',
        'provider_attempts',
        ['scope', 'day_key', 'state'],
    )


def downgrade() -> None:
    op.drop_index('ix_provider_attempts_budget_day', table_name='provider_attempts')
    op.drop_table('provider_attempts')
    op.drop_index('ix_provider_executions_plan_hash', table_name='provider_executions')
    op.drop_table('provider_executions')
    op.drop_index('ix_engine_runs_provider_plan_hash', table_name='engine_runs')
    with op.batch_alter_table('engine_runs') as batch_op:
        batch_op.drop_column('attempt_number')
        batch_op.drop_column('operation_key')
        batch_op.drop_column('provider_plan_hash')
