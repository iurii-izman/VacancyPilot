# ITER-008: Rule-Based Scoring

Epic: EPIC-04
Commit: `feat: add rule based scoring`

## Goal

Implement the first deterministic scoring engine.

## Scope

- Scoring weights.
- ScoreResult.
- Fit reasons.
- Risk flags.
- Caps/penalties.
- Unit tests for strong/good/skip cases.

## Non-Goals

- No AI.
- No external enrichment.
- No UI calibration yet.

## Acceptance Criteria

- Same input produces same output.
- Score breakdown sums coherently.
- Critical risks cap recommendation.
- Missing optional data degrades gracefully.

## Validation

```text
pnpm typecheck
pnpm test
```
