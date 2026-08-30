# AOPS-09 acceptance report

Status: PASS
Date: 2026-08-30

## Implemented contract

- Append-oriented states: `generated`/`imported` → `user_draft` (EDITED) → `final` → explicit `sent`.
- A generated/imported projection is set once and is not replaced by an edited or final body.
- Final and sent use the same deterministic V4 letter validation used by generated/imported letters.
- A sent snapshot requires explicit user action and subsequent writes are rejected by the repository invariant.
- Generated-to-sent comparison uses deterministic token/line diff metrics and a unified diff; it makes no quality claim.
- The manual ChatGPT bridge creates a stable copy-ready request from vacancy data, then imports only a locally parsed/validated response. No API key, private package content, or score/evidence promotion crosses the bridge.
- CoverLetterStudio remains the single editor. It records lifecycle labels/history, exposes a separate `Save as actually sent` control, and keeps Copy as a clipboard-only action.

## Dogfood boundary

Synthetic companion tests exercise bridge construction, malformed import rejection, lifecycle append-only behavior, sent immutability, and deterministic diff. A real ChatGPT UI was not automated or invoked: `MANUAL_CHATGPT_UI_NOT_EXECUTED` is intentional and non-blocking because this workflow is designed for manual copy/paste.

## Gate evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Companion format/lint/mypy/pytest/OpenAPI | PASS | 76 formatted files, 46 strict-mypy source files, 327 pytest tests; checked-in OpenAPI is current. |
| Extension typecheck/lint/test | PASS | TypeScript and ESLint passed; 78 Vitest files / 2,808 tests passed. |
| Production build | PASS | Chrome MV3 build completed. |
| Release safety | PASS | 10 files / 1,364 tests passed, including HH form/fetch safety checks. |
| Private V4 regressions | PASS | 15 regression cases; errors 0, warnings 0. |
| Private V4 smoke | PASS | 6/6 fixtures. |
| Diff and migration | PASS | Deterministic diff tests plus Alembic upgrade/idempotence/downgrade-roundtrip tests passed. |
| Private tracked data / whitespace | PASS | No private workspace path is tracked; `git diff --check` passed. |

Verdict: `AOPS09_PASS` subject only to the required local no-ff merge and its post-merge critical gates.
