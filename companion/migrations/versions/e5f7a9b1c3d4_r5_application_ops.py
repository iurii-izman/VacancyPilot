"""Additive R5 application sessions and discovery provenance."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'e5f7a9b1c3d4'
down_revision = 'd4a8c1f2b7e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('vacancies') as batch_op:
        batch_op.add_column(sa.Column('role_family', sa.String(), nullable=True))

    op.create_table(
        'application_sessions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='active'),
        sa.Column('started_at', sa.String(), nullable=False),
        sa.Column('completed_at', sa.String(), nullable=True),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "status IN ('active', 'completed', 'cancelled')", name='ck_application_session_status'
        ),
    )
    op.create_table(
        'application_session_items',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('vacancy_id', sa.String(), nullable=False),
        sa.Column('application_id', sa.String(), nullable=True),
        sa.Column('queue_state', sa.String(), nullable=False, server_default='SELECTED'),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('selected_at', sa.String(), nullable=False),
        sa.Column('analysis_run_id', sa.String(), nullable=True),
        sa.Column('started_at', sa.String(), nullable=True),
        sa.Column('completed_at', sa.String(), nullable=True),
        sa.Column('skip_reason', sa.String(), nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.ForeignKeyConstraint(['session_id'], ['application_sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vacancy_id'], ['vacancies.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['application_id'], ['applications.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['analysis_run_id'], ['engine_runs.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', 'vacancy_id', name='uq_application_session_vacancy'),
        sa.CheckConstraint(
            "queue_state IN ('SELECTED', 'NEEDS_ANALYSIS', 'ANALYZING', 'ANALYZED', 'SKIPPED', "
            "'NEEDS_REVIEW', 'READY_FOR_MANUAL_APPLY', 'APPLIED_CONFIRMED', 'FAILED', 'DEFERRED')",
            name='ck_application_session_item_state',
        ),
    )
    op.create_index(
        'ix_application_session_items_session_position',
        'application_session_items',
        ['session_id', 'position'],
    )
    op.create_table(
        'vacancy_search_profile_hits',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('vacancy_id', sa.String(), nullable=False),
        sa.Column('search_profile_id', sa.String(), nullable=False),
        sa.Column('first_seen_at', sa.String(), nullable=False),
        sa.Column('last_seen_at', sa.String(), nullable=False),
        sa.Column('hit_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('last_sync_run_id', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['vacancy_id'], ['vacancies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['search_profile_id'], ['search_profiles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['last_sync_run_id'], ['hh_sync_runs.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'vacancy_id', 'search_profile_id', name='uq_vacancy_search_profile_hit'
        ),
    )
    op.create_index(
        'ix_vacancy_search_profile_hits_profile',
        'vacancy_search_profile_hits',
        ['search_profile_id'],
    )


def downgrade() -> None:
    op.drop_index(
        'ix_vacancy_search_profile_hits_profile', table_name='vacancy_search_profile_hits'
    )
    op.drop_table('vacancy_search_profile_hits')
    op.drop_index(
        'ix_application_session_items_session_position', table_name='application_session_items'
    )
    op.drop_table('application_session_items')
    op.drop_table('application_sessions')
    with op.batch_alter_table('vacancies') as batch_op:
        batch_op.drop_column('role_family')
