# ITER-052: Safe Transitive Security Fixes

Epic: EPIC-28
Commit: `fix: close safe transitive security alerts`

## Goal

Close the remaining alerts that can be fixed safely with targeted overrides or minimal version updates that do not require broader toolchain migration.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `3.8`, `20.8`, `22.7`
- current repository state after `ITER-051`
- triage output from `ITER-051`

## Scope

- add or adjust narrow `pnpm` overrides when appropriate;
- make minimal package moves for the alert families marked safe in `ITER-051`;
- update lockfile and any narrowly required validation expectations.

## Non-Goals

- no major framework jumps;
- no broad WXT/Vite/toolchain rewrite beyond the alert families marked safe;
- no product code churn unrelated to the concrete alert fixes;
- no new permissions or manifest changes.

## Acceptance Criteria

- all alerts classified as safe local fixes in `ITER-051` are resolved or explicitly shown impossible on the current graph;
- validation remains green after the changes;
- no read-first / local-first product boundary is weakened.

## Validation

```text
pnpm audit
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
