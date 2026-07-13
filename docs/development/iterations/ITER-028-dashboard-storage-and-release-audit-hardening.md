# ITER-028: Dashboard Storage And Release Audit Hardening

Epic: EPIC-14
Commit: `fix: correct dashboard storage listener and add release audit scripts`

## Goal

Close the confirmed release-blocking runtime/storage issue and make release-audit checks fail loudly in release mode instead of silently passing.

## Inputs

- `docs/development/ITER-027-triage-report.md`
- `docs/vacancypilot_deep_repo_audit_b9d114c_2026-06-20.md`
- current repository state after `ITER-026`

## Scope

- replace `chrome.storage.local.onChanged` with `chrome.storage.onChanged` in dashboard refresh logic;
- filter the listener to `areaName === "local"`;
- add a static/safety test that forbids `chrome.storage.local.onChanged`;
- add `verify` and `test:release` scripts;
- make generated manifest and generated bundle safety tests hard-fail in release-audit mode when build output is missing.

## Non-Goals

- no passive HH status integration yet;
- no side panel context redesign yet;
- no broad dashboard architecture rewrite;
- no manual browser rerun execution in this iteration.

## Acceptance Criteria

- dashboard refresh listener uses the correct Chrome API;
- release audits fail in release mode if `.output` is missing;
- `package.json` exposes a clear `verify` and `test:release` path;
- existing checks stay green.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
