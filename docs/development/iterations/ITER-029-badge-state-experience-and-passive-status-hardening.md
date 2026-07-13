# ITER-029: Badge State, Experience, And Passive Status Hardening

Epic: EPIC-14
Commit: `fix: dedup badge helpers, add experience parser, tighten passive status regex`

## Goal

Reduce duplicated badge-state logic, improve vacancy data quality, and remove the confirmed passive-status false-positive risk.

## Inputs

- `docs/development/ITER-027-triage-report.md`
- current repository state after `ITER-028`

## Scope

- extract shared badge-state helpers into a single service module;
- refactor popup, score recompute, and delete-all flows to use the shared helper;
- parse `experienceRaw` into `experienceMinYears` in tracker;
- support the confirmed RU/EN experience patterns from triage;
- tighten passive-status regexes to avoid matching CTA text like `Откликнуться`;
- add focused tests/fixtures for passive-status false positives and positives.

## Non-Goals

- no passive-status UI integration yet;
- no side panel context redesign yet;
- no broader tracker model redesign beyond the confirmed parsing fix.

## Acceptance Criteria

- badge-state helpers are centralized and reused;
- `experienceMinYears` is populated for supported patterns;
- passive-status parsing no longer marks CTA-only text as applied;
- new tests cover the confirmed regression cases.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
