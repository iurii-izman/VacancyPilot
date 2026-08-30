"""SQLAlchemy 2 declarative models — canonical SQLite domain schema.

Every table matches the frozen DATA_MODEL_V1.md contract (§ SQLite domain
tables).  Additional technical columns (``revision``, ``created_at``,
``updated_at``) are required by the same contract.
"""

from __future__ import annotations

from sqlalchemy import CheckConstraint, ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid, utcnow

# ── vacancies ──────────────────────────────────────────────────────────


class Vacancy(Base):
    __tablename__ = 'vacancies'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    source: Mapped[str]
    source_vacancy_id: Mapped[str]
    url: Mapped[str | None]
    title: Mapped[str]
    company_id: Mapped[str | None]
    company_name: Mapped[str | None]
    salary_min: Mapped[float | None]
    salary_max: Mapped[float | None]
    currency: Mapped[str | None]
    work_mode: Mapped[str | None]
    experience: Mapped[str | None]
    description: Mapped[str | None]
    description_hash: Mapped[str | None]
    skills_json: Mapped[str | None]
    first_seen_at: Mapped[str] = mapped_column(default=utcnow)
    last_seen_at: Mapped[str] = mapped_column(default=utcnow)
    updated_at: Mapped[str] = mapped_column(default=utcnow, onupdate=utcnow)
    archived: Mapped[bool] = mapped_column(default=False)
    revision: Mapped[int] = mapped_column(default=1)

    __table_args__ = (
        UniqueConstraint('source', 'source_vacancy_id', name='uq_vacancy_source'),
        Index('ix_vacancies_source_id', 'source', 'source_vacancy_id'),
    )

    # relationships
    snapshots: Mapped[list[VacancySnapshot]] = relationship(
        back_populates='vacancy', passive_deletes=True
    )
    applications: Mapped[list[Application]] = relationship(
        back_populates='vacancy', passive_deletes=True
    )
    engine_runs: Mapped[list[EngineRun]] = relationship(
        back_populates='vacancy', passive_deletes=True
    )


# ── vacancy_snapshots ──────────────────────────────────────────────────


class VacancySnapshot(Base):
    """Append-only snapshot of vacancy description at capture time."""

    __tablename__ = 'vacancy_snapshots'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    vacancy_id: Mapped[str] = mapped_column(
        ForeignKey('vacancies.id', ondelete='RESTRICT'), nullable=False
    )
    description_hash: Mapped[str]
    payload_json: Mapped[str | None]
    captured_at: Mapped[str] = mapped_column(default=utcnow)
    capture_source: Mapped[str]
    idempotency_key: Mapped[str | None] = mapped_column(unique=True)

    vacancy: Mapped[Vacancy] = relationship(back_populates='snapshots')


# ── applications ───────────────────────────────────────────────────────


class Application(Base, TimestampMixin):
    """Mutable projection; every status change writes an event transactionally."""

    __tablename__ = 'applications'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    vacancy_id: Mapped[str] = mapped_column(
        ForeignKey('vacancies.id', ondelete='RESTRICT'), nullable=False
    )
    status: Mapped[str]
    decision: Mapped[str | None]
    score: Mapped[float | None]
    confidence: Mapped[float | None]
    primary_proof: Mapped[str | None]
    selected_profile_id: Mapped[str | None]
    selected_resume_id: Mapped[str | None]
    applied_at: Mapped[str | None]
    next_action_at: Mapped[str | None]
    revision: Mapped[int] = mapped_column(default=1)

    vacancy: Mapped[Vacancy] = relationship(back_populates='applications')
    events: Mapped[list[ApplicationEvent]] = relationship(
        back_populates='application', passive_deletes=True
    )
    cover_letters: Mapped[list[CoverLetter]] = relationship(
        back_populates='application', passive_deletes=True
    )
    followups: Mapped[list[FollowUp]] = relationship(
        back_populates='application', passive_deletes=True
    )
    interview_packs: Mapped[list[InterviewPack]] = relationship(
        back_populates='application', passive_deletes=True
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('new', 'viewed', 'saved', 'rejected_by_me', 'letter_ready', "
            "'applied', 'hr_replied', 'interview', 'test_task', "
            "'rejected_by_company', 'offer', 'blacklist')",
            name='ck_application_status',
        ),
    )


# ── application_events ─────────────────────────────────────────────────


class ApplicationEvent(Base):
    """Append-only application timeline entry."""

    __tablename__ = 'application_events'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    application_id: Mapped[str] = mapped_column(
        ForeignKey('applications.id', ondelete='RESTRICT'), nullable=False
    )
    event_type: Mapped[str]
    source: Mapped[str]
    payload_json: Mapped[str | None]
    occurred_at: Mapped[str] = mapped_column(default=utcnow)
    created_at: Mapped[str] = mapped_column(default=utcnow)

    application: Mapped[Application] = relationship(back_populates='events')


# ── engine_runs ────────────────────────────────────────────────────────


class EngineRun(Base):
    """Append-only engine execution record. No secrets stored."""

    __tablename__ = 'engine_runs'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    vacancy_id: Mapped[str] = mapped_column(
        ForeignKey('vacancies.id', ondelete='RESTRICT'), nullable=False
    )
    engine_version: Mapped[str]
    engine_hash: Mapped[str] = mapped_column(default='')
    provider: Mapped[str]
    model: Mapped[str | None]
    prompt_version: Mapped[str]
    input_hash: Mapped[str]
    raw_output: Mapped[str | None]
    validated_output: Mapped[str | None]
    status: Mapped[str] = mapped_column(
        default='pending',
        # check constraint added via __table_args__
    )
    validation_errors_json: Mapped[str | None]
    token_input: Mapped[int | None]
    token_output: Mapped[int | None]
    estimated_cost: Mapped[float | None]
    created_at: Mapped[str] = mapped_column(default=utcnow)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'success', 'invalid', 'error')",
            name='ck_engine_run_status',
        ),
    )

    vacancy: Mapped[Vacancy] = relationship(back_populates='engine_runs')
    evidence_items: Mapped[list[EvidenceUsage]] = relationship(
        back_populates='engine_run', passive_deletes=True
    )
    interview_packs: Mapped[list[InterviewPack]] = relationship(back_populates='engine_run')


# ── evidence_usage ─────────────────────────────────────────────────────


class EvidenceUsage(Base):
    """Append-only trace of which evidence was used for which requirement."""

    __tablename__ = 'evidence_usage'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    engine_run_id: Mapped[str] = mapped_column(
        ForeignKey('engine_runs.id', ondelete='RESTRICT'), nullable=False
    )
    requirement: Mapped[str | None]
    evidence_level: Mapped[str | None]
    claim_id: Mapped[str | None]
    case_id: Mapped[str | None]
    portfolio_id: Mapped[str | None]
    allowed_wording: Mapped[str | None]

    engine_run: Mapped[EngineRun] = relationship(back_populates='evidence_items')


# ── cover_letters ──────────────────────────────────────────────────────


class CoverLetter(Base, TimestampMixin):
    """Current aggregate; immutable history stays in ``letter_versions``."""

    __tablename__ = 'cover_letters'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    application_id: Mapped[str] = mapped_column(
        ForeignKey('applications.id', ondelete='RESTRICT'), nullable=False
    )
    mode: Mapped[str]
    generated_text: Mapped[str | None]
    sent_text: Mapped[str | None]
    is_final: Mapped[bool] = mapped_column(default=False)
    revision: Mapped[int] = mapped_column(default=1)

    application: Mapped[Application] = relationship(back_populates='cover_letters')
    versions: Mapped[list[LetterVersion]] = relationship(
        back_populates='cover_letter', passive_deletes=True
    )


# ── letter_versions ────────────────────────────────────────────────────


class LetterVersion(Base):
    """Append-only letter version history. Sent versions are immutable."""

    __tablename__ = 'letter_versions'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    cover_letter_id: Mapped[str] = mapped_column(
        ForeignKey('cover_letters.id', ondelete='RESTRICT'), nullable=False
    )
    version_type: Mapped[str]
    body_text: Mapped[str]
    source: Mapped[str]
    provider: Mapped[str | None]
    model: Mapped[str | None]
    prompt_version: Mapped[str | None]
    engine_run_id: Mapped[str | None] = mapped_column(
        ForeignKey('engine_runs.id', ondelete='SET NULL')
    )
    bridge_request_id: Mapped[str | None]
    vacancy_hash: Mapped[str | None]
    validation_json: Mapped[str | None] = mapped_column(Text)
    diff_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(default=utcnow)

    __table_args__ = (
        CheckConstraint(
            "version_type IN ('generated', 'imported', 'user_draft', 'final', 'sent')",
            name='ck_letter_version_type',
        ),
    )

    cover_letter: Mapped[CoverLetter] = relationship(back_populates='versions')


# ── followups ──────────────────────────────────────────────────────────


class FollowUp(Base, TimestampMixin):
    __tablename__ = 'followups'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    application_id: Mapped[str] = mapped_column(
        ForeignKey('applications.id', ondelete='RESTRICT'), nullable=False
    )
    reason: Mapped[str | None]
    due_at: Mapped[str | None]
    status: Mapped[str] = mapped_column(default='pending')
    draft_text: Mapped[str | None]
    sent_at: Mapped[str | None]
    revision: Mapped[int] = mapped_column(default=1)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'sent', 'skipped')",
            name='ck_followup_status',
        ),
    )

    application: Mapped[Application] = relationship(back_populates='followups')


# ── interview_packs ────────────────────────────────────────────────────


class InterviewPack(Base, TimestampMixin):
    __tablename__ = 'interview_packs'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    application_id: Mapped[str] = mapped_column(
        ForeignKey('applications.id', ondelete='RESTRICT'), nullable=False
    )
    engine_run_id: Mapped[str | None] = mapped_column(
        ForeignKey('engine_runs.id', ondelete='SET NULL')
    )
    content_json: Mapped[str | None]
    export_path: Mapped[str | None]
    revision: Mapped[int] = mapped_column(default=1)

    application: Mapped[Application] = relationship(back_populates='interview_packs')
    engine_run: Mapped[EngineRun | None] = relationship(back_populates='interview_packs')


# ── hh_accounts ────────────────────────────────────────────────────────


class HHAccount(Base, TimestampMixin):
    """HH account metadata only — no tokens, no secrets."""

    __tablename__ = 'hh_accounts'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    hh_user_id: Mapped[str | None] = mapped_column(unique=True)
    display_name: Mapped[str | None]
    connected: Mapped[bool] = mapped_column(default=False)
    capabilities_json: Mapped[str | None]
    last_sync_at: Mapped[str | None]
    revision: Mapped[int] = mapped_column(default=1)


# ── hh_sync_runs ───────────────────────────────────────────────────────


class HHSyncRun(Base):
    """Append-only sync audit record."""

    __tablename__ = 'hh_sync_runs'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    sync_type: Mapped[str]
    status: Mapped[str] = mapped_column(default='running')
    items_seen: Mapped[int | None] = mapped_column(default=0)
    items_created: Mapped[int | None] = mapped_column(default=0)
    items_updated: Mapped[int | None] = mapped_column(default=0)
    error_summary: Mapped[str | None]
    result_json: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[str] = mapped_column(default=utcnow)
    finished_at: Mapped[str | None]

    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'success', 'partial', 'error')",
            name='ck_sync_run_status',
        ),
    )


# ── search_profiles ────────────────────────────────────────────────────


class SearchProfile(Base, TimestampMixin):
    __tablename__ = 'search_profiles'

    id: Mapped[str] = mapped_column(primary_key=True, default=new_uuid)
    name: Mapped[str]
    query_json: Mapped[str]
    enabled: Mapped[bool] = mapped_column(default=True)
    schedule: Mapped[str | None]
    last_run_at: Mapped[str | None]
    revision: Mapped[int] = mapped_column(default=1)


# ── settings ───────────────────────────────────────────────────────────


class Setting(Base, TimestampMixin):
    """Key-value companion settings.  Never stores credentials."""

    __tablename__ = 'settings'

    key: Mapped[str] = mapped_column(primary_key=True)
    value_json: Mapped[str]
    revision: Mapped[int] = mapped_column(default=1)
