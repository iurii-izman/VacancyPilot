# ITER-020: Surface State Consistency

Epic: EPIC-11
Commit: `feat: sync runtime surfaces`

## Goal

Make popup, side panel, and dashboard reflect the same saved vacancy state, score explanation, and selected profile context.

## Scope

- Shared local read path for current vacancy state.
- Side panel reflects saved status/profile/score consistently.
- Dashboard and popup stay in sync after updates.
- Improve score explanation visibility where current data exists.

## Non-Goals

- No new external integrations.
- No speculative state-management rewrite.

## Acceptance Criteria

- Changing state in one surface is visible in the others after refresh/reopen.
- Score explanation is accessible when a scored vacancy exists.
- No duplicate/split local representations of the same vacancy.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
