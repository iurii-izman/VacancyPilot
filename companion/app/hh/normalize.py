"""Normalize official HH vacancy projections into the existing intake contract."""

from __future__ import annotations

import html
import re
from typing import Any

from app.domain.vacancy_intake import NormalizedVacancy, normalize_intake

_TAG_RE = re.compile(r'<[^>]+>')


def _text(value: Any, limit: int) -> str | None:
    if value is None:
        return None
    result = html.unescape(_TAG_RE.sub(' ', str(value)))
    result = re.sub(r'\s+', ' ', result).strip()
    return result[:limit] or None


def _nested_name(value: Any) -> tuple[str | None, str | None]:
    if not isinstance(value, dict):
        return None, None
    return _text(value.get('id'), 128), _text(value.get('name'), 500)


def _salary(item: dict[str, Any]) -> tuple[float | None, float | None, str | None]:
    salary = item.get('salary')
    if not isinstance(salary, dict):
        return None, None, None
    return salary.get('from'), salary.get('to'), _text(salary.get('currency'), 16)


def normalize_vacancy(item: dict[str, Any]) -> NormalizedVacancy:
    vacancy_id = _text(item.get('id'), 128)
    if not vacancy_id:
        raise ValueError('HH vacancy has no stable id')
    company_id, company_name = _nested_name(item.get('employer'))
    area_id, area_name = _nested_name(item.get('area'))
    salary_min, salary_max, currency = _salary(item)
    schedule = item.get('schedule')
    work_mode = None
    if isinstance(schedule, dict):
        schedule_id = str(schedule.get('id') or '')
        work_mode = {'remote': 'remote', 'flexible': 'hybrid', 'shift': 'office'}.get(schedule_id)
    skills = tuple(
        name
        for name in (
            _text(x.get('name'), 100) for x in (item.get('key_skills') or []) if isinstance(x, dict)
        )
        if name
    )[:20]
    return normalize_intake(
        {
            'schema_version': 1,
            'source': 'hh',
            'source_vacancy_id': vacancy_id,
            'url': _text(item.get('alternate_url') or item.get('url'), 2048),
            'title': _text(item.get('name'), 500),
            'company_id': company_id,
            'company_name': company_name,
            'salary_min': salary_min,
            'salary_max': salary_max,
            'currency': currency,
            'work_mode': work_mode,
            'city': area_name or area_id,
            'experience': _text(
                (item.get('experience') or {}).get('name')
                if isinstance(item.get('experience'), dict)
                else None,
                500,
            ),
            'description': _text(item.get('description'), 12000),
            'skills': list(skills),
            'capture_source': 'hh_public_api',
        }
    )
