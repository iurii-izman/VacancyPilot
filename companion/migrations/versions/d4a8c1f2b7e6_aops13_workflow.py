"""Add AOPS-13 workflow statuses and event idempotency metadata."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'd4a8c1f2b7e6'
down_revision = '3b7a1d2e9f10'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('applications') as batch_op:
        batch_op.drop_constraint('ck_application_status', type_='check')
        batch_op.create_check_constraint(
            'ck_application_status',
            "status IN ('new', 'viewed', 'saved', 'analyzed', 'letter_ready', 'ready_to_send', "
            "'applied', 'hr_replied', 'interview', 'test_task', 'offer', 'rejected_by_me', "
            "'rejected_by_company', "
            "'blacklist', 'archived')",
        )
    with op.batch_alter_table('application_events') as batch_op:
        batch_op.add_column(sa.Column('idempotency_key', sa.String(), nullable=True))
        batch_op.create_unique_constraint('uq_application_event_idempotency', ['idempotency_key'])
    with op.batch_alter_table('followups') as batch_op:
        batch_op.add_column(sa.Column('idempotency_key', sa.String(), nullable=True))
        batch_op.create_unique_constraint('uq_followup_idempotency', ['idempotency_key'])
        batch_op.drop_constraint('ck_followup_status', type_='check')
        batch_op.create_check_constraint(
            'ck_followup_status',
            "status IN ('pending', 'sent', 'skipped', 'scheduled', 'completed', 'snoozed', "
            "'cancelled')",
        )


def downgrade() -> None:
    with op.batch_alter_table('followups') as batch_op:
        batch_op.drop_constraint('ck_followup_status', type_='check')
        batch_op.create_check_constraint(
            'ck_followup_status', "status IN ('pending', 'sent', 'skipped')"
        )
        batch_op.drop_constraint('uq_followup_idempotency', type_='unique')
        batch_op.drop_column('idempotency_key')
    with op.batch_alter_table('application_events') as batch_op:
        batch_op.drop_constraint('uq_application_event_idempotency', type_='unique')
        batch_op.drop_column('idempotency_key')
    with op.batch_alter_table('applications') as batch_op:
        batch_op.drop_constraint('ck_application_status', type_='check')
        batch_op.create_check_constraint(
            'ck_application_status',
            "status IN ('new', 'viewed', 'saved', 'rejected_by_me', 'letter_ready', 'applied', "
            "'hr_replied', 'interview', 'test_task', 'rejected_by_company', 'offer', 'blacklist')",
        )
