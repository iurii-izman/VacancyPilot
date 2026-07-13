# ITER-059: Final Moderate Dependency Alert

Epic: EPIC-30
Commit: `fix: close final moderate dependency alert`

## Goal

Close the remaining moderate transitive dependency alert cleanly, without dragging the repo into another broad toolchain rewrite.

## Scope

- inspect the exact transitive path for the open `uuid` advisory;
- apply the smallest safe dependency/lockfile change that clears it;
- rerun audit and normal validation;
- document the residual posture only if a full closure is externally blocked.

## Non-Goals

- no product feature work;
- no broad stack refresh;
- no permission changes;
- no public-release scope.

## Acceptance Criteria

- the alert is closed locally and, if possible, on GitHub after push;
- the chosen fix is minimal and explained;
- full project verification still passes.

## Validation

```text
pnpm audit --prod
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
