# ITER-038: Company Greylist And Phase 2 Dashboard

Epic: EPIC-21
Commit: `feat: add company greylist workflow`

## Goal

Add company greylist support and strengthen dashboard workflows around Phase 2 triage and queue management.

## Inputs

- `docs/Техническое заданиеV.1.md` section `24.2`
- current repository state after `ITER-037`

## Scope

- company greylist controls and persistence;
- stronger dashboard views/filters for triage and queue states;
- UI support for review of duplicates and company-level triage decisions.

## Non-Goals

- no multi-site work;
- no public-release packaging;
- no guided apply labs.

## Acceptance Criteria

- dashboard meaningfully supports repeated Phase 2 triage work;
- company greylist can influence local triage signals;
- no unsafe HH automation is introduced.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
