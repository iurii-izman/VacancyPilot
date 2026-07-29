# AOPS-16 — Backup, Restore, Privacy, and Debug Bundle

You are implementing one bounded epic in the existing VacancyPilot repository.

## Mandatory session contract

Read and follow `../ZED_SESSION_START.md` from this prompt pack before changing anything. Do not commit, push, switch branches, reset, clean, or rewrite unrelated files.

## Goal

Make local Application Ops data recoverable and supportable through safe backup/restore, explicit export/delete operations, privacy documentation, and a sanitized debug bundle. No secret may be silently exported or restored.

## Read first

1. Repository `AGENTS.md` and applicable nested instructions.
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md`.
3. AOPS-00 contracts/ADRs and the handoff from AOPS-15.
4. Companion persistence, migrations, pairing/auth, engine loader, extension storage, export, and diagnostics code.
5. Existing security/privacy documentation and tests.

If earlier AOPS acceptance evidence is missing or unrelated dirty changes overlap this epic, stop and report `BLOCKED`; do not clean or reset them.

## Scope

Implement:

- a consistent SQLite backup using SQLite-supported backup semantics rather than a blind copy of a live database;
- a versioned backup manifest with schema version, app version, creation time, entry list, sizes, and cryptographic checksums;
- explicit inclusion rules for database, non-secret configuration, engine package references, and optional user-selected local artifacts;
- default exclusion of OAuth tokens, provider API keys, pairing secrets, keyring material, browser cookies, sessions, and raw logs;
- restore preview that validates the archive without mutating current state;
- explicit-confirmation restore with compatibility checks, pre-restore safety backup, atomic replacement/migration where feasible, and rollback on failure;
- path traversal, symlink, archive-bomb/size-limit, duplicate-entry, checksum, and malformed-manifest defenses;
- JSON/CSV user-data export matching documented schemas;
- scoped deletion and full local-data deletion with clear previews and confirmations;
- a sanitized debug bundle containing versions, feature/capability state, redacted structured logs, migration/health summaries, and no application text or secrets by default;
- privacy/security documentation describing local storage, every network path, retention, export, deletion, backup contents, and residual risks;
- extension UI entry points that surface progress, success, failure, and recovery guidance.

Reuse established APIs and UI surfaces. Keep restore and destructive operations behind explicit user actions.

## Hard constraints

- Never put keyring values, API keys, OAuth refresh/access tokens, pairing secrets, cookies, sessions, authorization headers, or plaintext credentials in an archive or debug bundle.
- Never automatically restore secrets.
- Never overwrite the active database before successful preview and confirmation.
- Never extract an untrusted path outside a fresh, validated temporary directory.
- Do not silently delete user data.
- Do not add cloud backup, telemetry, or analytics upload.
- Do not modify V4 runtime policy or the `v4.0.0` tag.

## Required tests

Add deterministic tests for at least:

- backup created while the database is active and then integrity-checked;
- manifest/checksum validation;
- archive schema/app compatibility;
- preview causes no mutation;
- successful restore and post-restore migration/integrity checks;
- failed restore rolls back to the original database;
- tampered checksum;
- path traversal and unsafe link entries;
- oversized/decompression-ratio-limited archive;
- duplicate/malformed entries;
- explicit secret and authorization-header redaction;
- debug-bundle default content exclusions;
- JSON/CSV export schemas;
- scoped and full-delete confirmation/cancellation paths;
- Windows-safe file replacement and locked-file failure messaging where supported.

Use only synthetic data and secrets designed for tests.

## Acceptance criteria

- A backup can be created, inspected, restored, and verified using documented steps.
- Restore preview is non-mutating; restore failure is recoverable.
- Security tests prove secrets and sensitive headers are absent, not merely visually hidden.
- Debug bundles are useful for support while excluding application content and credentials by default.
- Export/delete/privacy behavior matches the MVP source and UI wording.
- No cloud dependency, HH write, or runtime V4 change was introduced.
- All relevant tests and repository checks actually pass.

## Validation

Run narrow backup/security tests first, then the repository-required verification suite and companion checks. Inspect at least one generated synthetic archive and debug bundle programmatically and record their entry lists. Report exact commands, exit codes, and results. Mark environment-specific checks `NOT RUN` or `BLOCKED` instead of claiming success.

## Handoff

Return:

1. `STATUS: READY_FOR_CODEX_REVIEW`, `NEEDS_FIX`, or `BLOCKED`;
2. implementation summary and files changed;
3. backup/restore format and compatibility rules;
4. secret and sensitive-data exclusion evidence;
5. tests and exact validation results;
6. recovery procedure and remaining risks;
7. any `NOT RUN` checks;
8. explicit confirmation that V4 runtime and `v4.0.0` were untouched.

Do not commit or push.
