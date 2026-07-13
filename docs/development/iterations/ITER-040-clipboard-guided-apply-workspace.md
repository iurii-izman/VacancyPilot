# ITER-040: Clipboard Guided Apply Workspace

Epic: EPIC-22
Commit: `feat: add guided apply workspace`

## Goal

Build the first usable guided-apply Labs workflow while keeping all HH actions manual.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `5.6`, `Phase 4`, `24.3`
- current repository state after `ITER-039`

## Scope

- vacancy-side guided-apply workspace;
- resume recommendation based on local profile/resume data and `hhResumeId`;
- clipboard/copy assist blocks;
- field guidance / highlighting without writing values into HH forms;
- manual mark-as-applied flow after user action;
- tests for Labs gating and no-automation boundaries.

## Non-Goals

- no DOM form fill;
- no auto-clicks on HH submit controls;
- no hidden vacancy opening;
- no webhook or reminder delivery.

## Acceptance Criteria

- the user gets practical apply assistance without the extension acting on HH;
- the Labs workflow stays visibly manual and policy-safe;
- tests lock the no-auto-fill boundary.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
