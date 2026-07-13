# ITER-034: Search Result Badges

Epic: EPIC-20
Commit: `feat: add search result badges`

## Goal

Render lightweight triage badges onto HH search cards using local data and visible-card parsing only.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `5.5`, `Phase 2`, `17.6`
- current repository state after `ITER-033`

## Scope

- attach compact search badges to parsed search cards;
- show status/score/work-mode style signals from local and visible-card data;
- keep DOM footprint small and styling unobtrusive.

## Non-Goals

- no quick save/reject yet;
- no heavy React subtree per card;
- no queue/dashboard changes yet.

## Acceptance Criteria

- badges render on supported search cards;
- HH search layout remains usable and visually stable;
- no hidden network calls are introduced.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
