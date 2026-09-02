"""Prompt compiler — deterministic minimal payload builder.

Compiles exactly what the provider needs, not the entire knowledge pack.
Records prompt version, selection reasons, input hash, and payload preview.
Never logs private prompt content when privacy mode disallows it.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.analysis.models import (
    CompiledPrompt,
    PromptCompilerInput,
)
from app.engine.index import KnowledgeIndex
from app.engine.models import LoadedEnginePackage

PROMPT_VERSION = 'v4.0.0-ao8-4'


def assert_prompt_contract(system_prompt: str, user_prompt: str) -> None:
    """Developer preflight for hard invariants required by the V4 contract."""
    payload = f'{system_prompt}\n{user_prompt}'.lower()
    requirements = {
        'value marker': ('value', 'ценност'),
        '150–220 words': ('150–220', '150-220'),
        'target 165–185 words': ('165–185', '165-185'),
        'exact signature': ('exact signature', 'точн'),
        'no text after the signature': (
            'no text after the signature',
            'whitespace only after',
            'после подписи',
        ),
        'SKIP => no letter': ('skip => no letter', 'skip: no letter', 'skip => без письма'),
    }
    missing = [
        name
        for name, alternatives in requirements.items()
        if not any(a in payload for a in alternatives)
    ]
    if missing:
        raise ValueError(f'PROMPT_CONTRACT_PREFLIGHT_FAILED: missing {missing}')


OUTPUT_JSON_SCHEMA = {
    'type': 'object',
    'required': [
        'vacancy_identity',
        'eligibility',
        'central_requirements',
        'evidence_map',
        'score',
        'strategy',
        'cover_letter',
        'recruiter_risks',
        'interview_prep',
        'qa',
    ],
    'properties': {
        'vacancy_identity': {
            'type': 'object',
            'required': ['company', 'role'],
            'properties': {
                'company': {'type': 'string', 'minLength': 1, 'maxLength': 500},
                'role': {'type': 'string', 'minLength': 1, 'maxLength': 500},
            },
        },
        'eligibility': {
            'type': 'object',
            'required': ['hard_fail', 'reasons'],
            'properties': {
                'format': {'type': 'string', 'enum': ['standard', 'agency', 'direct', 'unknown']},
                'hard_fail': {'type': 'boolean'},
                'reasons': {
                    'type': 'array',
                    'items': {'type': 'string'},
                    'maxItems': 16,
                },
            },
        },
        'central_requirements': {
            'type': 'array',
            'minItems': 0,
            'maxItems': 3,
            'items': {
                'type': 'object',
                'required': ['requirement', 'importance'],
                'properties': {
                    'requirement': {'type': 'string', 'minLength': 1, 'maxLength': 500},
                    'importance': {'type': 'string', 'enum': ['critical', 'high', 'medium']},
                    'rationale': {'type': 'string', 'maxLength': 200},
                },
            },
        },
        'evidence_map': {
            'type': 'array',
            'maxItems': 24,
            'items': {
                'type': 'object',
                'required': ['requirement_index', 'evidence_level'],
                'properties': {
                    'requirement_index': {'type': 'integer', 'minimum': 0, 'maximum': 2},
                    'evidence_level': {
                        'type': 'string',
                        'enum': ['E4', 'E3', 'E2', 'P1', 'X0', 'N0'],
                    },
                    'claim_id': {'type': ['string', 'null'], 'maxLength': 64},
                    'case_id': {'type': ['string', 'null'], 'maxLength': 64},
                    'portfolio_id': {'type': ['string', 'null'], 'maxLength': 64},
                    'allowed_wording': {'type': 'string', 'maxLength': 500},
                },
            },
        },
        'score': {
            'type': 'object',
            'required': ['raw', 'final', 'confidence', 'decision'],
            'properties': {
                'raw': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                'caps': {
                    'type': 'array',
                    'maxItems': 16,
                    'items': {
                        'type': 'object',
                        'required': ['rule_id', 'reason', 'max_score'],
                        'properties': {
                            'rule_id': {'type': 'string', 'minLength': 1, 'maxLength': 64},
                            'reason': {'type': 'string', 'minLength': 1, 'maxLength': 300},
                            'max_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                        },
                    },
                },
                'final': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                'confidence': {'type': 'string', 'enum': ['low', 'medium', 'high']},
                'decision': {
                    'type': 'string',
                    'enum': ['apply', 'consider', 'skip', 'needs_input'],
                },
            },
        },
        'strategy': {
            'type': 'object',
            'required': ['positioning', 'tone'],
            'properties': {
                'positioning': {'type': 'string', 'maxLength': 500},
                'tone': {
                    'type': 'string',
                    'enum': ['confident', 'measured', 'curious', 'direct', 'humble'],
                },
                'opener': {'type': 'string', 'maxLength': 300},
                'key_claim_priority': {
                    'type': 'array',
                    'items': {'type': 'string'},
                    'maxItems': 6,
                },
                'risks_to_address': {
                    'type': 'array',
                    'items': {'type': 'string'},
                    'maxItems': 4,
                },
            },
        },
        # SKIP has no generated letter; APPLY/CONSIDER length is literal-validated.
        'cover_letter': {'type': 'string', 'minLength': 0, 'maxLength': 5000},
        'recruiter_risks': {
            'type': 'array',
            'minItems': 2,
            'maxItems': 2,
            'items': {
                'type': 'object',
                'required': ['risk', 'severity'],
                'properties': {
                    'risk': {'type': 'string', 'minLength': 1, 'maxLength': 500},
                    'severity': {'type': 'string', 'enum': ['low', 'medium', 'high']},
                    'mitigation': {'type': 'string', 'maxLength': 500},
                },
            },
        },
        'interview_prep': {
            'type': 'array',
            'maxItems': 12,
            'items': {
                'type': 'object',
                'required': ['topic'],
                'properties': {
                    'topic': {'type': 'string', 'minLength': 1, 'maxLength': 300},
                    'detail': {'type': 'string', 'maxLength': 500},
                },
            },
        },
        'qa': {
            'type': 'object',
            'required': ['passed', 'errors'],
            'properties': {
                'passed': {'type': 'boolean'},
                'checks': {
                    'type': 'array',
                    'items': {'type': 'string'},
                    'maxItems': 32,
                },
                'errors': {
                    'type': 'array',
                    'items': {'type': 'string'},
                    'maxItems': 32,
                },
            },
        },
    },
}

FORBIDDEN_OVERCLAIMS: list[str] = [
    'best in class',
    'world-class',
    'global leader',
    'unmatched',
    'only candidate',
    'guaranteed',
    'perfect fit',
    'ideal candidate',
    'flawless',
    'without equal',
    'industry-leading',
    'unparalleled',
    '#1',
    'number one',
    'top 1%',
    'без конкурентов',
    'идеальный кандидат',
    'лучший в мире',
    'единственный кандидат',
    'гарантированно',
]

EVIDENCE_WHITELIST: list[str] = [
    'E4',
    'E3',
    'E2',
    'P1',
    'X0',
    'N0',
]

FORBIDDEN_PHRASES: list[str] = [
    '[placeholder]',
    '[TODO]',
    '[insert]',
    '[your name]',
    '[company name]',
    '[role]',
    '[fill in]',
    'TKTK',
    'Lorem ipsum',
    '[название компании]',
    '[ваше имя]',
    '[должность]',
    '[вставьте]',
]


def _model_name_for_prompt(model: str | None) -> str:
    """Return the canonical model name used in prompts."""
    return model or 'gpt-4o'


def compile_prompt(
    input_data: PromptCompilerInput,
    index: KnowledgeIndex | None,
    package: LoadedEnginePackage | None,
    *,
    provider: str = 'openai',
    model: str | None = None,
    privacy_mode: str = 'standard',
    language: str = 'ru',
) -> CompiledPrompt:
    """Compile a deterministic minimal payload for V4 analysis.

    Args:
        input_data: Normalised vacancy fields and selected evidence IDs.
        index: The loaded KnowledgeIndex (may be None for engine-less operation).
        package: The loaded engine package (may be None).
        provider: Provider identifier ('openai').
        model: Model override (default depends on provider).
        privacy_mode: 'standard' or 'strict'.
        language: 'ru' or 'en'.

    Returns:
        A CompiledPrompt with system/user prompts, schema, hash, and preview.
    """
    resolved_model = _model_name_for_prompt(model)

    # ── Build sections ───────────────────────────────────────────────────
    selection_reasons: list[str] = []

    # Vacancy section
    vacancy_section = _build_vacancy_section(input_data, privacy_mode, language)

    # Candidate claims section
    claims_section, claim_reasons = _build_claims_section(input_data, index)
    selection_reasons.extend(claim_reasons)

    # Commercial cases section
    cases_section, case_reasons = _build_cases_section(input_data, index)
    selection_reasons.extend(case_reasons)

    # Portfolio section
    portfolio_section, portfolio_reasons = _build_portfolio_section(input_data, index)
    selection_reasons.extend(portfolio_reasons)

    # Skill calibration section
    skills_section = _build_skills_section(input_data, index)

    # Targeting / hard-gate / cap section
    targeting_section = _build_targeting_section(input_data, index)

    # Voice / regression section
    voice_section = _build_voice_section(input_data, index)

    # Project instructions
    pi_text = ''
    if input_data.project_instructions:
        pi_text = input_data.project_instructions
    # Truncate project instructions to a reasonable limit for the prompt
    if len(pi_text) > 16000:
        pi_text = pi_text[:16000] + '\n\n[... Project Instructions truncated ...]'

    # ── Assemble system prompt ───────────────────────────────────────────
    system_prompt = _build_system_prompt_en() if language == 'en' else _build_system_prompt_ru()

    # ── Assemble user prompt ─────────────────────────────────────────────
    sections: list[str] = [
        vacancy_section,
        claims_section,
        cases_section,
    ]
    if portfolio_section:
        sections.append(portfolio_section)
    if skills_section:
        sections.append(skills_section)
    sections.append(targeting_section)
    if voice_section:
        sections.append(voice_section)
    if pi_text:
        sections.append(f'## Project Instructions\n\n{pi_text}')

    sections.append(_build_rules_section(language))
    sections.append(_build_output_format_section())

    user_prompt = '\n\n---\n\n'.join(s for s in sections if s)
    assert_prompt_contract(system_prompt, user_prompt)

    # ── Compute input hash ───────────────────────────────────────────────
    engine_version = package.identity.engine_version if package else 'none'
    engine_hash = package.identity.aggregate_hash if package else '0' * 64
    hash_input = json.dumps(
        {
            'prompt_version': PROMPT_VERSION,
            'engine_version': engine_version,
            'engine_hash': engine_hash,
            'provider': provider,
            'model': resolved_model,
            'privacy_mode': privacy_mode,
            'language': language,
            'vacancy_title': input_data.title,
            'vacancy_company': input_data.company_name or '',
            'vacancy_description_hash': hashlib.sha256(
                (input_data.description_clean or '').encode()
            ).hexdigest(),
            'selected_claim_ids': sorted(input_data.selected_claim_ids),
            'selected_case_ids': sorted(input_data.selected_case_ids),
            'selected_portfolio_id': input_data.selected_portfolio_id or '',
            'hard_gate_ids': sorted(input_data.hard_gate_ids),
            'cap_ids': sorted(input_data.cap_ids),
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    input_hash = hashlib.sha256(hash_input.encode('utf-8')).hexdigest()

    # ── Build payload preview ────────────────────────────────────────────
    payload_preview = _build_payload_preview(input_data, resolved_model, privacy_mode, language)

    # ── Estimate tokens ─────────────────────────────────────────────────
    token_estimate = _estimate_tokens(system_prompt + user_prompt)

    return CompiledPrompt(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        output_schema=OUTPUT_JSON_SCHEMA,
        prompt_version=PROMPT_VERSION,
        selection_reasons=selection_reasons,
        input_hash=input_hash,
        payload_preview=payload_preview,
        token_estimate=token_estimate,
        engine_version=engine_version,
        engine_hash=engine_hash,
        provider=provider,
        model=resolved_model,
    )


# ── Section builders ────────────────────────────────────────────────────────


def _build_vacancy_section(
    input_data: PromptCompilerInput, privacy_mode: str, language: str
) -> str:
    """Build the vacancy section of the prompt."""
    header = '## Vacancy' if language == 'en' else '## Вакансия'

    fields: list[str] = [
        f'- Title: {input_data.title}',
    ]
    if input_data.company_name:
        fields.append(f'- Company: {input_data.company_name}')
    if input_data.salary_raw:
        fields.append(f'- Salary: {input_data.salary_raw}')
    if input_data.city:
        fields.append(f'- City: {input_data.city}')
    if input_data.work_mode:
        fields.append(f'- Work mode: {input_data.work_mode}')
    if input_data.experience_raw:
        fields.append(f'- Experience: {input_data.experience_raw}')
    if input_data.skills:
        fields.append(f'- Skills: {", ".join(input_data.skills[:20])}')

    parts = [header, '', '\n'.join(fields)]

    if privacy_mode != 'strict' and input_data.description_clean:
        desc = input_data.description_clean
        if len(desc) > 3000:
            desc = desc[:3000] + '\n[... description truncated ...]'
        parts.extend(['', f'### {"Description" if language == "en" else "Описание"}', '', desc])
    elif privacy_mode == 'strict':
        parts.extend(
            [
                '',
                (
                    '*Description omitted — Strict Privacy*'
                    if language == 'en'
                    else '*Описание не отправлено — Strict Privacy*'
                ),
            ]
        )

    return '\n'.join(parts)


def _build_claims_section(
    input_data: PromptCompilerInput, index: KnowledgeIndex | None
) -> tuple[str, list[str]]:
    """Build the candidate claims section."""
    reasons: list[str] = []
    if not input_data.selected_claim_ids:
        reasons.append('No claims selected (empty knowledge index or no matching claims)')
        return ('## Candidate Claims\n\n*No claims selected.*', reasons)

    lines = ['## Candidate Claims', '']
    count = 0
    for cid in input_data.selected_claim_ids:
        if index and cid in index.claims:
            claim = index.claims[cid]
            level = claim.get('evidence_level', '?')
            category = claim.get('category', '')
            line = f'- `{cid}` [L:{level}]'
            if category:
                line += f' ({category})'
            lines.append(line)
            lines.extend(
                _selected_evidence_lines(
                    claim,
                    (
                        'title',
                        'allowed_wording',
                        'strongest_safe_wording_ru',
                        'strongest_safe_wording_en',
                        'limitations',
                    ),
                )
            )
            count += 1
        else:
            lines.append(f'- `{cid}` [not in index]')
    reasons.append(f'Selected {count} claims')
    return ('\n'.join(lines), reasons)


def _build_cases_section(
    input_data: PromptCompilerInput, index: KnowledgeIndex | None
) -> tuple[str, list[str]]:
    """Build the commercial cases section."""
    reasons: list[str] = []
    if not input_data.selected_case_ids:
        reasons.append('No commercial cases selected')
        return ('## Commercial Cases\n\n*No cases selected.*', reasons)

    lines = ['## Commercial Cases', '']
    count = 0
    for cid in input_data.selected_case_ids:
        if index and cid in index.commercial_cases:
            case = index.commercial_cases[cid]
            category = case.get('category', '')
            line = f'- `{cid}`'
            if category:
                line += f' ({category})'
            lines.append(line)
            lines.extend(
                _selected_evidence_lines(
                    case,
                    (
                        'title',
                        'candidate_role',
                        'micro_proof_ru',
                        'micro_proof_en',
                        'confirmed_outcome',
                        'solution_components',
                        'do_not_claim',
                        'limitations',
                    ),
                )
            )
            count += 1
        else:
            lines.append(f'- `{cid}` [not in index]')
    reasons.append(f'Selected {count} commercial cases')
    return ('\n'.join(lines), reasons)


def _selected_evidence_lines(entry: dict[str, Any], fields: tuple[str, ...]) -> list[str]:
    """Render only explicit, selected evidence fields for the provider payload.

    The compiler must provide usable wording and case proof, not merely opaque
    IDs.  This helper deliberately never traverses unselected index entries and
    bounds each rendered value to keep the provider payload deterministic.
    """
    lines: list[str] = []
    for field in fields:
        value = entry.get(field)
        rendered = _render_evidence_value(value)
        if rendered:
            lines.append(f'  {field}: {rendered}')
    return lines


def _render_evidence_value(value: Any) -> str:
    """Render a scalar/list evidence field without serialising arbitrary data."""
    if isinstance(value, str):
        return value.strip()[:800]
    if isinstance(value, list):
        items = [str(item).strip() for item in value if isinstance(item, (str, int, float))]
        return '; '.join(item for item in items if item)[:800]
    if isinstance(value, (int, float)):
        return str(value)
    return ''


def _build_portfolio_section(
    input_data: PromptCompilerInput, index: KnowledgeIndex | None
) -> tuple[str, list[str]]:
    """Build the portfolio section (at most one)."""
    reasons: list[str] = []
    pid = input_data.selected_portfolio_id
    if not pid:
        reasons.append('No portfolio case selected')
        return ('', reasons)

    boundary = ''
    if index and pid in index.portfolio_cases:
        boundary = index.portfolio_cases[pid].get('boundary', '')
        reasons.append(f'Selected portfolio case {pid}')
    else:
        reasons.append(f'Portfolio case {pid} not found in index')

    lines = ['## Relevant Portfolio Case', '', f'- ID: `{pid}`']
    if boundary:
        lines.append(f'- Boundary: {boundary}')
    return ('\n'.join(lines), reasons)


def _build_skills_section(input_data: PromptCompilerInput, index: KnowledgeIndex | None) -> str:
    """Build the skill calibration section."""
    if not input_data.skill_calibration_ids:
        return ''

    lines = ['## Skill Calibration', '']
    for sid in input_data.skill_calibration_ids:
        if index and sid in index.skill_calibrations:
            sk = index.skill_calibrations[sid]
            name = sk.get('skill_name', sid)
            level = sk.get('level', '?')
            evidence = sk.get('evidence_level', '?')
            lines.append(f'- {name}: level={level}, evidence={evidence}')
        else:
            lines.append(f'- `{sid}` [not in index]')
    return '\n'.join(lines)


def _build_targeting_section(input_data: PromptCompilerInput, index: KnowledgeIndex | None) -> str:
    """Build the targeting/hard-gate/cap section."""
    lines = ['## Targeting Rules', '']

    lines.append('### Hard Gates')
    if input_data.hard_gate_ids:
        for rid in input_data.hard_gate_ids:
            if index and rid in index.hard_gates:
                rule = index.hard_gates[rid]
                lines.append(f'- `{rid}`: {rule.get("severity", "?")}')
            else:
                lines.append(f'- `{rid}` [not in index]')
    else:
        lines.append('*None specified*')

    lines.append('')
    lines.append('### Caps')
    if input_data.cap_ids:
        for rid in input_data.cap_ids:
            if index and rid in index.caps:
                rule = index.caps[rid]
                lines.append(f'- `{rid}`')
            else:
                lines.append(f'- `{rid}` [not in index]')
    else:
        lines.append('*None specified*')

    return '\n'.join(lines)


def _build_voice_section(input_data: PromptCompilerInput, index: KnowledgeIndex | None) -> str:
    """Build the voice/regression section."""
    voice_ids = input_data.voice_entry_ids
    regression_ids = input_data.regression_ids
    if not voice_ids and not regression_ids:
        return ''

    lines = ['## Voice & Regression', '']
    if voice_ids:
        lines.append('### Voice Rules')
        for vid in voice_ids:
            if index and vid in index.voice_registry:
                entry = index.voice_registry[vid]
                etype = entry.get('entry_type', '?')
                lines.append(f'- `{vid}` ({etype})')
            else:
                lines.append(f'- `{vid}` [not in index]')
    if regression_ids:
        lines.append('')
        lines.append('### Regression References')
        for rid in regression_ids:
            lines.append(f'- `{rid}`')
    return '\n'.join(lines)


def _build_rules_section(language: str) -> str:
    """Build the rules/constraints section."""
    if language == 'en':
        header = '## Rules'
        invariants = (
            'LETTER CONTRACT (machine-checked; literal constraints):\n'
            '- APPLY or CONSIDER: cover_letter is required and MUST contain the literal interest marker '  # noqa: E501
            '"interested" or "writing ... apply", and the literal value marker "value", "contribute", or "bring".\n'  # noqa: E501
            '- APPLY or CONSIDER: 150–220 words; target 165–185 words.\n'
            '- SKIP => no letter: set cover_letter to the empty string.\n'
            '- Use the exact signature format: `Best regards,` on its own line, then the exact candidate name.\n'  # noqa: E501
            '- No text after the signature; whitespace only. No placeholders, invented claims, or new evidence IDs.\n'  # noqa: E501
            '- Preserve evidence grounding and decision/score unless a listed validator failure requires correction.'  # noqa: E501
        )
        forbid = (
            'Forbidden overclaims (do NOT use these phrases or their equivalents):\n'
            + '\n'.join(f'- {p}' for p in FORBIDDEN_OVERCLAIMS[:10])
        )
        evidence_rule = (
            f'Allowed evidence levels: {", ".join(EVIDENCE_WHITELIST)}. '
            'Do not upgrade evidence. Do not claim E4 when the claim is E3.'
        )
        forbidden_phrases = 'Forbidden placeholder phrases (do NOT use):\n' + '\n'.join(
            f'- {p}' for p in FORBIDDEN_PHRASES[:8]
        )
        return '\n'.join(
            [header, '', invariants, '', forbid, '', evidence_rule, '', forbidden_phrases]
        )
    else:
        header = '## Правила'
        invariants = (
            'КОНТРАК ПИСЬМА (проверяется машинно; буквальные ограничения):\n'
            '- APPLY или CONSIDER: cover_letter обязателен и ДОЛЖЕН содержать буквальный маркер интереса '  # noqa: E501
            '«заинтересовала» или «пишу ... отклик» и буквальный маркер ценности «ценность» или «почему ... компании».\n'  # noqa: E501
            '- APPLY или CONSIDER: 150–220 слов; цель 165–185 слов.\n'
            '- SKIP => без письма: установите cover_letter в пустую строку.\n'
            '- Используйте точный формат подписи: «С уважением,» отдельной строкой, затем точное имя кандидата.\n'  # noqa: E501
            '- После подписи не должно быть текста, только пробелы. Без placeholders, выдуманных утверждений и новых evidence ID.\n'  # noqa: E501
            '- Сохраняйте evidence grounding и decision/score, если исправление не требует иного.'
        )
        forbid = (
            'Запрещённые утверждения (НЕ используйте эти фразы или их эквиваленты):\n'
            + '\n'.join(f'- {p}' for p in FORBIDDEN_OVERCLAIMS[:10])
        )
        evidence_rule = (
            f'Разрешённые уровни evidence: {", ".join(EVIDENCE_WHITELIST)}. '
            'Не повышайте уровень evidence. Не утверждайте E4, если claim имеет E3.'
        )
        forbidden_phrases = 'Запрещённые фразы-заполнители (НЕ используйте):\n' + '\n'.join(
            f'- {p}' for p in FORBIDDEN_PHRASES[:8]
        )
        return '\n'.join(
            [header, '', invariants, '', forbid, '', evidence_rule, '', forbidden_phrases]
        )


def _build_output_format_section() -> str:
    """Build the output format / JSON schema section."""
    schema_str = json.dumps(OUTPUT_JSON_SCHEMA, indent=2, ensure_ascii=False)
    return (
        '## Output Format\n\n'
        'Return ONLY valid JSON matching this schema. No markdown fences, no commentary.\n\n'
        '```json\n'
        f'{schema_str}\n'
        '```'
    )


def _build_system_prompt_ru() -> str:
    return (
        'Ты карьерный аналитик и job-matching assistant.\n'
        'Твоя задача — выполнить evidence-aware анализ вакансии для кандидата.\n\n'
        'Правила:\n'
        '1. Используй ТОЛЬКО предоставленные данные. Не выдумывай факты.\n'
        '2. Не повышай уровень evidence. Позитивная презентация ≠ evidence upgrade.\n'
        '3. Соблюдай portfolio boundary — не выходи за пределы указанного кейса.\n'
        '4. Каждый claim должен иметь traceable evidence ID.\n'
        '5. Не используй запрещённые overclaims и forbidden phrases.\n'
        '6. Верни строго валидный JSON без markdown-обёртки.\n'
        '7. Если информации недостаточно для трёх требований — '
        'верни пустой массив central_requirements.\n'
        '8. Для `apply`/`consider` `cover_letter` обязателен: пять абзацев в порядке приветствие, '
        'интерес к вакансии, опыт с конкретным количественным proof, ценность '
        'для компании, закрытие с благодарностью и подписью. Для decision '
        '`apply`/`consider` — 150–220 слов, цель 165–185; для `skip` верни пустой `cover_letter`. Используй '  # noqa: E501
        'минимум два термина из названия вакансии и только разрешённые факты.\n'
        '9. Для `apply`/`consider`, если выбранный кейс содержит `micro_proof_ru`, вставь его дословно '  # noqa: E501
        'один раз в абзац об опыте. Закрой письмо отдельными последними строками '
        '«С уважением,» и только точным именем кандидата из Project Instructions; '
        'не используй placeholder и не выдумывай имя. Перед отправкой проверь, что '
        'в письме явно присутствуют маркеры интереса (`заинтересовала` или '
        '`пишу ... отклик`) и ценности (`ценность` или `почему ... компании`), '
        'поскольку это обязательные literal-проверки.\n'
        '10. Если используешь selected case в письме, добавь его `case_id` в '
        '`evidence_map`, чтобы proof можно было детерминированно проверить.\n'
    )


def _build_system_prompt_en() -> str:
    return (
        'You are a career analyst and job-matching assistant.\n'
        'Your task is to perform evidence-aware vacancy analysis for a candidate.\n\n'
        'Rules:\n'
        '1. Use ONLY the provided data. Do not invent facts.\n'
        '2. Do not upgrade evidence level. Positive presentation ≠ evidence upgrade.\n'
        '3. Respect the portfolio boundary — do not exceed the specified case scope.\n'
        '4. Every claim must have a traceable evidence ID.\n'
        '5. Do not use forbidden overclaims or placeholder phrases.\n'
        '6. Return strictly valid JSON without markdown fences.\n'
        '7. If insufficient information for three requirements — '
        'return empty central_requirements array.\n'
        '8. For `apply`/`consider`, `cover_letter` is mandatory: write five paragraphs in this order: '  # noqa: E501
        'greeting, vacancy interest, experience with a concrete quantitative '
        'proof, value for the company, and a thankful closing with signature. '
        'For `apply`/`consider`, use 150–220 words with a 165–185 target; for `skip`, return an empty `cover_letter`. '  # noqa: E501
        'Include at least two terms from the vacancy title and use only allowed facts.\n'
        '9. For `apply`/`consider`, when a selected case supplies `micro_proof_en`, include that exact '  # noqa: E501
        'wording once in the experience paragraph. End the letter with separate '
        'final lines: `Best regards,` followed only by the exact candidate name from '
        'Project Instructions; never use a placeholder or invent a name. Before '
        'returning, verify that the letter explicitly contains interest wording '
        '(`interested` or `writing ... apply`) and value wording (`value`, '
        '`contribute`, or `bring`), because these are mandatory literal checks.\n'
        '10. When a selected case is used in the letter, include its `case_id` '
        'in `evidence_map` so the proof can be deterministically verified.\n'
    )


# ── Payload preview ─────────────────────────────────────────────────────────


def _build_payload_preview(
    input_data: PromptCompilerInput,
    model: str,
    privacy_mode: str,
    language: str,
) -> str:
    """Build a human-readable payload preview for user review."""
    sent: list[str] = [
        f'Title: {input_data.title}',
        f'Company: {input_data.company_name or "not provided"}',
    ]
    if input_data.salary_raw:
        sent.append(f'Salary: {input_data.salary_raw}')
    if input_data.city:
        sent.append(f'City: {input_data.city}')
    if input_data.work_mode:
        sent.append(f'Work mode: {input_data.work_mode}')
    if input_data.skills:
        if len(input_data.skills) > 10:
            sent.append(
                f'Skills ({len(input_data.skills)}): {", ".join(input_data.skills[:10])}...'
            )
        else:
            sent.append(f'Skills: {", ".join(input_data.skills)}')
    if privacy_mode != 'strict' and input_data.description_clean:
        sent.append(f'Description: {len(input_data.description_clean)} chars')
    sent.append(f'Claims: {len(input_data.selected_claim_ids)} selected')
    sent.append(f'Cases: {len(input_data.selected_case_ids)} selected')
    if input_data.selected_portfolio_id:
        sent.append(f'Portfolio: {input_data.selected_portfolio_id}')
    sent.append(f'Model: {model}')
    sent.append(f'Privacy: {privacy_mode}')
    sent.append(f'Language: {language}')

    not_sent: list[str] = [
        'Full HTML of vacancy page',
        'Cookies / browser session',
        'Personal notes',
        'Full application history',
        'Other candidates / vacancies',
    ]
    if privacy_mode == 'strict':
        not_sent.append('Full vacancy description (Strict Privacy)')

    lines = ['=== Payload Preview ===', '', 'What WILL be sent:', '']
    lines.extend(f'  + {s}' for s in sent)
    lines.extend(['', 'What will NOT be sent:', ''])
    lines.extend(f'  - {s}' for s in not_sent)

    return '\n'.join(lines)


# ── Token estimation ────────────────────────────────────────────────────────


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token for mixed RU/EN."""
    return max(1, len(text) // 4)
