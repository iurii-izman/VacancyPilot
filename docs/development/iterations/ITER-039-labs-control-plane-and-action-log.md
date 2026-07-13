# ITER-039: Labs Control Plane And Action Log

Epic: EPIC-22
Commit: `feat: add labs safety controls`

## Goal

Create the safety envelope for future Labs features before adding guided-apply UI.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `3.7`, `19.7`, `23.2`, `24.3`
- current repository state after `ITER-038`

## Scope

- Labs master toggle and guided-apply toggle;
- kill switch that disables all Labs features;
- daily action limit model and settings;
- local Labs action log model and UI entry point;
- tests for default-off behavior and gating.

## Non-Goals

- no guided-apply field workflow yet;
- no webhook delivery;
- no HR features;
- no new broad permissions.

## Acceptance Criteria

- Labs are off by default on a clean install;
- a single kill switch can suppress Labs features;
- action log and limits exist locally for future guided-apply tracking.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
