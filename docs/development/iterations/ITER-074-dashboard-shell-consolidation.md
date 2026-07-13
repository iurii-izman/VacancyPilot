# ITER-074: Dashboard Shell Consolidation

Epic: EPIC-36
Commit: `feat: consolidate dashboard shell responsiveness`

## Goal

Consolidate dashboard/options shell behavior so navigation width, scroll ownership, and section density feel deliberate across extension-sized widths.

## Scope

- clean up sidebar breakpoint behavior and label/icon presentation;
- reduce remaining shell-level scroll noise and ambiguity about which container owns scrolling;
- introduce lightweight section grouping or visual separation in the sidebar if it materially improves scanability;
- keep narrow-layout content readable without over-investing in a full design-system rewrite;
- preserve current feature set and information density.

## Non-Goals

- no new dashboard features;
- no broad refactor of all inline styles;
- no drag-and-drop kanban or table redesign;
- no permissions or external-flow changes.

## Acceptance Criteria

- dashboard navigation consumes less width at real 500-900px extension sizes;
- shell scroll ownership is predictable and visually quieter;
- full-label mode does not rely on awkward native tooltips;
- the dashboard reads more like a structured product workspace than a list of disconnected sections.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
