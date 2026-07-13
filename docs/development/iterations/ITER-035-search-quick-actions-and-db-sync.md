# ITER-035: Search Quick Actions And DB Sync

Epic: EPIC-20
Commit: `feat: add search quick actions`

## Goal

Enable local quick save/reject actions directly from search cards without opening vacancy pages or mutating HH state.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `5.5`, `Phase 2`
- current repository state after `ITER-034`

## Scope

- local quick save/reject controls on search cards;
- DB synchronization with existing vacancy tracker/status logic;
- visual refresh of search badges after local actions.

## Non-Goals

- no HH form interaction;
- no background opening of vacancy pages;
- no queue/dashboard changes yet.

## Acceptance Criteria

- quick actions update only local DB/state;
- badge state refreshes after local action;
- no forbidden HH automation is introduced.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
