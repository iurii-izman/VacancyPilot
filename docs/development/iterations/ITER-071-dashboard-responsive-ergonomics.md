# ITER-071: Dashboard Responsive Ergonomics

Epic: EPIC-35
Commit: `feat: polish dashboard responsive ergonomics`

## Goal

Reduce nested-scroll friction and improve dashboard/options usability at narrow widths without reopening product logic.

## Scope

- map the current dashboard/options shell and remove unnecessary nested vertical scroll containers;
- make the navigation/sidebar more usable at medium and narrow widths with the least risky compact treatment;
- improve empty-state width/readability in cramped layouts;
- make profile/resume/settings forms wrap and size more cleanly on narrow surfaces;
- keep kanban readable in medium/narrow widths without adding drag-and-drop or new workflow behavior;
- document the responsive QA pass and remaining UX debt.

## Non-Goals

- no new dashboard features;
- no browser-permission or host-permission changes;
- no hidden HH fetch/XHR;
- no broad design-system rewrite;
- no branch/PR operations inside the implementation run.

## Acceptance Criteria

- normal dashboard/options usage no longer creates avoidable triple-scroll behavior;
- narrow widths leave materially more room for content than the current layout;
- empty states and forms remain readable without one-word-per-line wrapping;
- kanban remains usable in wide and narrow modes;
- focused validation covers the touched layout surfaces.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
