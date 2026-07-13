# ITER-015: Release Safety Tests

Epic: EPIC-10
Commit: `test: add release safety checks`

## Goal

Add automated checks that prevent unsafe release regressions.

## Scope

- Manifest permission assertion.
- Privacy payload tests.
- No HH `fetch` in content scripts check.
- No `.click()` or `.value` mutation of HH controls check.
- Export secret exclusion test.
- Fixture regression script.

## Non-Goals

- No public store assets.
- No Labs checks beyond ensuring Labs are off by default.

## Acceptance Criteria

- Safety tests fail if forbidden permissions appear.
- Safety tests fail if AI payload includes excluded fields.
- Release checklist documents manual gaps.

## Validation

```text
pnpm test
pnpm build
```
