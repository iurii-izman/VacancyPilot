"""Deterministic knowledge index for the loaded V4 engine package — AOPS-07.

Builds lookup structures from the validated file texts.  No generated text
is treated as candidate evidence.  All evidence references are traceable to
explicit claim/evidence IDs in the source package.
"""

from __future__ import annotations

from typing import Any

from app.engine.models import (
    LoadedEnginePackage,
)


class KnowledgeIndex:
    """Deterministic index built from a validated ``LoadedEnginePackage``.

    Provides O(1) lookups for:

    - claim/evidence IDs and their evidence levels
    - commercial case IDs
    - portfolio IDs with boundaries
    - skill calibration entries
    - targeting/hard-gate/cap rule references
    - voice/regression metadata

    The index is built once and never mutated.  It contains only IDs,
    levels, statuses, and references — no candidate text, no generated
    wording, no AI output.
    """

    def __init__(self, package: LoadedEnginePackage, file_texts: dict[str, str]) -> None:
        if not package.valid:
            raise ValueError('Cannot build knowledge index from an invalid package')

        # Reconstruct the file_texts dict from package metadata.
        # The knowledge index is built at the same time as the package is
        # loaded.  This class expects to receive the raw file texts
        # collected during loading.
        self._package_identity = package.identity

        # claim_id -> evidence_level
        self.claim_evidence_levels: dict[str, str] = {}
        # claim_id -> claim entry dict
        self.claims: dict[str, dict[str, Any]] = {}
        # case_id -> case entry dict
        self.commercial_cases: dict[str, dict[str, Any]] = {}
        # portfolio_id -> portfolio entry dict
        self.portfolio_cases: dict[str, dict[str, Any]] = {}
        # rule_id -> rule entry dict
        self.targeting_rules: dict[str, dict[str, Any]] = {}
        # Hard gates specifically
        self.hard_gates: dict[str, dict[str, Any]] = {}
        # Caps specifically
        self.caps: dict[str, dict[str, Any]] = {}
        # skill_id -> calibration entry dict
        self.skill_calibrations: dict[str, dict[str, Any]] = {}
        # entry_id -> voice/regression entry dict
        self.voice_registry: dict[str, dict[str, Any]] = {}

        # Counters
        self.claim_count: int = 0
        self.case_count: int = 0
        self.portfolio_count: int = 0

        # Build from file texts
        self._build(file_texts)

    @property
    def engine_version(self) -> str:
        return self._package_identity.engine_version

    @property
    def aggregate_hash(self) -> str:
        return self._package_identity.aggregate_hash

    @property
    def loaded_at(self) -> str:
        return self._package_identity.loaded_at

    # ── Internal builder ─────────────────────────────────────────────────

    def _build(self, file_texts: dict[str, str]) -> None:
        """Populate all index structures from package file records.

        This is called during __init__ and must never mutate the package.
        """
        _populate_index(self, file_texts)


# ── Public builder ───────────────────────────────────────────────────────


def _populate_index(index: KnowledgeIndex, file_texts: dict[str, str]) -> KnowledgeIndex:
    """Populate an already validated index from canonical file texts."""
    # ── Parse frontmatter for structured ID extraction ───────────────────

    from app.engine.package import _parse_frontmatter_yaml

    # 01_candidate_claims.md
    claims_text = file_texts.get('01_candidate_claims.md', '')
    if claims_text:
        fm = _parse_frontmatter_yaml(claims_text)
        if fm and isinstance(fm, dict):
            claims_list = fm.get('claims', fm.get('candidate_claims', []))
            if isinstance(claims_list, list):
                for c in claims_list:
                    if not isinstance(c, dict):
                        continue
                    cid = c.get('claim_id')
                    if cid:
                        index.claims[str(cid)] = c
                        level = c.get('evidence_level')
                        if level:
                            index.claim_evidence_levels[str(cid)] = str(level)
                index.claim_count = len(index.claims)

    # 02_experience_case_bank.md
    cases_text = file_texts.get('02_experience_case_bank.md', '')
    if cases_text:
        fm = _parse_frontmatter_yaml(cases_text)
        if fm and isinstance(fm, dict):
            cases_list = fm.get('cases', fm.get('commercial_cases', []))
            if isinstance(cases_list, list):
                for c in cases_list:
                    if not isinstance(c, dict):
                        continue
                    cid = c.get('case_id')
                    if cid:
                        index.commercial_cases[str(cid)] = c
                index.case_count = len(index.commercial_cases)

    # 03_portfolio_cases.md
    portfolio_text = file_texts.get('03_portfolio_cases.md', '')
    if portfolio_text:
        fm = _parse_frontmatter_yaml(portfolio_text)
        if fm and isinstance(fm, dict):
            portfolios_list = fm.get('cases', fm.get('portfolio_cases', []))
            if isinstance(portfolios_list, list):
                for p in portfolios_list:
                    if not isinstance(p, dict):
                        continue
                    pid = p.get('portfolio_id')
                    if pid:
                        index.portfolio_cases[str(pid)] = p
                index.portfolio_count = len(index.portfolio_cases)

    # 04_targeting_constraints.md
    targeting_text = file_texts.get('04_targeting_constraints.md', '')
    if targeting_text:
        fm = _parse_frontmatter_yaml(targeting_text)
        if fm and isinstance(fm, dict):
            rules_list = fm.get('rules', fm.get('constraints', []))
            if isinstance(rules_list, list):
                for r in rules_list:
                    if not isinstance(r, dict):
                        continue
                    rid = r.get('rule_id')
                    if rid:
                        index.targeting_rules[str(rid)] = r
                        rule_type = r.get('rule_type', '')
                        if rule_type == 'hard_gate':
                            index.hard_gates[str(rid)] = r
                        elif rule_type == 'cap':
                            index.caps[str(rid)] = r

    # 05_voice_and_gold_examples.md
    voice_text = file_texts.get('05_voice_and_gold_examples.md', '')
    if voice_text:
        fm = _parse_frontmatter_yaml(voice_text)
        if fm and isinstance(fm, dict):
            entries_list = fm.get('entries', fm.get('voice_entries', []))
            if isinstance(entries_list, list):
                for e in entries_list:
                    if not isinstance(e, dict):
                        continue
                    eid = e.get('entry_id')
                    if eid:
                        index.voice_registry[str(eid)] = e

    # 09_skill_calibration_matrix.md
    skills_text = file_texts.get('09_skill_calibration_matrix.md', '')
    if skills_text:
        fm = _parse_frontmatter_yaml(skills_text)
        if fm and isinstance(fm, dict):
            skills_list = fm.get('skills', fm.get('calibrations', []))
            if isinstance(skills_list, list):
                for s in skills_list:
                    if not isinstance(s, dict):
                        continue
                    sid = s.get('skill_id')
                    if sid:
                        index.skill_calibrations[str(sid)] = s

    return index


def build_knowledge_index(
    package: LoadedEnginePackage, file_texts: dict[str, str]
) -> KnowledgeIndex:
    """Build a deterministic knowledge index from a validated package."""
    return KnowledgeIndex(package, file_texts)
