# AOPS-18 — Conditional P1 Operational Enhancements

This epic is conditional. Do not start it until AOPS-17 has an independently reviewed P0 PASS and the owner has explicitly approved the P1 selection.

## Mandatory session contract

Read and follow `../ZED_SESSION_START.md` before changing anything. Work only
on synchronized `main`; do not create/switch branches or open a PR. Do not
commit or push; leave that to the Codex review gate after PASS. Do not tag or
publish without a separate explicit owner action.

## Goal

Implement only the explicitly approved P1 items from the MVP specification, preserving local-first behavior, user control, and all P0 security boundaries.

## Activation gate

Before editing, require all of the following:

- AOPS-17 acceptance matrix has no required `FAIL`, `NOT RUN`, or `BLOCKED`;
- Codex review verdict is P0 `PASS`;
- the owner has created or supplied a short P1 selection document listing approved item IDs;
- current Git status and baseline are safe for the selected files.

If any condition is absent, return `BLOCKED` without changes.

## Read first

1. Repository `AGENTS.md` and applicable nested instructions.
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md`, especially P1/non-goals.
3. AOPS-00 contracts/ADRs and the reviewed AOPS-17 report.
4. The owner-approved P1 selection document.
5. Existing scheduler, notifications, capability, event, experiment, and filtering code.

## Eligible P1 items

Use stable selection IDs and implement only selected items:

- `P1-DAILY-SYNC`: opt-in local daily HH synchronization with visible last/next run, pause, manual run, bounded retry, and no background write.
- `P1-NOTIFICATIONS`: opt-in local notifications for sync errors and due follow-ups; notifications are informational and never send a message or apply.
- `P1-DETAILED-MESSAGES`: read-only detailed message/status timeline only when the official HH API capability is verified and available; otherwise show an honest unavailable state.
- `P1-EXPERIMENTS`: explicit experiment metadata and comparison views without automatic policy changes or causal claims.
- `P1-FILTERS`: saved advanced operational filters consistent with the source specification.

The manual ChatGPT bridge is already P0 in AOPS-09; extend it only if the approved selection identifies a specific missing P1 acceptance criterion.

Runtime DeepSeek integration is not part of the MVP’s listed P1 scope. Using
DeepSeek through Claude as the coding executor does not authorize adding it as
a product provider. A product-level DeepSeek provider requires a separate
owner decision, ADR, security review, schema compatibility proof, and bounded
epic.

## Cross-cutting requirements

- Every background action is opt-in, visible, pausable, and auditable.
- Reuse companion scheduling and existing extension alarms/notifications; do not add a cloud scheduler.
- Respect pairing, local auth, redaction, rate limits, backoff, offline mode, and capability checks.
- Persist scheduler/notification/experiment state with schema migrations and typed contracts.
- Do not weaken MV3 permissions or introduce broad host permissions.
- Add UI states for disabled, unavailable, running, last success, retryable error, and paused.
- Add deterministic clock/network abstractions so tests do not wait in real time or call live services.

## Hard constraints

- No auto-apply, auto-click, form write, automated message, follow-up send, negotiation, CAPTCHA/session/cookie capture, hidden HH fetch, cloud telemetry, or silent provider call.
- No invented or reverse-engineered HH endpoints.
- No V4 runtime scoring/policy changes.
- Do not move or modify `v4.0.0`.
- Do not implement unselected P1 items “because they are nearby.”

## Required tests

For every selected item, add:

- disabled-by-default and explicit opt-in tests;
- pause/resume/manual-run behavior where applicable;
- deterministic scheduling or notification behavior;
- offline, 401/403, 429, 5xx, timeout, and capability-unavailable states as relevant;
- idempotency and duplicate suppression;
- no prohibited write/network assertions;
- migration and API/client contract coverage;
- accessible UI state coverage;
- proof that unselected items were not activated.

Any live HH verification must be separately opt-in and reported as live, mocked, `NOT RUN`, or `BLOCKED`.

## Acceptance criteria

- Only owner-selected P1 items are implemented.
- P0 behavior and all security/privacy boundaries remain green.
- Background work is opt-in, observable, bounded, and never performs external writes.
- Official capability availability is represented honestly.
- Tests prove scheduling/idempotency/permission behavior without live waits.
- Full repository and companion verification passes.
- V4 runtime is unchanged and `v4.0.0` has the same object ID or remains
  `ABSENT`, matching preflight.

## Validation

Apply the focused per-epic policy in `ZED_SESSION_START.md`. The broader
commands listed below are release-gate inventory, not mandatory for this epic;
run only directly affected tests/static/contract checks and `git diff --check`,
then report the rest as `DEFERRED_TO_RELEASE_GATE`.

Run selected-feature tests, directly affected static/contract checks, and tag
immutability verification. Defer the next full P0 regression to its release
gate. Record exact commands and exit codes; do not infer PASS from inspection
or mocked tests.

## Handoff

Return:

1. `STATUS: READY_FOR_CODEX_REVIEW`, `NEEDS_FIX`, or `BLOCKED`;
2. approved selection document and selected IDs;
3. implementation summary/files changed per selected item;
4. proof that other P1 items remained inactive;
5. tests and exact validation results;
6. live/mock/`NOT RUN` integration status;
7. risks and rollback notes;
8. before/after `v4.0.0` state (`object ID` or `ABSENT`);
9. explicit confirmation that V4 runtime, tags, commits, pushes, and releases were untouched.

Do not commit or push.
