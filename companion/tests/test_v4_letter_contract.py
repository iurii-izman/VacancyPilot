"""Public-safe offline regression corpus for persisted Full V4 letter failures."""

from types import SimpleNamespace

from app.analysis.compiler import assert_prompt_contract, compile_prompt
from app.analysis.models import PromptCompilerInput, V4StructuredResult
from app.analysis.validators import _check_signature, _check_word_count, validate_structured_result


def _result(
    letter: str, decision: str = 'apply', evidence_map: list[dict] | None = None
) -> V4StructuredResult:
    return V4StructuredResult(
        vacancy_identity={'company': 'Synthetic Corp', 'role': 'Python Backend Engineer'},
        eligibility={'hard_fail': decision == 'skip', 'reasons': []},
        central_requirements=[],
        evidence_map=evidence_map or [],
        score={'raw': 70, 'final': 70, 'confidence': 'medium', 'decision': decision},
        strategy={'positioning': 'Synthetic backend experience', 'tone': 'measured'},
        cover_letter=letter,
        recruiter_risks=[
            {'risk': 'Synthetic risk one', 'severity': 'low'},
            {'risk': 'Synthetic risk two', 'severity': 'medium'},
        ],
        interview_prep=[],
        qa={'passed': False, 'errors': []},
    )


def _letter(words: int = 165, *, value: bool = True, trailing: str = '') -> str:
    marker = ' interested'
    body = (
        'Python Backend Engineer'
        + marker
        + ' experience improved 40% '
        + 'grounded ' * max(0, words - 7)
        + (' value' if value else '')
    )
    return f'Hello,\n\n{body}\n\nBest regards,\nSynthetic Candidate{trailing}'


def test_missing_value_marker_is_rejected() -> None:
    errors = validate_structured_result(_result(_letter(value=False)), english_required=True)
    assert any('VALUE_MARKER_MISSING' in error for error in errors)


def test_130_word_letter_is_rejected() -> None:
    errors = validate_structured_result(_result(_letter(words=130)), english_required=True)
    assert any('WORD_COUNT_LOW' in error for error in errors)


def test_trailing_signature_content_is_rejected() -> None:
    letter = _letter(trailing='\nAdditional text after signature.')
    assert any('SIGNATURE_TRAILING' in error for error in _check_signature(letter))


def test_combined_latest_three_error_shape_is_rejected() -> None:
    errors = validate_structured_result(
        _result(_letter(words=130, value=False, trailing='\nTail')), english_required=True
    )
    assert any('VALUE_MARKER_MISSING' in error for error in errors)
    assert any('WORD_COUNT_LOW' in error for error in errors)
    assert any('SIGNATURE_TRAILING' in error for error in errors)


def test_repaired_structured_response_passes_and_preserves_score_decision() -> None:
    original = _result(_letter(words=130, value=False), decision='consider')
    repaired = _result(_letter(), decision=original.score.decision)
    assert validate_structured_result(repaired, english_required=True) == []
    assert repaired.score.final == original.score.final
    assert repaired.score.decision == original.score.decision


def test_repair_with_one_remaining_error_stays_invalid() -> None:
    errors = validate_structured_result(_result(_letter(value=False)), english_required=True)
    assert errors
    assert any('VALUE_MARKER_MISSING' in error for error in errors)


def test_skip_never_gets_a_generated_letter() -> None:
    assert validate_structured_result(_result('', decision='skip'), english_required=True) == []
    errors = validate_structured_result(_result(_letter(), decision='skip'), english_required=True)
    assert any('SKIP_LETTER_FORBIDDEN' in error for error in errors)


def test_unknown_evidence_ids_remain_rejected() -> None:
    index = SimpleNamespace(claims={}, commercial_cases={}, portfolio_cases={})
    errors = validate_structured_result(
        _result(
            _letter(),
            evidence_map=[{'requirement_index': 0, 'evidence_level': 'E3', 'claim_id': 'UNKNOWN'}],
        ),
        index=index,
        english_required=True,
    )
    assert any('UNSUPPORTED_CLAIM' in error for error in errors)


def test_exact_signature_has_no_trailing_content() -> None:
    assert _check_signature('Hello\n\nBest regards,\nSynthetic Candidate') == []
    assert _check_signature('Hello\n\nBest regards,\nSynthetic Candidate\nNote')


def test_word_count_boundaries() -> None:
    assert _check_word_count('word ' * 149, 'apply')
    assert _check_word_count('word ' * 150, 'apply') == []
    assert _check_word_count('word ' * 220, 'apply') == []
    assert _check_word_count('word ' * 221, 'apply')


def test_initial_and_repair_prompt_contracts_are_identical_mode() -> None:
    compiled = compile_prompt(PromptCompilerInput(title='Synthetic role'), None, None)
    assert_prompt_contract(compiled.system_prompt, compiled.user_prompt)
    assert '150–220' in compiled.user_prompt
    assert '165–185' in compiled.user_prompt
    assert 'SKIP => без письма' in compiled.user_prompt
