# Fix 5 — Engineering Hygiene and Verification

Status: complete on `hotfix/hh-vacancy-hydration-v4-card` (2026-09-10).
This document records the repository-local contracts added by Fix 5. It does
not promote VacancyPilot to public-release status and does not replace human
visual or live-provider acceptance.

## Scope and boundaries

Fix 5 is a release-engineering pass only. It preserves the Fix 1–4 runtime
boundaries: HH browser access remains read-only, no HH form or auto-apply
automation is added, Full V4 and provider calls remain opt-in, and no
provider/HH live verification is run by the repository quality gate.

The exact baseline required before this pass was commit
`84368344aebf8af70b614e8d919be5db99326669` (`fix: harden data lifecycle and
local security boundaries`) on branch `hotfix/hh-vacancy-hydration-v4-card`
with a clean worktree. No push, merge, reset, rebase, or live provider/HH
operation is part of Fix 5.

## OpenAPI → TypeScript contract

[`shared/contracts/openapi.json`](../../shared/contracts/openapi.json) remains
the canonical FastAPI-generated contract under
[ADR-003](application-ops/adr/ADR-003-openapi-contract-source.md).

- `pnpm contracts:generate` deterministically writes
  `shared/contracts/generated/openapi-types.ts` using the pinned
  `openapi-typescript` tool.
- `pnpm contracts:check` first checks FastAPI against the JSON snapshot, runs
  generation twice, checks generated safety markers, and compares the result
  with the tracked file without mutating it.
- `src/adapters/companion/wire-types.ts` maps generated schemas and operation
  IDs into the stable adapter import names. UI/read-model refinements are
  explicit and limited to endpoints whose current server schema is an open
  JSON object.
- `contract-compile-checks.ts` keeps critical Ops, Full V4, HH sync and
  follow-up request/response links in the TypeScript compiler surface.
- The generated module is type-only and is asserted absent from production
  runtime output; no private engine, candidate evidence, database, secret or
  local path is allowed in generated output.

Hand-maintained duplicate wire interfaces are not an accepted contract
source. Domain models and deliberately documented UI refinements remain
separate from generated transport shapes.

## Dexie migration coverage

The current schema is v7. `src/db/schema.ts` contains an explicit independent
coverage registry for `v0 → v1` through `v6 → v7`; `VacancyDatabase` and the
bookkeeping module fail closed if a future schema version lacks an entry.
Each schema-only transition has an explicit Dexie upgrade callback.

Coverage includes actual fake-IndexedDB checks for:

- v1 → v7 domain row, key and compound-index preservation;
- v6 → v7 Ops outbox/cache/meta preservation and v7 coordination-store
  creation/use; and
- current v7 open/reopen without changing a sentinel row.

No migration deletes user data or reaches Companion SQLite, keyring material,
the private engine, HH data, or provider data.

## CI and workflow policy

`pnpm verify:all` is the single repository quality gate. It includes workflow
static checks, OpenAPI drift/generation checks, frontend typecheck/lint/tests,
production build, release package/privacy checks, release safety tests, and
the complete Companion format/lint/mypy/pytest/OpenAPI gate.

All remote GitHub Actions are pinned to verified full commit SHAs with
semantic version comments. `scripts/check-workflows.py` rejects tags,
short/unverified SHAs, missing comments, broad write permissions,
`pull_request_target`, secret-print patterns, a non-blocking dependency
review, and a CI workflow that omits `pnpm verify:all`. Dependency Review now
blocks high severity findings (and therefore critical findings); Sonar remains
advisory because its external token/project configuration is not a local
repository contract.

Required branch-protection settings are an external GitHub administration
check. Fix 5 does not claim that the `quality-gate` job has been configured as
a required status check.

## Dependency dispositions

The narrow workspace overrides patch the current transitive build-tool
advisories for `postcss`, `nanoid`, `browserslist`, and
`baseline-browser-mapping` without a WXT/Vite/Vitest major upgrade. The
production audit is clean. The remaining audit advisories are two moderate,
dev-only Vitest 3.2.6 / `@vitest/mocker` path-traversal advisories; the
patched line is Vitest 4.1.11+, which is a major toolchain change and is not
safe to introduce in this frozen pass. Revisit after a compatible WXT/Vite
test-toolchain upgrade; do not use `pnpm audit fix --force`.

The Companion test suite still emits the upstream Starlette warning that
`httpx` use through `starlette.testclient` is deprecated. It is emitted from
the installed FastAPI/Starlette compatibility layer, not project code. It is
recorded as `ACCEPTED_UPSTREAM_MAINTENANCE_WARNING`; it is not suppressed or
monkey-patched. Revisit when the supported FastAPI/Starlette line documents
the `httpx2` transition.

## Release artifact privacy

`pnpm test:release` builds, packages, scans `.output/chrome-mv3/` and the
distributable zip, then runs release-safety tests with `RELEASE_AUDIT=true`.
The scanner rejects source maps under the current no-map policy, private
engine/candidate-evidence/runtime database paths, private keys, provider
secret-shaped values, absolute local paths, and generated TypeScript markers.
The release suite no longer uses tautological `expect(true)` placeholders;
the generated-manifest test is skipped only for an ordinary pre-build local
test run and fails closed in release-audit mode.

## Verification evidence

- Required preflight passed at `84368344aebf8af70b614e8d919be5db99326669`:
  branch and `origin/main` state were recorded, the worktree was clean, and
  `git diff --check` was clean.
- `pnpm verify:all` passed: workflow checks and deterministic contracts passed;
  frontend verification passed with 93 files and 1,959 tests; release
  verification passed with 11 files and 453 tests; and Companion verification
  passed with 412 tests.
- `pnpm audit --prod --json` reports zero production advisories. The full
  audit retains only the two documented moderate, dev-only Vitest advisories.
- `uv lock --check --project companion` and an isolated Companion Alembic
  upgrade/check validation passed. No live HH, provider, private-engine, or
  n8n operation was used by these checks.
- `BRANCH_PROTECTION_REQUIRED_CHECK_VERIFIED = no`: GitHub branch protection
  remains an external administration check and is not claimed here.

## Remaining gates after Fix 5

The following remain intentionally outside this engineering-hygiene pass:

- Final re-audit and provider-free smoke review by a human;
- human visual acceptance of the unpacked extension;
- exactly one live Full V4 acceptance on the intended private local engine;
- the accepted `SEC-SERVER-AUTH-001` server-identity/public-release gate;
- external GitHub branch-protection confirmation;
- V4.1, new providers, n8n/Telegram/Interview Pack, publication, and push.
