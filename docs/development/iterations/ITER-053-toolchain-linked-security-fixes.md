# ITER-053: Toolchain-Linked Security Fixes

Epic: EPIC-28
Commit: `fix: resolve toolchain linked security alerts`

## Goal

Resolve the remaining high alerts that are attached to the build/runtime toolchain and cannot be closed by simple local overrides alone.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `3.8`, `20`, `22.7`, `23.4`
- current repository state after `ITER-052`
- triage output from `ITER-051`

## Scope

- coordinated dependency moves required for the alert families classified as toolchain-linked;
- narrowly required config/test adjustments caused by those toolchain updates;
- re-verification that generated extension output stays within current manifest/safety boundaries.

## Non-Goals

- no unrelated feature work;
- no direct HH automation changes;
- no broad cleanup refactors without alert-driven need;
- no reopening of deferred n8n/Labs scope.

## Acceptance Criteria

- toolchain-linked alert families from `ITER-051` are either fixed or reduced with explicit residual rationale;
- build, release-safety, and manifest checks remain green;
- the extension keeps current security and permission posture.

## Validation

```text
pnpm audit
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
