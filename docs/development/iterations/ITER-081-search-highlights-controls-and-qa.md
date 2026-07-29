# ITER-081: Search Highlights Controls And QA

Epic: EPIC-38

Status: done

Commit: `e6c3958`

## Goal

Make the Search Highlights MVP operable and reviewable by adding user-facing settings, narrowly scoped local controls, and final QA/reporting for the pack.

## Scope

- add a Search Highlights section to the current settings UI;
- expose the MVP controls that materially affect the feature:
  - enable/disable;
  - show viewed;
  - show saved/rejected;
  - show score;
  - dim rejected;
  - hide rejected;
  - show view count;
- add a small local search-surface control strip only if it stays lightweight and clearly improves repeated use;
- capture manual QA evidence and residual risks for the MVP pack.

## Non-Goals

- no browser-history import;
- no search snapshots / "new since last search";
- no company history counters or duplicate hints;
- no broader dashboard redesign;
- no permissions changes.

## Acceptance Criteria

- users can control the main Search Highlights behaviors from settings without digging into code or storage;
- optional local controls affect only extension-owned presentation, not HH state;
- manual QA explicitly confirms vacancy-open recording, viewed rendering, saved/rejected rendering, settings toggles, export/delete behavior, and unchanged permission posture;
- the pack ends with a coherent QA/report artifact and not only code changes.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
