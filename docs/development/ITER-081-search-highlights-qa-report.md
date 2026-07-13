# ITER-081 Search Highlights QA Report

Date: 2026-06-22
Scope: `ITER-081-search-highlights-controls-and-qa.md`

## What Changed

- Added a dedicated `Search Highlights` section in the settings UI.
- Exposed local controls for:
  - enabling/disabling search highlights;
  - showing viewed vacancies;
  - showing saved/rejected statuses;
  - showing score chips;
  - showing view count;
  - dimming or hiding rejected cards.
- Extended the search surface to honor those controls while keeping the work mode chip and quick actions extension-owned.
- Added `viewCount` to local search highlight state.

## Verification

- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm test` passed.
- `pnpm build` passed.
- `pnpm test:release` passed.

## QA Notes

- Search-highlight rendering is covered by unit tests for badge rendering, card state handling, and batched highlight-state resolution.
- Settings normalization is covered by bridge tests, including default values for the new Search Highlights controls.
- Release-safety checks still confirm no new sensitive permissions were introduced.

## Residual Risks

- Live HH browser validation was not performed in this repository session, so real-page DOM drift remains the main operational risk.
- The search surface still depends on HH search-card selectors and may need adjustment if HH changes markup.
- The highlight layer is intentionally conservative when the background message path is unavailable; this preserves the page but can hide some local state until the next refresh.
