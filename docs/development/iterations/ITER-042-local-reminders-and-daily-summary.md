# ITER-042: Local Reminders And Daily Summary

Epic: EPIC-25
Commit: `feat: add workflow reminders and summary`

## Goal

Add local reminder and summary surfaces so the user can work the queue repeatedly without external automation.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `Phase 3`, `24.3`
- current repository state after `ITER-041`

## Scope

- follow-up reminder model derived from local jobs/applications;
- daily summary surface in dashboard/popup where appropriate;
- local workflow event summaries;
- tests for reminder eligibility and summary aggregation.

## Non-Goals

- no webhook sending;
- no background polling of HH;
- no HR chat ingestion;
- no multi-site work.

## Acceptance Criteria

- the user can see what needs follow-up today from local state only;
- summaries stay explainable and deterministic;
- no external delivery path is required for the feature to be useful.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
