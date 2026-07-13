# ITER-024: Save Semantics And Score Recompute

Epic: EPIC-13
Commit: `fix: align save semantics and score recompute`

## Goal

Make Save mean `saved`, keep stronger statuses intact, and ensure score updates when profile selection changes the scoring context.

## Scope

- change popup Save semantics from `viewed` to `saved`;
- preserve stronger statuses like `applied`, `interview`, `offer`;
- create a shared score recompute path for profile-driven updates;
- update popup / side panel / badge state after recompute;
- add focused tests for status transitions and recompute behavior.

## Non-Goals

- no orphan cleanup yet;
- no cover-letter privacy changes;
- no parser hardening;
- no dashboard/settings work outside the recompute path.

## Acceptance Criteria

- new Save stores `saved`;
- existing stronger statuses are not downgraded by Save;
- selecting a profile recalculates `ruleScore` without needing another Save click;
- badge and runtime surfaces reflect the new score;
- tests cover save-status semantics and recompute flow.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
