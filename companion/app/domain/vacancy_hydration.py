"""Lazy hydration of HH search projections through the official read API."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.db.models import Vacancy
from app.domain.vacancy_intake import IntakeResult, VacancyIntakeService
from app.hh.client import HHApiClient
from app.hh.normalize import normalize_vacancy

MIN_MEANINGFUL_DESCRIPTION_LENGTH = 200


@dataclass(frozen=True)
class HydrationResult:
    vacancy: Vacancy
    intake: IntakeResult | None
    fetched: bool


def vacancy_is_analysis_ready(vacancy: Vacancy) -> bool:
    return bool(vacancy.title.strip()) and (
        len((vacancy.description or '').strip()) >= MIN_MEANINGFUL_DESCRIPTION_LENGTH
    )


def hydrate_vacancy(
    session: Session, vacancy: Vacancy, *, client: HHApiClient | None = None
) -> HydrationResult:
    """Fetch one full HH vacancy and apply it through canonical intake semantics."""
    if vacancy.source != 'hh':
        raise ValueError('VACANCY_SOURCE_UNSUPPORTED')
    detail = (client or HHApiClient()).vacancy(vacancy.source_vacancy_id)
    normalized = normalize_vacancy(detail)
    if normalized.source_vacancy_id != vacancy.source_vacancy_id:
        raise ValueError('HH_VACANCY_ID_MISMATCH')
    result = VacancyIntakeService(session).intake(
        normalized,
        f'hh-hydrate:{vacancy.id}:{normalized.content_hash}',
    )
    session.flush()
    refreshed = session.get(Vacancy, vacancy.id)
    if refreshed is None:
        raise ValueError('VACANCY_DISAPPEARED')
    return HydrationResult(vacancy=refreshed, intake=result, fetched=True)


def ensure_analysis_ready(
    session: Session, vacancy: Vacancy, *, client: HHApiClient | None = None
) -> HydrationResult:
    if vacancy_is_analysis_ready(vacancy):
        return HydrationResult(vacancy=vacancy, intake=None, fetched=False)
    return hydrate_vacancy(session, vacancy, client=client)
