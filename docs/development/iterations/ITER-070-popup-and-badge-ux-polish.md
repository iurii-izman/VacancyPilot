# ITER-070: Popup And Badge UX Polish

Epic: EPIC-35
Commit: `polish: improve popup and page badge UX`

## Goal

Polish popup density and HH page-badge placement after the side-panel runtime fix, without changing product behavior.

## Scope

- tighten popup action layout for real 300-360px widths;
- improve compact score/status presentation and collapse noisy detail by default;
- refine low-score semantics so the popup stays informative without looking alarm-heavy;
- reposition and restyle the HH page badge so it avoids header conflicts and remains readable;
- verify badge-trigger behavior still respects the current safety and user-gesture constraints;
- add focused tests and manual QA notes for popup/badge regressions.

## Non-Goals

- no dashboard/options work in this iteration;
- no product-logic changes outside local UI state and presentation;
- no permission changes;
- no hidden HH fetch/XHR, form writes, or auto-click behavior.

## Acceptance Criteria

- popup actions fit cleanly without cramped labels or broken primary-action emphasis;
- the compact popup summary is easier to scan than the current technical breakdown;
- the page badge avoids obvious overlap with HH header controls on real pages;
- badge and popup behavior remain inside the current safety envelope;
- focused tests cover the key rendering/interaction regressions touched here.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
