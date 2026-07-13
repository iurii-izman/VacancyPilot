# ITER-058: Experience-Aware Scoring Calibration

Epic: EPIC-29
Commit: `feat: improve scoring fit signals`

## Goal

Use the new profile experience/seniority fields to make the rule-based score more honest and more useful in real vacancy ranking.

## Scope

- update scoring logic to consume `experienceYears` and `seniority`;
- replace the current neutral experience scoring path where enough data exists;
- add explainable fit reasons and risk flags for underqualification / overqualification / seniority mismatch where appropriate;
- keep the scoring changes conservative and readable rather than introducing opaque heuristics;
- add focused tests for new score/risk behavior and recompute paths.

## Non-Goals

- no AI ranking;
- no parser expansion for company domain/industry intelligence;
- no large UI redesign;
- no synonym-dictionary or public-release work.

## Acceptance Criteria

- experience scoring is no longer purely neutral when both vacancy and profile data exist;
- the user can see clearer reasons or risk flags for experience/seniority mismatch;
- automated tests cover the new scoring paths and preserve determinism;
- scoring remains explainable and bounded inside the existing weight model.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
