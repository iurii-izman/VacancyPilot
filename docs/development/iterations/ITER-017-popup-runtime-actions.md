# ITER-017: Popup Runtime Actions

Epic: EPIC-11
Commit: `feat: wire popup runtime actions`

## Goal

Replace popup placeholders with working local actions and live state for the currently detected vacancy.

## Scope

- Wire `Save` action to tracker/local persistence.
- Wire `Reject` action to status update.
- Show real current status for detected saved vacancy.
- Show live rule score if vacancy data exists locally.
- Ensure Side Panel / Dashboard actions still work from popup.
- Add tests for popup runtime action logic where practical.

## Non-Goals

- No new AI provider work.
- No dashboard table implementation.
- No profile/resume CRUD in this iteration.

## Acceptance Criteria

- `Save` from popup persists the vacancy locally.
- `Reject` updates status locally.
- `Score` and `Status` are no longer placeholder-only for saved vacancies.
- Popup behavior is stable on HH vacancy pages and harmless on non-vacancy pages.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
