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


# ── Evidence level mapping (authoritative V4 strength scale) ────────────

# Canonical mapping from the V4 strength scale (see workoutreachHH
# STAGE_1_EVIDENCE_INVENTORY) to the six-level evidence model:
#   A_DIRECT             -> E4 (direct commercial fact)
#   A_PROJECT_VALIDATED  -> E3 (strong hands-on project evidence)
#   B_PROJECT_IMPLEMENTED -> E3 (implemented project with code/CI/tests)
#   C_PROJECT_DOCUMENTED -> E2 (documented capability, no runtime proof)
#   D_TOOL_LISTED        -> E2 (supporting argument only)
#   X_SUPERSEDED         -> excluded from the index entirely
_STRENGTH_LEVELS: dict[str, str] = {
    'A_DIRECT': 'E4',
    'A_PROJECT_VALIDATED': 'E3',
    'B_PROJECT_IMPLEMENTED': 'E3',
    'C_PROJECT_DOCUMENTED': 'E2',
    'D_TOOL_LISTED': 'E2',
}

# Explicit evidence_status overrides when present.
_EVIDENCE_STATUS_LEVELS: dict[str, str] = {
    'CONFIRMED_DIRECT': 'E4',
    'CONFIRMED_HANDS_ON': 'E3',
    'CONFIRMED_FAMILIARITY': 'E2',
}


def _map_claim_evidence_level(entry: dict[str, Any]) -> str | None:
    """Map a real V4 claim entry to its evidence level.

    Returns None for entries that must not be used (X_SUPERSEDED).
    Invariants enforced here:
    - TRANSFERABLE_INFERENCE origin can never exceed P1 (bridge, not direct);
    - CERTIFICATE_* origin can never be E4 (certificate != commercial practice);
    - portfolio/project strength can never be E4 (portfolio != commercial
      production).
    """
    strength = str(entry.get('strength') or entry.get('evidence_strength') or '')
    if strength == 'X_SUPERSEDED':
        return None
    status = str(entry.get('evidence_status') or '')
    level = _EVIDENCE_STATUS_LEVELS.get(status) or _STRENGTH_LEVELS.get(strength) or 'X0'

    origins = entry.get('origin')
    if isinstance(origins, str):
        origins = [origins]
    origin_text = ' '.join(str(o) for o in origins or [])
    if 'TRANSFERABLE_INFERENCE' in origin_text:
        level = 'P1'
    elif 'CERTIFICATE_' in origin_text and level == 'E4':
        level = 'E3'
    if strength in ('A_PROJECT_VALIDATED', 'B_PROJECT_IMPLEMENTED') and level == 'E4':
        level = 'E3'
    return level


def _populate_index(index: KnowledgeIndex, file_texts: dict[str, str]) -> KnowledgeIndex:
    """Populate an already validated index from canonical file texts."""
    # ── Parse frontmatter for structured ID extraction ───────────────────

    from app.engine.package import (
        _parse_all_frontmatter_blocks,
        _parse_fenced_yaml_blocks,
        _parse_frontmatter_yaml,
    )

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
        if not index.claims:
            # Authoritative V4 format: per-claim fenced ```yaml blocks.
            for block in _parse_fenced_yaml_blocks(claims_text):
                cid = block.get('claim_id')
                if not isinstance(cid, str) or not cid.strip():
                    continue
                level = _map_claim_evidence_level(block)
                if level is None:
                    # X_SUPERSEDED / unknown — excluded from the index.
                    continue
                entry = dict(block)
                entry['evidence_level'] = level
                wording = block.get('strongest_safe_wording_ru') or block.get(
                    'strongest_safe_wording_en'
                ) or block.get('allowed_wording') or ''
                entry['allowed_wording'] = str(wording)
                index.claims[cid] = entry
                index.claim_evidence_levels[cid] = level
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
        if not index.commercial_cases:
            for block in _parse_fenced_yaml_blocks(cases_text):
                cid = block.get('case_id')
                if not isinstance(cid, str) or not cid.strip():
                    continue
                entry = dict(block)
                strength = str(block.get('evidence_strength') or block.get('strength') or '')
                entry['evidence_level'] = _STRENGTH_LEVELS.get(strength, 'E4')
                index.commercial_cases[cid] = entry
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
        if not index.portfolio_cases:
            for block in _parse_fenced_yaml_blocks(portfolio_text):
                pid = block.get('portfolio_id')
                if not isinstance(pid, str) or not pid.strip():
                    continue
                entry = dict(block)
                shareability = str(block.get('shareability') or '')
                entry['boundary'] = (
                    'no public link' if 'internal_only' in shareability or 'no_link' in shareability else ''
                )
                index.portfolio_cases[pid] = entry
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
        if not index.targeting_rules:
            # Authoritative V4 format: target profiles with target_id + family,
            # plus policy-map blocks carrying the deterministic scoring policy.
            for block in _parse_fenced_yaml_blocks(targeting_text):
                rid = block.get('target_id')
                if isinstance(rid, str) and rid.strip():
                    index.targeting_rules[rid] = block
                    continue
                caps_policy = block.get('score_caps')
                if isinstance(caps_policy, dict):
                    for rule_id, spec in caps_policy.items():
                        if isinstance(spec, dict) and 'cap' in spec:
                            index.caps[str(rule_id)] = {
                                'rule_id': str(rule_id),
                                'max_score': spec['cap'],
                                'policy_id': caps_policy.get('policy_id', ''),
                            }
                hard_fails = block.get('automatic_hard_fails')
                if isinstance(hard_fails, list):
                    for hf in hard_fails:
                        if isinstance(hf, dict) and hf.get('id'):
                            index.hard_gates[str(hf['id'])] = hf
            # Policy-map blocks (screening_fit, evidence_preflight, ...) are
            # document-level constraints without machine IDs.

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
        if not index.voice_registry:
            for block in _parse_fenced_yaml_blocks(voice_text):
                eid = block.get('gold_id')
                if not isinstance(eid, str) or not eid.strip():
                    continue
                index.voice_registry[eid] = block

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
        if not index.skill_calibrations:
            # Authoritative V4 format: calibration groups with skill name lists.
            for i, block in enumerate(_parse_fenced_yaml_blocks(skills_text)):
                skills = block.get('skills')
                if not isinstance(skills, list):
                    continue
                allowed = block.get('allowed_wording') or {}
                forbidden = block.get('forbidden') or []
                for j, name in enumerate(skills):
                    if not isinstance(name, str) or not name.strip():
                        continue
                    sid = name if ':' not in name else name.split(':', 1)[0]
                    index.skill_calibrations[f'{sid}#{i}_{j}'] = {
                        'skill_id': sid,
                        'skill_name': name,
                        'allowed_wording': allowed,
                        'forbidden': forbidden,
                    }

    return index


def build_knowledge_index(
    package: LoadedEnginePackage, file_texts: dict[str, str]
) -> KnowledgeIndex:
    """Build a deterministic knowledge index from a validated package."""
    return KnowledgeIndex(package, file_texts)
