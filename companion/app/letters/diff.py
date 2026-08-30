"""Deterministic generated-to-sent text diff utilities."""

from __future__ import annotations

import difflib
import re
from dataclasses import asdict, dataclass

_WORD = re.compile(r'\b\w+\b', re.UNICODE)


@dataclass(frozen=True)
class LetterDiff:
    generated_words: int
    sent_words: int
    words_added: int
    words_removed: int
    edit_ratio: float
    opening_changed: bool
    closing_changed: bool
    unified_diff: list[str]

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


def compute_letter_diff(generated_text: str, sent_text: str) -> LetterDiff:
    """Compare text only; never infer whether a user edit is good or bad."""
    before = _words(generated_text)
    after = _words(sent_text)
    matcher = difflib.SequenceMatcher(a=before, b=after, autojunk=False)
    added = removed = 0
    for tag, left_start, left_end, right_start, right_end in matcher.get_opcodes():
        if tag in ('replace', 'delete'):
            removed += left_end - left_start
        if tag in ('replace', 'insert'):
            added += right_end - right_start
    denominator = max(len(before), len(after), 1)
    before_lines = generated_text.strip().splitlines()
    after_lines = sent_text.strip().splitlines()
    return LetterDiff(
        generated_words=len(before),
        sent_words=len(after),
        words_added=added,
        words_removed=removed,
        edit_ratio=round((added + removed) / denominator, 4),
        opening_changed=_edge(before_lines, 0) != _edge(after_lines, 0),
        closing_changed=_edge(before_lines, -1) != _edge(after_lines, -1),
        unified_diff=list(
            difflib.unified_diff(
                before_lines, after_lines, fromfile='generated', tofile='sent', lineterm=''
            )
        ),
    )


def _words(value: str) -> list[str]:
    return _WORD.findall(value.casefold())


def _edge(lines: list[str], index: int) -> str:
    if not lines:
        return ''
    return lines[index].strip()
