# ITER-037: Queue Task List And Duplicate Detection

Epic: EPIC-21
Commit: `feat: add queue task list`

## Goal

Turn search-triaged vacancies into a local task-list workflow and introduce practical duplicate detection.

## Inputs

- `docs/Техническое заданиеV.1.md` section `24.2`
- current repository state after `ITER-036`

## Scope

- local queue/task-list model and UI;
- queue-oriented grouping/filtering of saved vacancies;
- duplicate detection heuristics using local vacancy data.

## Non-Goals

- no auto-processing queue;
- no guided apply;
- no HR hub features.

## Acceptance Criteria

- user can see and manage a local queue of triaged vacancies;
- duplicate candidates are identified clearly enough for review;
- workflow stays local-first and manual.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
