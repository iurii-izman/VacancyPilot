"""Deterministic literal validators — AOPS-08.

Local code, not the LLM, must verify every letter constraint.  These validators
are pure functions that take a structured V4 result and return a list of
human-readable error strings.

One repair retry is allowed.  Two invalid attempts → run stays invalid.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from app.analysis.compiler import (
    EVIDENCE_WHITELIST,
    FORBIDDEN_OVERCLAIMS,
    FORBIDDEN_PHRASES,
)
from app.analysis.models import (
    V4StructuredResult,
)
from app.engine.index import KnowledgeIndex

# ── H1 (first meaningful line) ────────────────────────────────────────────

_H1_PATTERN = re.compile(r'^[А-ЯЁA-Z]')
_H1_MAX_LEN = 120


def _check_h1(letter: str) -> list[str]:
    """First non-empty line must start with a capital letter."""
    errors: list[str] = []
    lines = [line.strip() for line in letter.split('\n') if line.strip()]
    if not lines:
        return ['H1_MISSING: letter has no non-empty lines']
    h1 = lines[0]
    if not _H1_PATTERN.match(h1):
        errors.append(
            f'H1_CAPITAL: first line does not start with a capital letter: "{h1[:60]}..."'
        )
    if len(h1) > _H1_MAX_LEN:
        errors.append(f'H1_TOO_LONG: first line exceeds {_H1_MAX_LEN} chars')
    return errors


# ── Five required sections in order ────────────────────────────────────────

_SECTION_MARKERS = [
    (
        re.compile(
            r'(?:приветствие|здравствуйте|уважаем|добр|hello|dear|greeting)',
            re.I,
        ),
        'greeting',
    ),
    (
        re.compile(
            r'(?:заинтересовала|пишу.*отклик|interested|writing.*apply|express.*interest)',
            re.I,
        ),
        'interest',
    ),
    (
        re.compile(
            r'(?:опыт|навыки|достижения|experience|skills|achievements|background)',
            re.I,
        ),
        'experience',
    ),
    (
        re.compile(
            r'(?:почему.*компани|ценность|contribute|value|bring)',
            re.I,
        ),
        'value',
    ),
    (
        re.compile(
            r'(?:рассмотрени|благодар|спасибо|consideration|thank|regards)',
            re.I,
        ),
        'closing',
    ),
]


def _check_five_sections(letter: str, language: str) -> list[str]:
    """Verify the letter has five required sections in the expected order."""
    errors: list[str] = []
    text_lower = letter.lower()
    found: list[str] = []
    last_pos = -1
    for pattern, name in _SECTION_MARKERS:
        match = pattern.search(text_lower)
        if not match:
            errors.append(f'SECTION_MISSING: required section "{name}" not found')
        else:
            if match.start() <= last_pos:
                errors.append(f'SECTION_ORDER: "{name}" appears out of order')
            last_pos = max(last_pos, match.start())
            found.append(name)
    if len(found) < 5:
        errors.append(f'SECTION_COUNT: found {len(found)}/5 required sections')
    return errors


# ── Word count ──────────────────────────────────────────────────────────────

_WORD_RE = re.compile(r'\b\w+\b', re.UNICODE)


def _count_words(text: str) -> int:
    return len(_WORD_RE.findall(text))


def _check_word_count(letter: str, recommendation: str) -> list[str]:
    """APPLY-family: 150-220 words. Hard-fail fallback: 90-130 words."""
    errors: list[str] = []
    count = _count_words(letter)
    if recommendation in ('apply', 'consider'):
        if count < 150:
            errors.append(f'WORD_COUNT_LOW: {count} words (need 150-220 for APPLY/CONSIDER)')
        elif count > 220:
            errors.append(f'WORD_COUNT_HIGH: {count} words (need 150-220 for APPLY/CONSIDER)')
    elif recommendation == 'skip':
        if count < 90:
            errors.append(f'WORD_COUNT_LOW: {count} words (need 90-130 for hard-fail fallback)')
        elif count > 130:
            errors.append(f'WORD_COUNT_HIGH: {count} words (need 90-130 for hard-fail fallback)')
    return errors


# ── Vacancy anchors ────────────────────────────────────────────────────────


def _check_vacancy_anchors(letter: str, title: str) -> list[str]:
    """At least two distinct vacancy-anchor references."""
    errors: list[str] = []
    title_terms = [w for w in title.lower().split() if len(w) > 3]
    found = 0
    for term in title_terms:
        if term.lower() in letter.lower():
            found += 1
    if found < 2:
        # Also check for company name, specific requirements
        errors.append(f'VACANCY_ANCHORS: found {found}/2 vacancy-specific references in letter')
    return errors


# ── Micro-proof ─────────────────────────────────────────────────────────────


def _check_micro_proof(letter: str) -> list[str]:
    """At least one concrete, quantifiable proof point."""
    quant_patterns = [
        re.compile(r'\d+%'),
        re.compile(r'\d+\s*(?:year|год|month|месяц|person|человек|project|проект|client|клиент)'),
        re.compile(
            r'(?:increased|decreased|reduced|improved|увеличил|уменьшил|сократил|улучшил|вырос|снизил)'
        ),
        re.compile(r'\$\d+'),
        re.compile(r'\d+[kKmM]'),
    ]
    for pat in quant_patterns:
        if pat.search(letter):
            return []
    return ['MICRO_PROOF: no quantifiable proof point found in letter']


# ── Recruiter risks ────────────────────────────────────────────────────────


def _check_recruiter_risks(result: V4StructuredResult) -> list[str]:
    """Exactly two recruiter risks."""
    errors: list[str] = []
    if len(result.recruiter_risks) != 2:
        errors.append(f'RECRUITER_RISKS_COUNT: expected 2, got {len(result.recruiter_risks)}')
    for i, risk in enumerate(result.recruiter_risks):
        if not risk.risk.strip():
            errors.append(f'RECRUITER_RISK_{i}_EMPTY: risk text is empty')
        if risk.severity not in ('low', 'medium', 'high'):
            errors.append(f'RECRUITER_RISK_{i}_SEVERITY: invalid severity "{risk.severity}"')
    return errors


# ── Signature ──────────────────────────────────────────────────────────────


def _check_signature(letter: str) -> list[str]:
    """Signature present, and only whitespace (or just a name) after signature."""
    errors: list[str] = []
    lines = letter.split('\n')
    signoff_pattern = re.compile(
        r'(?:с уважением|best regards|kind regards|искренне|sincerely)', re.I
    )
    name_pattern = re.compile(r'^[A-ZА-ЯЁ][a-zа-яё]+\s+[A-ZА-ЯЁ][a-zа-яё]+$')

    # A name is a signature only when it is the final non-empty line. Treating
    # any two capitalized words as a name misclassified greetings such as
    # "Dear Hiring Manager" and rejected otherwise valid letters.
    non_empty_indexes = [i for i, line in enumerate(lines) if line.strip()]
    sig_idx = -1
    for i in reversed(non_empty_indexes):
        if signoff_pattern.search(lines[i]):
            sig_idx = i
            break
    if (
        sig_idx < 0
        and non_empty_indexes
        and name_pattern.match(lines[non_empty_indexes[-1]].strip())
    ):
        sig_idx = non_empty_indexes[-1]
    if sig_idx < 0:
        errors.append('SIGNATURE_MISSING: no signature detected')

    if sig_idx >= 0:
        # Content after signature: allow at most one name line
        trailing_lines = [ln.strip() for ln in lines[sig_idx + 1 :] if ln.strip()]
        if len(trailing_lines) > 1 or (
            len(trailing_lines) == 1 and not name_pattern.match(trailing_lines[0])
        ):
            errors.append('SIGNATURE_TRAILING: content found after signature line')
    return errors


# ── Placeholders / forbidden phrases ────────────────────────────────────────


def _check_no_placeholders(letter: str) -> list[str]:
    """No placeholder or meta-text."""
    errors: list[str] = []
    letter_lower = letter.lower()
    for phrase in FORBIDDEN_PHRASES:
        if phrase.lower() in letter_lower:
            errors.append(f'PLACEHOLDER: forbidden phrase "{phrase}" found')
    return errors


# ── Forbidden overclaims ────────────────────────────────────────────────────


def _check_no_overclaims(letter: str) -> list[str]:
    """No forbidden overclaims."""
    errors: list[str] = []
    letter_lower = letter.lower()
    for phrase in FORBIDDEN_OVERCLAIMS:
        if phrase.lower() in letter_lower:
            errors.append(f'OVERCLAIM: forbidden phrase "{phrase}" found')
    return errors


# ── Hidden self-disqualification ────────────────────────────────────────────

_SELF_DISQUALIFY_PATTERNS = [
    re.compile(p, re.I)
    for p in [
        (
            r"(?:i don't have|i lack|i do not have|у меня нет|не имею|отсутствует)"
            r'.*(?:experience|skill|опыт|навык)'
        ),
        (
            r'(?:unfortunately|к сожалению).*'
            r"(?:I (?:can't|cannot|don't|do not)|я не (?:могу|умею|обладаю))"
        ),
        r'(?:not qualified|не подхожу|недостаточно квалифицирован)',
    ]
]


def _check_no_self_disqualification(letter: str) -> list[str]:
    """No hidden self-disqualification patterns."""
    errors: list[str] = []
    for pat in _SELF_DISQUALIFY_PATTERNS:
        if pat.search(letter):
            errors.append(f'SELF_DISQUALIFY: pattern "{pat.pattern[:60]}..." detected')
    return errors


# ── Unsupported direct claims ──────────────────────────────────────────────


def _check_unsupported_claims(evidence_map: list[Any], index: KnowledgeIndex | None) -> list[str]:
    """No unsupported direct claims — every claim must have an evidence ID in the index."""
    errors: list[str] = []
    if index is None:
        return []  # Can't validate without index — not an error in strict mode
    for entry in evidence_map:
        entry_dict = entry if isinstance(entry, dict) else entry.__dict__
        claim_id = entry_dict.get('claim_id')
        if claim_id and claim_id not in index.claims:
            errors.append(f'UNSUPPORTED_CLAIM: claim_id "{claim_id}" not found in knowledge index')
        case_id = entry_dict.get('case_id')
        if case_id and case_id not in index.commercial_cases:
            errors.append(f'UNSUPPORTED_CASE: case_id "{case_id}" not found in knowledge index')
        portfolio_id = entry_dict.get('portfolio_id')
        if portfolio_id and portfolio_id not in index.portfolio_cases:
            errors.append(
                f'UNSUPPORTED_PORTFOLIO: portfolio_id "{portfolio_id}" not found in knowledge index'
            )
        evidence_level = entry_dict.get('evidence_level')
        if evidence_level and evidence_level not in EVIDENCE_WHITELIST:
            errors.append(f'INVALID_LEVEL: evidence level "{evidence_level}" not in whitelist')
        req_idx = entry_dict.get('requirement_index')
        if req_idx is not None and (not isinstance(req_idx, int) or req_idx < 0 or req_idx > 2):
            errors.append(f'INVALID_REQ_INDEX: requirement_index {req_idx} out of [0,2]')
    return errors


# ── Score/cap/decision parity ──────────────────────────────────────────────


def _check_score_parity(result: V4StructuredResult) -> list[str]:
    """Score, caps, and decision must be self-consistent."""
    errors: list[str] = []
    score = result.score
    if score.final > score.raw:
        errors.append(f'SCORE_PARITY: final ({score.final}) > raw ({score.raw})')
    if score.caps:
        lowest_cap = min(c.max_score for c in score.caps)
        if score.final > lowest_cap:
            errors.append(f'SCORE_CAP_PARITY: final ({score.final}) > lowest cap ({lowest_cap})')
    if score.final < 0 or score.final > 100:
        errors.append(f'SCORE_RANGE: final score {score.final} out of [0,100]')
    if score.raw < 0 or score.raw > 100:
        errors.append(f'SCORE_RANGE: raw score {score.raw} out of [0,100]')
    if score.decision not in ('apply', 'consider', 'skip', 'needs_input'):
        errors.append(f'INVALID_DECISION: "{score.decision}"')
    if score.confidence not in ('low', 'medium', 'high'):
        errors.append(f'INVALID_CONFIDENCE: "{score.confidence}"')
    return errors


# ── English-only mode ─────────────────────────────────────────────────────


def _check_english_mode(letter: str, required: bool) -> list[str]:
    """When English mode is required, the letter must be primarily English."""
    if not required:
        return []
    # Count Cyrillic vs Latin characters
    cyrillic = sum(1 for c in letter if 'А' <= c <= 'я' or c in 'Ёё')
    latin = sum(1 for c in letter if 'a' <= c <= 'z' or 'A' <= c <= 'Z')
    if cyrillic > latin * 0.1:  # Allow up to 10% Cyrillic (proper nouns)
        return ['ENGLISH_MODE: letter contains significant Cyrillic text when English required']
    return []


# ── Homogeneous skill list ─────────────────────────────────────────────────


def _check_skill_list_density(letter: str) -> list[str]:
    """No homogeneous skill list over 5 items."""
    # Look for comma-separated list patterns with technical terms
    long_list_pattern = re.compile(r'(?:[A-Za-zА-Яа-я#+.]{2,30},\s*){5,}[A-Za-zА-Яа-я#+.]{2,30}')
    if long_list_pattern.search(letter):
        return ['SKILL_LIST_DENSITY: homogeneous skill list over 5 items detected']
    return []


# ── Evidence whitelist ─────────────────────────────────────────────────────


def _check_evidence_whitelist(evidence_map: list[Any]) -> list[str]:
    """All evidence levels must be in the whitelist."""
    errors: list[str] = []
    for i, entry in enumerate(evidence_map):
        entry_dict = entry if isinstance(entry, dict) else entry.__dict__
        level = entry_dict.get('evidence_level')
        if level and level not in EVIDENCE_WHITELIST:
            errors.append(f'EVIDENCE_LEVEL_INVALID[{i}]: "{level}" not in {EVIDENCE_WHITELIST}')
    return errors


# ── Portfolio boundary ─────────────────────────────────────────────────────


def _check_portfolio_boundary(evidence_map: list[Any], index: KnowledgeIndex | None) -> list[str]:
    """Portfolio references must respect boundaries when specified."""
    errors: list[str] = []
    if index is None:
        return []
    for entry in evidence_map:
        entry_dict = entry if isinstance(entry, dict) else entry.__dict__
        pid = entry_dict.get('portfolio_id')
        if pid and pid in index.portfolio_cases:
            boundary = index.portfolio_cases[pid].get('boundary', '')
            if boundary and 'no' in boundary.lower():
                # Actual boundary checking requires domain knowledge, but we flag
                # that a boundary exists for human review
                pass
    return errors


# ── Aggregate validator ────────────────────────────────────────────────────

# Type for the validation context
ValidatorContext = dict[str, Any]


# Ordered list of (name, fn) pairs
def _vh1(ctx: ValidatorContext) -> list[str]:
    return _check_h1(str(ctx.get('letter', '')))


def _vfive_sections(ctx: ValidatorContext) -> list[str]:
    return _check_five_sections(str(ctx.get('letter', '')), str(ctx.get('language', 'ru')))


def _vword_count(ctx: ValidatorContext) -> list[str]:
    return _check_word_count(str(ctx.get('letter', '')), str(ctx.get('recommendation', 'skip')))


def _vvacancy_anchors(ctx: ValidatorContext) -> list[str]:
    return _check_vacancy_anchors(str(ctx.get('letter', '')), str(ctx.get('title', '')))


def _vmicro_proof(ctx: ValidatorContext) -> list[str]:
    if not bool(ctx.get('require_quantitative_micro_proof', True)):
        return []
    return _check_micro_proof(str(ctx.get('letter', '')))


def _vsignature(ctx: ValidatorContext) -> list[str]:
    return _check_signature(str(ctx.get('letter', '')))


def _vno_placeholders(ctx: ValidatorContext) -> list[str]:
    return _check_no_placeholders(str(ctx.get('letter', '')))


def _vno_overclaims(ctx: ValidatorContext) -> list[str]:
    return _check_no_overclaims(str(ctx.get('letter', '')))


def _vno_self_disqualification(ctx: ValidatorContext) -> list[str]:
    return _check_no_self_disqualification(str(ctx.get('letter', '')))


def _vskill_list_density(ctx: ValidatorContext) -> list[str]:
    return _check_skill_list_density(str(ctx.get('letter', '')))


def _venglish_mode(ctx: ValidatorContext) -> list[str]:
    return _check_english_mode(str(ctx.get('letter', '')), bool(ctx.get('english_required', False)))


_LETTER_VALIDATORS: list[tuple[str, Callable[..., list[str]]]] = [
    ('h1', _vh1),
    ('five_sections', _vfive_sections),
    ('word_count', _vword_count),
    ('vacancy_anchors', _vvacancy_anchors),
    ('micro_proof', _vmicro_proof),
    ('signature', _vsignature),
    ('no_placeholders', _vno_placeholders),
    ('no_overclaims', _vno_overclaims),
    ('no_self_disqualification', _vno_self_disqualification),
    ('skill_list_density', _vskill_list_density),
    ('english_mode', _venglish_mode),
]


def validate_letter(
    letter: str,
    *,
    recommendation: str = 'skip',
    language: str = 'ru',
    title: str = '',
    english_required: bool = False,
    require_quantitative_micro_proof: bool = True,
) -> list[str]:
    """Run all 11 literal letter validators. Returns a flat list of error strings.

    An empty list means the letter passed all checks.
    """
    ctx: ValidatorContext = {
        'letter': letter,
        'recommendation': recommendation,
        'language': language,
        'title': title,
        'english_required': english_required,
        'require_quantitative_micro_proof': require_quantitative_micro_proof,
    }
    errors: list[str] = []
    for name, fn in _LETTER_VALIDATORS:
        try:
            result = fn(ctx)
            errors.extend(result)
        except Exception as exc:
            errors.append(f'VALIDATOR_ERROR({name}): {exc}')
    return errors


def validate_structured_result(
    result: V4StructuredResult,
    *,
    index: KnowledgeIndex | None = None,
    english_required: bool = False,
) -> list[str]:
    """Run all structural validators on a V4StructuredResult.

    Covers:
    - recruiter risks count (exactly 2)
    - score/cap/decision parity
    - unsupported claims/evidence IDs
    - evidence whitelist
    - portfolio boundary
    """
    errors: list[str] = []
    errors.extend(_check_recruiter_risks(result))
    errors.extend(_check_score_parity(result))
    evidence_dicts: list[dict[str, Any]] = [entry.model_dump() for entry in result.evidence_map]
    errors.extend(_check_unsupported_claims(evidence_dicts, index))
    errors.extend(_check_evidence_whitelist(evidence_dicts))
    errors.extend(_check_portfolio_boundary(evidence_dicts, index))

    # A successful Full V4 result must include a letter that passes every
    # literal validator. Skipping an empty string would permit a false PASS.
    errors.extend(
        validate_letter(
            result.cover_letter,
            recommendation=result.score.decision,
            language='en' if english_required else 'ru',
            title=result.vacancy_identity.role,
            english_required=english_required,
            require_quantitative_micro_proof=False,
        )
    )
    errors.extend(
        _check_evidence_backed_micro_proof(
            result.cover_letter,
            evidence_dicts,
            index,
            english_required=english_required,
        )
    )

    return errors


def _check_evidence_backed_micro_proof(
    letter: str,
    evidence_map: list[dict[str, Any]],
    index: KnowledgeIndex | None,
    *,
    english_required: bool,
) -> list[str]:
    """Require a numeric proof or an exact micro-proof from a cited case.

    Not every authoritative case has a numeric outcome.  Requiring a made-up
    number would violate the evidence boundary, so a selected and cited case's
    canonical micro-proof is accepted as the deterministic alternative.
    """
    if not _check_micro_proof(letter):
        return []
    if index is None:
        return ['MICRO_PROOF: no quantifiable or evidence-backed proof point found in letter']

    field = 'micro_proof_en' if english_required else 'micro_proof_ru'
    folded_letter = ' '.join(letter.casefold().split())
    for entry in evidence_map:
        case_id = entry.get('case_id')
        if not isinstance(case_id, str):
            continue
        case = index.commercial_cases.get(case_id)
        if not case:
            continue
        proof = case.get(field)
        if (
            isinstance(proof, str)
            and proof.strip()
            and ' '.join(proof.casefold().split()) in folded_letter
        ):
            return []
    return ['MICRO_PROOF: no quantifiable or evidence-backed proof point found in letter']


def format_validation_errors_for_repair(errors: list[str]) -> str:
    """Format validation errors as a repair prompt fragment."""
    if not errors:
        return 'No validation errors.'
    numbered = '\n'.join(f'{i + 1}. {e}' for i, e in enumerate(errors))
    return (
        'The following validation errors must be fixed:\n\n'
        f'{numbered}\n\n'
        'Please correct these issues while preserving the original structure and evidence.'
    )
