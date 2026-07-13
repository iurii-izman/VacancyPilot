# ITER-041: Kanban Queue And Manual Stage Actions

Epic: EPIC-25
Commit: `feat: add kanban queue workflow`

## Goal

Upgrade the queue from a filtered list into a kanban-style manual workflow surface.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `Phase 3`, `24.3`
- current repository state after `ITER-040`

## Scope

- kanban queue layout by stage;
- manual stage actions from the dashboard;
- better queue filters and review ergonomics;
- local duplicate / greylist signals carried into the board;
- tests for queue transitions and stage rendering.

## Non-Goals

- no auto-processing queue;
- no browser background tabs;
- no HR communication features;
- no webhook delivery.

## Acceptance Criteria

- the queue can be used as a practical local pipeline;
- status changes remain explicit user actions;
- board behavior is covered by focused tests.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
