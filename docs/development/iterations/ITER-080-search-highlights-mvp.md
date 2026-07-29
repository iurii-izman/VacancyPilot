# ITER-080: Search Highlights MVP

Epic: EPIC-38

Status: done

Commit: `63474fb`

## Goal

Turn the current search-card badge layer into a real local visual-triage surface by resolving batched highlight state from local data and rendering viewed/saved/rejected/known-score states safely on HH search cards.

## Scope

- add a batched highlight-state service that combines `visitMarks`, `jobs`, and settings;
- introduce a background/runtime message flow for visible search-card vacancy IDs;
- extend or deliberately replace the current search badge rendering contract to support viewed state, status priority, score chip, and dim/hide rejected behavior;
- preserve current quick save/reject workflows while integrating the richer highlight state;
- add focused runtime/search-surface tests for dynamic lists, dedupe, and repeated renders.

## Non-Goals

- no browser history integration;
- no new scoring on the search page;
- no company history counters or duplicate hints yet;
- no dashboard-level analytics expansion;
- no new permissions.

## Acceptance Criteria

- visible HH search cards can show viewed/saved/rejected/applied/interview/offer priority from local data where known;
- known score is shown only when already available locally;
- rejected cards can be dimmed or hidden based on settings without mutating HH controls;
- dynamic HH search-page re-renders do not duplicate hosts or leak stale state;
- quick save/reject still work with the richer highlight surface.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
