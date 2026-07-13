# ITER-012: Cover Letter Studio

Epic: EPIC-07
Commit: `feat: add cover letter studio`

## Goal

Add the first cover letter workflow: mode, constraints, editable draft, save final, copy.

## Scope

- Letter mode selector.
- Constraint handling.
- Draft editor.
- Save final.
- Copy button.
- Letter version model usage.
- Validation warnings.

## Non-Goals

- No HH form fill.
- No click on HH apply.
- No letter queue.

## Acceptance Criteria

- User can edit generated/manual text.
- Final letter is linked to job/profile.
- Copy uses user action.
- Constraints are displayed and enforced or warned.

## Validation

```text
pnpm typecheck
pnpm test
pnpm build
```
