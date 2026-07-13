# ITER-067: Workflow Ergonomics Refinement

Epic: EPIC-34
Commit: `feat: refine workflow ergonomics`

## Goal

Improve the usability of kanban, HR workspace, and guided-apply surfaces for repeated daily workflow.

## Scope

- improve action grouping, density, and visible context in kanban and workflow-heavy views;
- refine status/action affordances where the current UI makes repeated use unnecessarily awkward;
- improve workspace feedback around selected items, transitions, warnings, and no-data states;
- keep behavior local-first and read-first.

## Non-Goals

- no new automation behavior;
- no major data-model additions;
- no queue/HR feature expansion outside interaction polish.

## Acceptance Criteria

- workflow-heavy surfaces are easier to scan and operate repeatedly;
- action states and transitions are clearer;
- the views feel less like developer scaffolding and more like a usable daily tool;
- focused tests are updated where structure or labels change.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
