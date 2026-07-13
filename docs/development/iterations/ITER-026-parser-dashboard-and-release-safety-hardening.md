# ITER-026: Parser, Dashboard, And Release Safety Hardening

Epic: EPIC-13
Commit: `fix: harden parser and release safety`

## Goal

Improve HH parsing reliability, reduce dashboard staleness, and add stronger release-safety validation against generated artifacts.

## Scope

- tighten `HHAdapter.matchUrl()` hostname checks;
- clarify `descriptionHtml` vs text handling;
- improve work mode extraction heuristics;
- add passive visible-status extraction skeleton where safe and practical;
- expand HH fixtures with a first hardening batch;
- add dashboard vacancy refresh mechanism;
- audit generated manifest/build output instead of trusting config alone;
- strengthen bundle-level release-safety checks where practical.

## Non-Goals

- no scoring synonym dictionary;
- no full localization pass;
- no public-store asset work;
- no n8n work.

## Acceptance Criteria

- host matching accepts only `hh.ru` and `*.hh.ru`;
- parser behavior is clearer and better covered by fixtures;
- dashboard vacancy view can refresh after external runtime changes;
- generated manifest is validated in automated checks;
- all hardening changes pass the normal validation suite.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
