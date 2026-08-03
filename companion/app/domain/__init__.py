"""Domain layer — repository classes and transactional invariants."""

from app.domain.invariants import (
    ensure_append_only,
    ensure_no_secret_columns,
    ensure_sent_immutable,
)
from app.domain.repositories import (
    ApplicationRepository,
    CoverLetterRepository,
    VacancyRepository,
)

__all__ = [
    'ApplicationRepository',
    'CoverLetterRepository',
    'VacancyRepository',
    'ensure_append_only',
    'ensure_no_secret_columns',
    'ensure_sent_immutable',
]
