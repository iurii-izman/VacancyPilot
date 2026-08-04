"""Stage A no-LLM triage engine — AOPS-06.

Deterministic, explainable triage for a captured vacancy.  The engine mirrors
the extension's rule-based scorer (``src/services/scoring.ts``) where the
semantics overlap: identical component weights, caps and penalties, so the two
implementations stay in parity by design.

Versioned parity note (reported in the AOPS-06 handoff):

- Component weights/caps/penalties intentionally mirror ``DEFAULT_WEIGHTS``,
  ``CAP_RULES`` and ``PENALTIES`` from the extension scorer.
- Two deliberate differences exist because the data available differs:
  1. ``description_hash``: extension ``hashString`` is djb2 base-36; the
     companion uses SHA-256 (mandated by DATA_MODEL_V1 ``[0-9a-f]{64}``).
  2. The company component is blocked/not-blocked only (companion has no
     ``companies`` table), whereas the extension can grey-list a company.

Stage A scope guard: this engine never upgrades evidence level (no V4) and
never drafts a cover letter.
"""

from __future__ import annotations

import dataclasses
import re

# ── Component weights (mirror DEFAULT_WEIGHTS in src/services/scoring.ts) ──

WEIGHTS = {
    'title_match': 20,
    'must_have_skills': 25,
    'nice_to_have_skills': 10,
    'experience_fit': 15,
    'work_mode_location': 10,
    'salary_fit': 10,
    'company_preference': 5,
    'language_schedule_misc': 5,
}

SENIORITY_YEARS = {
    'junior': 1,
    'middle': 3,
    'senior': 6,
    'lead': 9,
    'principal': 12,
}

WORK_MODE_VALUES = ('remote', 'hybrid', 'office', 'unknown')


@dataclasses.dataclass(frozen=True)
class TriageConfig:
    """Explicit candidate configuration used to triage a vacancy."""

    target_titles: tuple[str, ...] = ()
    role_family: str | None = None
    must_have_skills: tuple[str, ...] = ()
    nice_to_have_skills: tuple[str, ...] = ()
    salary_expectation_min: float | None = None
    experience_years: float | None = None
    seniority: str | None = None
    preferred_work_modes: tuple[str, ...] = ()
    preferred_cities: tuple[str, ...] = ()
    remote_only: bool = False
    office_required: bool = False
    location_eligible: bool | None = None
    blocked_companies: tuple[str, ...] = ()


@dataclasses.dataclass(frozen=True)
class TriageVacancy:
    """The normalized vacancy view the triage engine operates on."""

    source: str
    source_vacancy_id: str
    title: str
    company_name: str | None
    work_mode: str | None
    city: str | None
    experience_raw: str | None
    description: str | None
    skills: tuple[str, ...]
    salary_min: float | None
    salary_max: float | None
    currency: str | None
    archived: bool
    seen_before: bool


@dataclasses.dataclass(frozen=True)
class RiskFlag:
    code: str
    severity: str  # critical | high | medium | low | info
    message: str
    evidence: str | None = None


@dataclasses.dataclass(frozen=True)
class HardGate:
    code: str  # remote_only | work_format | eligibility
    status: str  # pass | fail | needs_input | na
    explanation: str


@dataclasses.dataclass(frozen=True)
class ScoreComponent:
    key: str
    score: int
    max: int
    reasons: tuple[str, ...]


@dataclasses.dataclass(frozen=True)
class TriageResult:
    verdict: str  # pass | needs_input | skip
    recommendation: str  # apply | consider | skip | needs_input
    score: int
    hard_gates: tuple[HardGate, ...]
    components: tuple[ScoreComponent, ...]
    risk_flags: tuple[RiskFlag, ...]
    fit_reasons: tuple[str, ...]
    caps_applied: tuple[str, ...]
    engine: str = 'stage-a-no-llm-v1'


# ── Text helpers (mirror scoring.ts) ──────────────────────────────────────


def _normalize(value: str) -> str:
    return value.strip().lower()


def _word_overlap(a: str, b: str) -> float:
    words_a = {w for w in _normalize(a).split() if w}
    words_b = {w for w in _normalize(b).split() if w}
    if not words_a or not words_b:
        return 0.0
    overlap = sum(1 for w in words_a if w in words_b)
    return overlap / max(len(words_a), len(words_b))


def _contains(text: str, term: str) -> bool:
    return _normalize(term) in _normalize(text)


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(_contains(text, term) for term in terms)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _round(value: float) -> int:
    return int(round(value))


def parse_experience_min_years(raw: str | None) -> int | None:
    """Mirror parseExperienceMinYears in src/services/tracker.ts."""
    if not raw:
        return None
    s = raw.strip().lower()
    if not s:
        return None

    if re.fullmatch(
        r'(?:не\s+требуется|нет\s+опыта|без\s+опыта|no\s+experience|not\s+required)',
        s,
    ):
        return 0
    more_than = re.search(r'more\s+than\s+(\d+)', s)
    if more_than:
        return int(more_than.group(1))
    bolee = re.search(r'более\s+(\d+)', s)
    if bolee:
        return int(bolee.group(1))
    ot = re.match(r'^от\s+(\d+)', s)
    if ot:
        return int(ot.group(1))
    plus = re.match(r'^(\d+)\s*\+', s)
    if plus:
        return int(plus.group(1))
    rng = re.search(r'(\d+)\s*[–\-—]\s*(\d+)', s)
    if rng:
        return int(rng.group(1))
    single = re.match(r'^(\d+)\s*(?:года?|лет|years?)', s)
    if single:
        return int(single.group(1))
    return None


def _resolve_experience_years(config: TriageConfig) -> float | None:
    if config.experience_years is not None:
        return config.experience_years
    if config.seniority:
        return SENIORITY_YEARS.get(config.seniority.strip().lower())
    return None


def _skill_matches(skill: str, vacancy: TriageVacancy) -> bool:
    norm = _normalize(skill)
    if any(_normalize(s) == norm for s in vacancy.skills):
        return True
    description = vacancy.description or ''
    return _contains(description, skill)


# ── Component scorers (mirror scoring.ts semantics) ──────────────────────


def _score_title_match(vacancy: TriageVacancy, config: TriageConfig) -> tuple[int, list[str]]:
    reasons: list[str] = []
    titles = [t for t in config.target_titles if t]
    job_title = vacancy.title or ''
    if not titles:
        reasons.append('No target titles configured')
        return _round(WEIGHTS['title_match'] * 0.5), reasons
    if not job_title:
        reasons.append('Vacancy title is empty')
        return 0, reasons

    job_norm = _normalize(job_title)
    best_overlap = 0.0
    exact = False
    for title in titles:
        title_norm = _normalize(title)
        if job_norm == title_norm:
            exact = True
            break
        best_overlap = max(best_overlap, _word_overlap(job_norm, title_norm))

    role_family = config.role_family
    role_family_hit = (
        bool(role_family) and (role_family is not None) and _contains(job_title, role_family)
    )

    if exact:
        reasons.append(f'Title exactly matches target: "{job_title}"')
        return WEIGHTS['title_match'], reasons
    if best_overlap >= 0.7:
        reasons.append(
            f'Title strongly overlaps with target titles ({_round(best_overlap * 100)}%)'
        )
        return _round(WEIGHTS['title_match'] * 0.8), reasons
    if best_overlap >= 0.4 or role_family_hit:
        reasons.append(
            f'Title partially overlaps with target titles ({_round(best_overlap * 100)}%)'
        )
        if role_family_hit:
            reasons.append(f'Role family "{config.role_family}" found in title')
        return _round(WEIGHTS['title_match'] * 0.5), reasons
    if best_overlap > 0:
        reasons.append(f'Title weakly overlaps with target titles ({_round(best_overlap * 100)}%)')
        return _round(WEIGHTS['title_match'] * 0.25), reasons
    reasons.append(f'Title "{job_title}" does not match any target title')
    return 0, reasons


def _score_must_have(
    vacancy: TriageVacancy, config: TriageConfig, flags: list[RiskFlag]
) -> tuple[int, list[str]]:
    reasons: list[str] = []
    required = [s for s in config.must_have_skills if s]
    if not required:
        reasons.append('No must-have skills configured')
        return _round(WEIGHTS['must_have_skills'] * 0.5), reasons

    matched = sum(1 for s in required if _skill_matches(s, vacancy))
    missing = [s for s in required if not _skill_matches(s, vacancy)]
    ratio = matched / len(required)
    score = _round(ratio * WEIGHTS['must_have_skills'])

    if matched > 0:
        reasons.append(f'Matched {matched}/{len(required)} must-have skills')
    if missing:
        first = ', '.join(missing[:3])
        reasons.append(f'Missing must-have skills: {first}{"..." if len(missing) > 3 else ""}')
        if len(missing) >= (len(required) + 1) // 2:
            flags.append(
                RiskFlag(
                    code='missing_core_skill',
                    severity='high',
                    message=f'Missing {len(missing)} core must-have skills: {first}',
                )
            )
    return score, reasons


def _score_nice_to_have(vacancy: TriageVacancy, config: TriageConfig) -> tuple[int, list[str]]:
    reasons: list[str] = []
    nice = [s for s in config.nice_to_have_skills if s]
    if not nice:
        reasons.append('No nice-to-have skills configured')
        return _round(WEIGHTS['nice_to_have_skills'] * 0.5), reasons
    matched = sum(1 for s in nice if _skill_matches(s, vacancy))
    ratio = matched / len(nice)
    if matched > 0:
        reasons.append(f'Matched {matched}/{len(nice)} nice-to-have skills')
    return _round(ratio * WEIGHTS['nice_to_have_skills']), reasons


def _score_experience_fit(
    vacancy: TriageVacancy, config: TriageConfig, flags: list[RiskFlag]
) -> tuple[int, list[str]]:
    reasons: list[str] = []
    job_req = parse_experience_min_years(vacancy.experience_raw)
    if job_req is None:
        reasons.append('Experience requirement not parsed from vacancy')
        return _round(WEIGHTS['experience_fit'] * 0.5), reasons

    profile_years = _resolve_experience_years(config)
    if profile_years is None:
        reasons.append(f'Vacancy requires ~{job_req}+ years experience')
        reasons.append('Profile experience not configured — scored neutrally')
        return _round(WEIGHTS['experience_fit'] * 0.5), reasons

    source = (
        f'{profile_years:g} years'
        if config.experience_years is not None
        else f'seniority "{config.seniority}" (~{profile_years:g} years estimated)'
    )
    reasons.append(f'Vacancy requires ~{job_req}+ years, candidate has {source}')

    if profile_years >= job_req:
        reasons.append('Experience meets or exceeds vacancy requirement')
    else:
        gap = job_req - profile_years
        if gap <= 2:
            reasons.append(f'Experience slightly below requirement (gap: {gap:g} year(s))')
            return _round(WEIGHTS['experience_fit'] * 0.7), reasons
        ratio = profile_years / max(1.0, float(job_req))
        score = _round(WEIGHTS['experience_fit'] * _clamp(ratio, 0.1, 0.5))
        reasons.append(
            f'Experience significantly below requirement (have {profile_years:g}, need {job_req}+)'
        )
        flags.append(
            RiskFlag(
                code='underqualified',
                severity='high' if gap >= 4 else 'medium',
                message=f'Candidate has {profile_years:g} years, vacancy requires {job_req}+',
            )
        )
        return score, reasons

    if job_req > 0 and profile_years >= job_req * 2:
        flags.append(
            RiskFlag(
                code='overqualified',
                severity='low',
                message=f'Candidate has {profile_years:g} years — significantly above '
                f'{job_req}+ requirement',
            )
        )
        reasons.append('Experience significantly above requirement (possible overqualification)')
    return WEIGHTS['experience_fit'], reasons


def _score_work_mode_location(
    vacancy: TriageVacancy, config: TriageConfig, flags: list[RiskFlag]
) -> tuple[int, list[str]]:
    reasons: list[str] = []
    weight = WEIGHTS['work_mode_location']
    preferred_modes = list(config.preferred_work_modes)
    preferred_cities = list(config.preferred_cities)
    mode_weight = _round(weight * 0.6) if preferred_cities else weight
    city_weight = weight - mode_weight
    score = 0.0

    mode = vacancy.work_mode
    if not preferred_modes:
        score += mode_weight * 0.5
        reasons.append('No preferred work modes configured')
    elif mode is None or mode == 'unknown':
        score += mode_weight * 0.5
        reasons.append('Work mode not specified in vacancy')
    elif mode in preferred_modes:
        score += mode_weight
        reasons.append(f'Work mode "{mode}" matches preferences')
    else:
        reasons.append(
            f'Work mode "{mode}" does not match preferences ({", ".join(preferred_modes)})'
        )
        flags.append(
            RiskFlag(
                code='work_mode_mismatch',
                severity='medium',
                message=f'Work mode "{mode}" not in preferred modes',
            )
        )

    city = vacancy.city
    if not preferred_cities:
        score += city_weight * 0.5
    elif not city:
        score += city_weight * 0.5
        reasons.append('City not specified in vacancy')
    else:
        city_norm = _normalize(city)
        match = any(
            _normalize(c) == city_norm or _normalize(c) in city_norm or city_norm in _normalize(c)
            for c in preferred_cities
        )
        if match:
            score += city_weight
            reasons.append(f'City "{city}" matches preferences')
        else:
            reasons.append(f'City "{city}" not in preferred cities')
    return _round(_clamp(score, 0, weight)), reasons


def _score_salary_fit(
    vacancy: TriageVacancy, config: TriageConfig, flags: list[RiskFlag]
) -> tuple[int, list[str]]:
    reasons: list[str] = []
    weight = WEIGHTS['salary_fit']
    if vacancy.salary_min is None and vacancy.salary_max is None:
        reasons.append('Salary not specified in vacancy')
        flags.append(
            RiskFlag(
                code='salary_unknown',
                severity='info',
                message='Salary not provided in vacancy',
            )
        )
        return _round(weight * 0.5), reasons

    profile_min = config.salary_expectation_min
    if profile_min is None:
        reasons.append('No salary expectation configured — scored neutrally')
        return _round(weight * 0.5), reasons

    job_min = vacancy.salary_min or 0.0
    job_max = vacancy.salary_max if vacancy.salary_max is not None else job_min

    currency = f' {vacancy.currency}' if vacancy.currency else ''
    if job_max < profile_min:
        shortfall = profile_min - job_max
        ratio = min(1.0, shortfall / max(1.0, profile_min))
        score = _round(_clamp(weight * (1 - ratio), 0, weight))
        reasons.append(
            f'Salary range {job_min:g}–{job_max:g}{currency} below expectation {profile_min:g}'
        )
        flags.append(
            RiskFlag(
                code='salary_below_minimum',
                severity='medium',
                message=f'Max salary {job_max:g} below expected {profile_min:g}',
            )
        )
        return score, reasons
    if job_min < profile_min <= job_max:
        reasons.append(
            f'Salary range {job_min:g}–{job_max:g}{currency} '
            f'partially covers expectation {profile_min:g}'
        )
        return _round(weight * 0.7), reasons
    reasons.append(
        f'Salary range {job_min:g}–{job_max:g}{currency} meets expectation {profile_min:g}'
    )
    return weight, reasons


def _score_company_preference(
    vacancy: TriageVacancy, config: TriageConfig, flags: list[RiskFlag]
) -> tuple[int, list[str]]:
    reasons: list[str] = []
    weight = WEIGHTS['company_preference']
    company = (vacancy.company_name or '').strip()
    blocked = any(
        company and _normalize(company) == _normalize(b) for b in config.blocked_companies if b
    )
    if blocked:
        reasons.append(f'Company "{company}" is blocked')
        flags.append(
            RiskFlag(
                code='company_blacklist',
                severity='critical',
                message=f'Company "{company}" is blocked',
            )
        )
        return 0, reasons
    reasons.append('Company has no restrictions')
    return weight, reasons


def _score_misc(vacancy: TriageVacancy, flags: list[RiskFlag]) -> tuple[int, list[str]]:
    reasons: list[str] = []
    weight = WEIGHTS['language_schedule_misc']
    score = float(weight)
    description = vacancy.description or ''

    if _contains_any(description, ('relocation', 'relocate', 'переезд', 'релокация')):
        score -= weight * 0.2
        reasons.append('Vacancy mentions relocation')
        flags.append(
            RiskFlag(
                code='relocation_required',
                severity='low',
                message='Vacancy requires or mentions relocation',
            )
        )

    if len(description) < 100:
        score -= weight * 0.15
        reasons.append('Very short description — may be vague')
        flags.append(
            RiskFlag(
                code='vague_description',
                severity='low',
                message='Vacancy description is very short (<100 chars)',
            )
        )
    elif len(description) < 250:
        score -= weight * 0.05
        reasons.append('Short description — limited detail')

    has_agency = _contains_any(
        description, ('agency', 'агентство', 'кадровое агентство', 'recruitment agency', 'staffing')
    )
    has_employer = _contains_any(
        description, ('компания-работодатель', 'direct employer', 'прямой работодатель')
    )
    if has_agency and not has_employer:
        reasons.append('Agency posting without clear employer name')
        flags.append(
            RiskFlag(
                code='agency_without_employer',
                severity='low',
                message='Vacancy posted by agency without employer name',
            )
        )

    has_test_task = _contains_any(
        description, ('тестовое задание', 'test task', 'test assignment', 'пробное задание')
    )
    has_unpaid = _contains_any(description, ('бесплатное', 'unpaid', 'без оплаты', 'free'))
    if has_test_task and has_unpaid:
        reasons.append('Unpaid test task detected')
        flags.append(
            RiskFlag(
                code='unpaid_test_task_risk',
                severity='medium',
                message='Vacancy mentions unpaid test task',
            )
        )

    suspicious = (
        'работа за идею',
        'стартап на энтузиазме',
        'work for equity',
        'оплата по результатам',
        'payment after results',
        'без оформления',
        'no official employment',
        'испытательный срок без оплаты',
    )
    if _contains_any(description, suspicious):
        score -= weight * 0.3
        reasons.append('Suspicious wording detected')
        flags.append(
            RiskFlag(
                code='suspicious_wording',
                severity='medium',
                message='Vacancy contains suspicious wording',
            )
        )
    return _round(_clamp(score, 0, weight)), reasons


# ── Caps and penalties (mirror scoring.ts) ───────────────────────────────

_CAPS = (
    ('company_blacklist', 'critical', 'Company is blacklisted', 40),
    ('work_mode_mismatch', 'medium', 'Critical work mode mismatch', 65),
    ('missing_core_skill', 'high', 'Missing core must-have skill', 70),
)

_PENALTIES = (
    ('salary_below_minimum', 'medium', 15, 'Salary below minimum expectation'),
    ('suspicious_wording', 'medium', 15, 'Suspicious wording detected'),
    ('vague_description', 'low', 5, 'Vague or very short description'),
)


def _apply_caps(total: int, flags: list[RiskFlag]) -> tuple[int, list[str]]:
    applied = [
        cap for cap in _CAPS if any(f.code == cap[0] and f.severity == cap[1] for f in flags)
    ]
    if not applied:
        return total, []
    lowest = min(applied, key=lambda cap: cap[3])
    return min(total, lowest[3]), [f'{lowest[2]} (cap {lowest[3]})']


# ── Hard gates ────────────────────────────────────────────────────────────


def _hard_gates(vacancy: TriageVacancy, config: TriageConfig) -> list[HardGate]:
    gates: list[HardGate] = []
    mode = vacancy.work_mode

    if not config.remote_only:
        gates.append(HardGate('remote_only', 'na', 'Remote-only requirement not configured'))
    elif mode in ('remote', 'hybrid'):
        note = 'Hybrid includes remote work' if mode == 'hybrid' else 'Vacancy is remote'
        gates.append(HardGate('remote_only', 'pass', f'Remote-only satisfied — {note}.'))
    elif mode == 'office':
        gates.append(HardGate('remote_only', 'fail', 'Remote-only required but vacancy is office.'))
    else:
        gates.append(
            HardGate(
                'remote_only',
                'needs_input',
                'Remote-only required but work format is unknown.',
            )
        )

    if not config.office_required:
        gates.append(HardGate('work_format', 'na', 'Office-required gate not configured'))
    elif mode in ('office', 'hybrid'):
        gates.append(HardGate('work_format', 'pass', 'Vacancy allows in-office work.'))
    elif mode == 'remote':
        gates.append(HardGate('work_format', 'fail', 'Office required but vacancy is remote.'))
    else:
        gates.append(
            HardGate('work_format', 'needs_input', 'Office required but work format is unknown.')
        )

    if config.location_eligible is None:
        gates.append(HardGate('eligibility', 'na', 'Location eligibility not asserted'))
    elif config.location_eligible is False:
        if vacancy.city:
            gates.append(
                HardGate(
                    'eligibility',
                    'fail',
                    f'Candidate is not eligible to work in "{vacancy.city}".',
                )
            )
        else:
            gates.append(
                HardGate(
                    'eligibility',
                    'needs_input',
                    'Candidate ineligible but vacancy location is unknown.',
                )
            )
    else:
        gates.append(
            HardGate(
                'eligibility',
                'pass',
                'Candidate confirmed eligible for this location.',
            )
        )

    return gates


# ── Public triage function ────────────────────────────────────────────────


def triage_vacancy(vacancy: TriageVacancy, config: TriageConfig) -> TriageResult:
    """Run deterministic Stage A triage.  Pure — no IO, no AI."""
    flags: list[RiskFlag] = []
    fit_reasons: list[str] = []

    title_score, title_reasons = _score_title_match(vacancy, config)
    must_score, must_reasons = _score_must_have(vacancy, config, flags)
    nice_score, nice_reasons = _score_nice_to_have(vacancy, config)
    exp_score, exp_reasons = _score_experience_fit(vacancy, config, flags)
    wm_score, wm_reasons = _score_work_mode_location(vacancy, config, flags)
    sal_score, sal_reasons = _score_salary_fit(vacancy, config, flags)
    co_score, co_reasons = _score_company_preference(vacancy, config, flags)
    misc_score, misc_reasons = _score_misc(vacancy, flags)

    components = (
        ScoreComponent('title_match', title_score, WEIGHTS['title_match'], tuple(title_reasons)),
        ScoreComponent(
            'must_have_skills',
            must_score,
            WEIGHTS['must_have_skills'],
            tuple(must_reasons),
        ),
        ScoreComponent(
            'nice_to_have_skills',
            nice_score,
            WEIGHTS['nice_to_have_skills'],
            tuple(nice_reasons),
        ),
        ScoreComponent(
            'experience_fit',
            exp_score,
            WEIGHTS['experience_fit'],
            tuple(exp_reasons),
        ),
        ScoreComponent(
            'work_mode_location',
            wm_score,
            WEIGHTS['work_mode_location'],
            tuple(wm_reasons),
        ),
        ScoreComponent(
            'salary_fit',
            sal_score,
            WEIGHTS['salary_fit'],
            tuple(sal_reasons),
        ),
        ScoreComponent(
            'company_preference',
            co_score,
            WEIGHTS['company_preference'],
            tuple(co_reasons),
        ),
        ScoreComponent(
            'language_schedule_misc',
            misc_score,
            WEIGHTS['language_schedule_misc'],
            tuple(misc_reasons),
        ),
    )

    fit_reasons.extend(title_reasons)
    fit_reasons.extend(must_reasons)
    fit_reasons.extend(nice_reasons)
    fit_reasons.extend(exp_reasons)
    fit_reasons.extend(wm_reasons)
    fit_reasons.extend(sal_reasons)
    fit_reasons.extend(co_reasons)
    fit_reasons.extend(misc_reasons)

    total = sum(c.score for c in components)

    for code, severity, amount, reason in _PENALTIES:
        if any(f.code == code and f.severity == severity for f in flags):
            total -= amount
            fit_reasons.append(f'Penalty: {reason} (-{amount})')

    total = _round(_clamp(total, 0, 100))
    total, caps_applied = _apply_caps(total, flags)

    # Non-gate blocking signals: archived vacancy, seen-before duplicate, and
    # a blocked (critical) company each force a skip decision.
    if vacancy.archived:
        flags.append(
            RiskFlag(code='low_signal', severity='high', message='Vacancy is archived/closed')
        )
        fit_reasons.append('Vacancy is archived — removed from active consideration')
    if vacancy.seen_before:
        flags.append(
            RiskFlag(
                code='duplicate_vacancy',
                severity='info',
                message='Vacancy was captured on a previous intake',
            )
        )
        fit_reasons.append('Vacancy already tracked — previously captured')

    gates = _hard_gates(vacancy, config)

    blocked = vacancy.archived or any(
        f.code == 'company_blacklist' and f.severity == 'critical' for f in flags
    )
    has_fail = any(g.status == 'fail' for g in gates)
    has_needs_input = any(g.status == 'needs_input' for g in gates)

    if blocked or has_fail:
        verdict = 'skip'
        recommendation = 'skip'
    elif has_needs_input:
        verdict = 'needs_input'
        recommendation = 'needs_input'
    else:
        verdict = 'pass'
        recommendation = _recommendation(int(total), flags)

    return TriageResult(
        verdict=verdict,
        recommendation=recommendation,
        score=int(total),
        hard_gates=tuple(gates),
        components=components,
        risk_flags=tuple(flags),
        fit_reasons=tuple(fit_reasons),
        caps_applied=tuple(caps_applied),
    )


def _recommendation(total: int, flags: list[RiskFlag]) -> str:
    if any(f.severity == 'critical' for f in flags):
        return 'skip'
    if total >= 85:
        return 'apply'
    if total >= 50:
        return 'consider'
    return 'skip'
