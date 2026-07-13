# ITER-048: WXT Stack Refresh And Dependency Baseline

Epic: EPIC-27
Commit: `chore: refresh wxt dependency baseline`

## Goal

Replace the stale grouped Dependabot dependency batch with a deliberate WXT-stack refresh that keeps the extension on a stable baseline before later framework/toolchain changes.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `3.8`, `20.8`, `22.7`, `23.4`
- current repository state after merged workflow/security maintenance
- Dependabot PR `#4` triage outcome

## Scope

- evaluate and update the tightly coupled extension-tooling set around `wxt`, `@wxt-dev/module-react`, and directly related lockfile changes;
- keep the runtime product behavior unchanged;
- refresh dependency baseline only where compatibility can be verified immediately;
- update tests/config only if required by the WXT-stack refresh itself.

## Non-Goals

- no TypeScript 6 migration yet;
- no React major decision yet;
- no Labs/product feature work;
- no permission expansion.

## Acceptance Criteria

- the stale grouped dependency batch is replaced by a coherent, reviewed WXT-stack update;
- repository validation stays green after the refresh;
- no HH automation boundaries change.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
