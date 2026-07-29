# AOPS-17 — P0 End-to-End QA and Release 0.2.0

You are closing the P0 Application Ops milestone. This is a verification-and-release epic, not permission to redesign or expand the product.

## Mandatory session contract

Read and follow `../ZED_SESSION_START.md` from this prompt pack before changing anything. Do not commit, push, switch branches, reset, clean, move tags, or rewrite unrelated files.

## Goal

Prove the integrated P0 flow with reproducible artifacts, close only evidence-backed gaps, and prepare release `0.2.0` without declaring PASS for unexecuted tests. Preserve Application Engine V4 and the immutable `v4.0.0` tag.

## Read first

1. Repository `AGENTS.md` and all applicable nested instructions.
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md`.
3. AOPS-00 contracts/traceability/ADRs and every AOPS-01 through AOPS-16 handoff.
4. Existing release, production-pilot, browser QA, build, and packaging documentation.
5. `package.json`, companion project metadata, extension manifest, version sources, CI definitions, and current Git status/tags.

If any prerequisite epic lacks acceptance evidence, if the wrong branch/baseline is checked out, or if unrelated dirty changes overlap release files, report `BLOCKED`. Do not mask the issue with cleanup, resets, or broad rewrites.

## Scope

1. Build a P0 acceptance matrix mapping every MUST/P0 criterion in the source specification to:
   - implementation file(s);
   - automated test(s);
   - manual test procedure where genuinely necessary;
   - artifact path;
   - status `PASS`, `FAIL`, `NOT RUN`, or `BLOCKED`.
2. Add/curate at least 25 sanitized, synthetic or licensed fixtures that exercise:
   - vacancy intake variants and malformed/partial data;
   - Stage A and full V4 outcomes;
   - letter/manual-bridge/diff lifecycle;
   - pipeline, follow-up, interview, analytics, backup/restore.
3. Cover at least six representative HH vacancy/input variants and five OAuth/error/status variants without embedding real user tokens, resumes, application letters, cookies, or personal data.
4. Add an integrated automated path for:
   - extension pairing and companion health;
   - intake/import and idempotent sync;
   - triage and full analysis;
   - letter finalization;
   - explicit “applied” recording and pipeline event;
   - follow-up/interview/analytics;
   - backup preview/restore on synthetic data.
5. Execute browser QA for unpacked Chromium extension behavior in Chrome and Edge where the local environment supports them:
   - popup/dashboard;
   - permissions and offline/companion-unavailable states;
   - no unintended network or HH write;
   - no console errors in tested flows;
   - screenshots/logs with sensitive data removed.
6. Verify clean install/upgrade behavior, DB migrations, extension build, companion startup, packaged artifacts, and rollback/recovery documentation.
7. Align product/package/version sources to `0.2.0` only after the acceptance matrix is green for required local gates.
8. Prepare release notes, known limitations, install/run instructions, verification report, and artifact checksum manifest.

Only fix narrow, proven integration defects discovered during this epic. If a fix changes V4 runtime semantics, stop, preserve the failing evidence, and report `BLOCKED` with the smallest reproducible case.

## Hard constraints

- Do not move, recreate, force-update, or delete tag `v4.0.0`.
- Do not create a new Git tag, commit, push, publish, or open a release.
- Do not change Application Engine V4 runtime behavior without a proven defect and an explicit separately reviewed decision.
- Do not perform automated HH applications, clicks, form writes, messages, follow-ups, or negotiations.
- Do not treat mocked OAuth/provider/HH checks as live checks.
- Do not call a test `PASS` unless it was executed and its evidence is retained.
- Do not include real candidate knowledge, personal data, credentials, or proprietary engine content in fixtures or artifacts.

## Validation

At minimum, run and record:

- repository-required lint/type/unit/build verification;
- release and production-pilot checks already defined by the repo;
- companion formatting, lint, type, unit, migration, and security checks;
- OpenAPI/TypeScript contract drift check;
- full integration/E2E suite;
- extension packaging/install smoke;
- database backup/restore smoke;
- offline mode and companion-unavailable smoke;
- programmatic forbidden-network/forbidden-write assertions where available;
- `git diff --check`;
- verification that the `v4.0.0` tag still has the exact preflight object ID,
  or remains `ABSENT` if it was absent at preflight.

For manual Chrome/Edge or live HH/OAuth/provider gates, store honest evidence and status. A missing required gate means the milestone is not PASS; use `NOT RUN`/`BLOCKED`.

## Acceptance criteria

- Every P0 acceptance criterion is represented in the matrix with traceable evidence.
- Required automated checks pass from documented commands on a reproducible local setup.
- Chrome and Edge states are honestly recorded with artifacts, or release remains blocked.
- At least 25 sanitized fixtures, six HH variants, and five OAuth/error variants are exercised and inventoried.
- Clean install, migration/upgrade, offline behavior, backup/restore, and packaged startup have evidence.
- No automated apply or prohibited external write is possible in the verified path.
- `v4.0.0` has the exact same state and object as at preflight; an absent tag
  remains absent.
- Release `0.2.0` documentation/artifacts are prepared, but no commit/tag/push/publication occurs.

## Handoff

Return:

1. `STATUS: READY_FOR_CODEX_REVIEW`, `NEEDS_FIX`, or `BLOCKED`;
2. overall release verdict separate from implementation status;
3. acceptance matrix path and counts by `PASS`/`FAIL`/`NOT RUN`/`BLOCKED`;
4. exact commands, exit codes, durations, and artifact paths;
5. fixture inventory counts;
6. Chrome/Edge and live-integration evidence status;
7. narrow defects fixed and any unresolved defects;
8. version/artifact/checksum summary;
9. before/after `v4.0.0` state (`object ID` or `ABSENT`);
10. explicit confirmation that nothing was committed, tagged, pushed, or published.

Do not commit or push. Do not declare release PASS unless every required gate has actual evidence.
