# ITER-049: TypeScript 6 Migration

Epic: EPIC-27
Commit: `chore: migrate to typescript 6`

## Goal

Perform a real TypeScript 6 migration pass instead of treating the Dependabot major bump as a blind lockfile update.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `22.7`, `23.4`
- current repository state after `ITER-048`
- Dependabot PR `#6` triage outcome and its failing CI log

## Scope

- upgrade TypeScript to 6.x;
- fix or explicitly modernize `tsconfig` deprecation handling;
- adjust repository code/config only where TypeScript 6 requires it;
- keep validation commands green after the migration.

## Non-Goals

- no React stack move yet;
- no WXT broad rewrite beyond what `ITER-048` already established;
- no unrelated refactors just to satisfy stylistic preferences;
- no product-scope feature work.

## Acceptance Criteria

- `pnpm typecheck` passes on TypeScript 6;
- lint/test/build/release-safety continue to pass;
- migration changes are limited to the TS6 compatibility surface.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
