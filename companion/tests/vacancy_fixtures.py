"""Sanitized VacancyIntakeV1 fixture payloads — AOPS-06.

Each fixture exercises one scenario from the AOPS-06 prompt. The payloads are
already sanitized: they contain only normalized user-visible fields and never
cookies, DOM blobs, session data, hidden API data, or contact secrets.

These fixtures are companion-side intake payloads (not HH page-parser
fixtures), so they intentionally do not live in
``src/adapters/hh/__fixtures__/`` where fixture-regression tests auto-discover
parser variants.
"""

from __future__ import annotations

# ── Shared building block ────────────────────────────────────────────────


def _vacancy(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        'schema_version': 1,
        'source': 'hh',
        'source_vacancy_id': 'v-100',
        'url': 'https://hh.ru/vacancy/12345',
        'title': 'Senior Frontend Engineer',
        'company_id': 'comp-1',
        'company_name': 'Acme Corp',
        'salary_min': 250000,
        'salary_max': 350000,
        'currency': 'RUB',
        'work_mode': 'remote',
        'city': 'Москва',
        'experience': '3–6 лет',
        'description': (
            'Разработка frontend-приложений на React и TypeScript. '
            'Работа с командой дизайнеров и бэкенд-разработчиков. '
            'Участие в code review.'
        ),
        'skills': ['React', 'TypeScript', 'Redux'],
        'captured_at': '2026-08-04T10:00:00Z',
        'capture_source': 'extension:0.3.1',
        'parser_version': '0.3.1',
    }
    base.update(overrides)
    return base


# ── The nine sanitized fixture scenarios ─────────────────────────────────

# 1. Same vacancy captured twice — identical payload is a duplicate.
FIXTURE_SAME_TWICE: dict[str, object] = _vacancy()

# 2. Description changed — visible text differs, everything else identical.
FIXTURE_DESCRIPTION_CHANGED: dict[str, object] = _vacancy(
    description=(
        'Разработка frontend-приложений на React и TypeScript с упором на '
        'производительность и доступность. Наставничество младших коллег.'
    ),
)

# 3. Missing company — no company identity; company_name intentionally absent.
FIXTURE_MISSING_COMPANY: dict[str, object] = _vacancy(
    company_id=None,
    company_name=None,
)

# 4. Missing salary — no salary/currency; triage must not invent one.
FIXTURE_MISSING_SALARY: dict[str, object] = _vacancy(
    salary_min=None,
    salary_max=None,
    currency=None,
)

# 5. Remote anywhere — remote work, no location constraint, no city.
FIXTURE_REMOTE_ANYWHERE: dict[str, object] = _vacancy(
    work_mode='remote',
    city=None,
)

# 6. Remote restricted with unresolved eligibility — remote-only requirement
#    but the candidate's location eligibility cannot be confirmed.
FIXTURE_REMOTE_RESTRICTED_UNRESOLVED: dict[str, object] = _vacancy(
    work_mode='remote',
    city=None,
)

# 7. Office-required hard fail — the user requires an office but the vacancy
#    is fully remote.
FIXTURE_OFFICE_REQUIRED_HARD_FAIL: dict[str, object] = _vacancy(
    work_mode='remote',
    city='Москва',
)

# 8. Malformed/oversized description — description exceeds the 12000-char
#    contract limit and must be rejected by validation.
FIXTURE_OVERSIZED_DESCRIPTION: dict[str, object] = _vacancy(
    description='x' * 12001,
)

# 9. Non-HH/manual source — a manually captured vacancy with a different
#    source identity and no parser version.
FIXTURE_MANUAL_SOURCE: dict[str, object] = _vacancy(
    source='manual',
    source_vacancy_id='manual-1',
    capture_source='manual',
    parser_version=None,
)
