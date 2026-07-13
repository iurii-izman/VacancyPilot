# ITER-002: Quality Scripts

Epic: EPIC-00
Commit: `chore: add project quality scripts`

## Goal

Add the quality commands that every later autopilot run can rely on.

## Scope

- Typecheck script.
- Lint script.
- Unit test script.
- Build script.
- Optional CI workflow shape if dependency setup is stable.
- README development command update.

## Non-Goals

- No feature code.
- No parser fixtures yet.

## Acceptance Criteria

- `pnpm typecheck` runs.
- `pnpm test` runs.
- `pnpm build` runs.
- README documents commands.

## Validation

```text
pnpm typecheck
pnpm test
pnpm build
```
