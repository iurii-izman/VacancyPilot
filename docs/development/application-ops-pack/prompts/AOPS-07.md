# Prompt AOPS-07 — Application Engine V4 Package and Health

Implement only epic `AOPS-07` in the open VacancyPilot repository root.

Follow `../ZED_SESSION_START.md`: work only on synchronized `main`; do not
create a branch or PR, and leave commit/push to the Codex review gate.

## Goal

Load and validate a versioned Application Engine V4 package, build a
deterministic knowledge index, expose Engine Health, and block only V4 analysis
when invalid. Do not call an LLM yet and do not edit V4 facts/rules.

## Read first

1. `AGENTS.md`
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 1.2, 4.4, 9.1–9.2,
   12.8, 20.4 and risk R5
3. ADR-005 engine package privacy
4. Engine-related API/data contracts
5. The documented local package-source contract. A real source path is
   optional and must be supplied explicitly through
   `VACANCYPILOT_V4_PACKAGE_SOURCE`; never hardcode a private workspace path.

## Privacy precondition

Before copying any real V4 payload, read ADR-005 and check the user-approved
repository privacy decision.

Default behavior:

- do not commit real candidate knowledge;
- add `.gitignore` coverage for the installed real engine payload;
- commit loader code, manifest/checksum schema, installer/import script and
  synthetic fixtures only.

If the user explicitly approved vendoring into a private repository, record
that decision and verify no remote/backup is public. Otherwise never stage real
candidate files.

## Required work

Implement an engine package layout/loader with:

- configurable local package root;
- exactly ten canonical active filenames;
- separate Project Instructions;
- `manifest.json` schema with engine version, file versions, statuses,
  expected hashes and package schema version;
- `checksums.sha256`;
- strict safe-path handling;
- byte/hash validation before parsing;
- UTF-8/frontmatter parsing;
- active/deployment version validation;
- unique IDs for claims/cases/portfolio records;
- manifest/current pointer consistency;
- authority graph overlap/error detection;
- package aggregate/input hash;
- immutable in-memory loaded package object;
- no silent fallback to a partially valid package.

Create a deterministic knowledge index sufficient for later retrieval:

- claim/evidence IDs and evidence levels;
- commercial case IDs;
- portfolio IDs with boundaries;
- skill calibration;
- targeting/hard-gate/cap rule references;
- voice/regression metadata;
- no generated text treated as candidate evidence.

Add:

```text
GET /api/v1/engine/status
```

Return sanitized health fields:

- installed/configured;
- valid/invalid;
- engine/package version;
- active count;
- aggregate hash;
- claims/case/portfolio counts;
- validation error codes and safe filenames;
- last successful load time.

Do not return candidate text through health.

Add an explicit local install/verify command that copies from a supplied path
only after user action, validates before activation, and never reconstructs
missing sources.

## Failure behavior

- invalid/missing engine keeps health, intake, triage, pipeline and export
  working;
- Full V4 endpoints return a precise unavailable error;
- previous valid package may remain active only if ADR/contract explicitly
  defines atomic activation and the failed candidate package is separate;
- never rewrite or “repair” V4 source automatically.

## Tests

Commit synthetic packages covering:

- valid minimal fixture;
- missing file;
- extra/suffixed active file;
- hash mismatch;
- unsafe path;
- duplicate ID;
- bad frontmatter/version;
- authority overlap;
- Project Instructions over limit;
- atomic failed installation;
- health redaction/no candidate text;
- actual canonical package verification as an optional local/manual test only,
  with no private payload snapshot.

## Non-goals

- no provider API;
- no prompt compiler;
- no full analysis/score/letter;
- no real candidate data in tests;
- no edits outside the open repository;
- no invented missing sources.

## Acceptance criteria

- valid fixture loads deterministically;
- invalid fixture blocks only V4 analysis capability;
- real package remains local/private by default;
- Engine Health shows actionable safe errors;
- loader/index behavior is fully testable offline;
- no V4 fact/rule/version changed.

## Validation

Apply the focused per-epic policy in `ZED_SESSION_START.md`. The broader
commands listed below are release-gate inventory, not mandatory for this epic;
run only directly affected tests/static/contract checks and `git diff --check`,
then report the rest as `DEFERRED_TO_RELEASE_GATE`.

Release-gate command inventory (do not run for this epic):

```powershell
pnpm verify:companion
pnpm verify
pnpm test:release
git diff --check
```

If the canonical local artifact is available, run the local verifier and report
counts/hashes only, never private content.

## Handoff

Do not commit/push. Explicitly list whether any real engine payload is present
and whether Git sees it.

Expected reviewed commit message:

```text
feat: add private-safe V4 engine package loader
```
