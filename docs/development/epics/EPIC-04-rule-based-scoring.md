# EPIC-04: Rule-Based Scoring

## Goal

Provide useful, explainable vacancy matching without AI.

## Scope

- Scoring weights.
- Score breakdown.
- Fit reasons.
- Risk flags.
- Caps and penalties.
- Per-profile scoring settings.
- Tests for scoring edge cases.

## Non-Goals

- No AI scoring dependency.
- No company reputation scraping.
- No hidden external enrichment.

## Acceptance Criteria

- Score is deterministic for the same inputs.
- Output includes total, recommendation, breakdown, fit reasons, and risk flags.
- Missing data degrades gracefully.
- Critical risk caps override high raw scores.

## Safety Notes

Scoring is advice, not an automated decision to apply.
