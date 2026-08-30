# Application Ops — Implementation Status

Status: AOPS-11 complete with partial live capabilities; AOPS-12 not started
Date: 2026-08-30

## Baseline Snapshot

```text
branch:            main (direct commits; no feature branches or PRs)
start commit:      e13eec2535f0c32534a659489262df3c052af99f
                   ("docs: add repo-local Zed launcher")
pack import:       8117cc7ec479210a027bc09954d9069c65d23bd4 (ancestor ✓)
predecessor:       e36a067ae4e8ef931bf0f151712016cb4dbce47e (ancestor ✓)
historical MVP:    71ab48c48376a1e7b44ed0733fdc9aa435f39e76 (ancestor ✓)
v4.0.0 tag:        ABSENT (preserved — not created, moved, or deleted)
worktree:          clean
```

## Baseline Validation (2026-07-29)

All commands executed against `e13eec2` with a clean worktree:

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm typecheck` | 0 | PASS |
| `pnpm lint` | 0 | PASS |
| `pnpm test` | 0 | 65 files, 1700 tests PASS |
| `pnpm build` | 0 | chrome-mv3, 725.69 kB PASS |
| `pnpm test:release` | 0 | 10 files, 391 tests PASS |
| `git diff --check` | 0 | PASS (no whitespace errors) |

Expected `stderr` logging from two negative `openSidePanel` tests appeared;
both tests passed and the full command exited 0.

## AOPS-01 Validation (2026-07-29)

Reviewed against clean start commit
`32e0443a9a0e44686d67d38ee59ae3dd89f0848b`. The review replaced placeholder
validation/500 checks with behavioral tests, added an executable OpenAPI
generator and drift check, constrained configuration to loopback, verified
fresh-environment dependency installation, and sanitized error responses.

| Command / probe | Exit | Result |
| --- | --- | --- |
| `pnpm verify:companion` | 0 | Ruff format/lint, strict mypy, 37 pytest tests, OpenAPI drift check PASS |
| isolated `uv ... pytest` | 0 | 32 locked packages installed; 37 tests PASS |
| documented Uvicorn command + HTTP probe | 0 | `127.0.0.1:8765`, health 200, supplied request ID echoed |
| `pnpm verify` | 0 | 65 files, 1701 tests, chrome-mv3 build PASS |
| `pnpm test:release` | 0 | 10 files, 392 tests, build PASS |
| `git diff --check` | 0 | PASS (line-ending conversion warnings only) |

The TestClient run emits one upstream Starlette deprecation warning about its
current `httpx` compatibility shim; it does not affect the result. The live
probe used no external service or credential.

## AOPS-02 Validation (2026-08-03)

AOPS-02 is committed on `main` as
`8d8c11efecb50b10fed77d8a3bb855a76b653a40`. It provides the reviewed SQLite
domain, Alembic round-trip, repository invariants, request transaction
boundary and DB health contribution.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm verify:companion` | 0 | 26 files formatted, Ruff PASS, strict mypy 17 files PASS, 103 pytest tests PASS, OpenAPI current |
| migration tests inside companion suite | 0 | clean upgrade, repeated upgrade, downgrade/upgrade, metadata check and SQLite PRAGMAs PASS |
| `pnpm verify` | 0 | 65 files, 1697 tests, chrome-mv3 build PASS |
| `pnpm test:release` | 0 | 10 files, 388 tests, chrome-mv3 build PASS |
| `git diff --check` | 0 | PASS |

The companion suite emits one upstream Starlette TestClient deprecation
warning; no test is skipped or failed. Extension/release test totals are the
actual current counts and supersede older historical counts for this
checkpoint.

## AOPS-03 Validation (2026-08-03)

AOPS-03 implements loopback-only pairing, revocable client authentication,
strict extension-origin CORS, bounded request/rate/state controls, OS-keyring
abstraction, sanitized errors, and central log redaction. The production
application exposes no sample/test domain route.

| Command / artifact | Exit | Result |
| --- | --- | --- |
| Codex Security diff scan `ff4afcdd-6df6-467d-8cf4-ea2007c56a19` | 0 | sealed; 14/14 review receipts, three Low/P3 findings |
| focused Ruff check | 0 | changed AOPS-03 app/test files PASS |
| `pytest tests/test_security.py -q` | 0 | 87 tests PASS; one upstream TestClient warning |
| strict mypy on `companion/app/` | 0 | 25 source files PASS |
| OpenAPI generate + drift check | 0 | checked-in snapshot current |

The three scan findings were corrected before acceptance: pairing ignores
untrusted forwarding headers and bounds in-memory state, and the one MiB body
limit counts actual ASGI receive bytes. Focused regressions also cover valid
CORS preflight, wildcard configuration rejection, protected-route rate
limiting, production-route absence, and propagated log redaction.

Per the current review policy, repository-wide extension/release/browser
suites and a second security scan are DEFERRED_TO_RELEASE_GATE. They are not
claimed as passed for this epic.

## AOPS-04 Validation (2026-08-04)

AOPS-04 adds the extension-side loopback client, isolated client-token
storage, explicit localhost permission, pairing controls, status surfaces and
offline-safe fallback. Review corrected API-generation compatibility, JSON
pairing requests, persisted-token initialization, fixed-loopback enforcement
and malformed-token rejection before acceptance.

| Command | Exit | Result |
| --- | --- | --- |
| focused companion adapter/service/component Vitest set | 0 | 6 files, 41 tests PASS |
| `pnpm typecheck` | 0 | PASS |
| ESLint on AOPS-04 extension files | 0 | PASS |
| `git diff --check` | 0 | PASS |

Repository-wide tests, builds, release-safety, browser QA and security scans
remain DEFERRED_TO_RELEASE_GATE under the current validation policy. No result
for those deferred gates is claimed here.

## AOPS-05 Validation (2026-08-04)

AOPS-05 adds the real Dexie v5→v6 upgrade, version-2 sanitized export backup,
explicit migration preview/download/confirmation UI, authenticated typed
migration endpoints, atomic idempotent SQLite import/checkpoint storage, and a
versioned FIFO outbox/cache foundation. Review removed an invented outbox API,
fixed missing client authentication, stable snapshot identity, visible error
codes, conflict retention and silent non-vacancy data loss.

| Command | Exit | Result |
| --- | --- | --- |
| focused extension Vitest set | 0 | 11 files, 169 tests PASS |
| focused companion migration/OpenAPI set | 0 | 13 tests PASS; 41 deselected by scope |
| `pnpm typecheck` | 0 | PASS |
| focused ESLint and Ruff | 0 | PASS |
| strict mypy on `companion/app/` | 0 | PASS |
| OpenAPI drift check | 0 | checked-in snapshot current |
| workflow validator and `git diff --check` | 0 | PASS |

The companion tests emit one upstream Starlette TestClient deprecation
warning. Repository-wide builds, browser QA, release-safety and security scans
remain DEFERRED_TO_RELEASE_GATE and are not claimed as passed here.

## AOPS-06 Validation (2026-08-04)

AOPS-06 adds the versioned sanitized vacancy intake contract, authenticated
list/detail/triage APIs, deterministic fallback identity, change-aware
snapshots and explainable Stage A triage. The extension mirrors only explicit
user saves through the offline outbox, retries with a stable idempotency key,
caches intake/triage results and preserves standalone scoring. Review connected
the previously unused result cache and triage path, retained source-ID-free
captures for companion fallback, rejected idempotency-key payload conflicts,
and prevented custom headers from overriding client authentication metadata.

| Command | Exit | Result |
| --- | --- | --- |
| focused companion vacancy API suite | 0 | 33 tests PASS; one upstream TestClient warning |
| focused extension intake/client/outbox/status suite | 0 | 5 files, 67 tests PASS |
| `pnpm typecheck` | 0 | PASS |
| focused ESLint and Ruff | 0 | PASS |
| strict mypy on changed companion modules | 0 | PASS |
| OpenAPI drift check | 0 | checked-in snapshot current |
| workflow validator and `git diff --check` | 0 | PASS |

Repository-wide builds, browser QA, release-safety and security scans remain
DEFERRED_TO_RELEASE_GATE and are not claimed as passed here. No Application
Engine V4 runtime file was changed and the absent `v4.0.0` tag was preserved.

## AOPS-08 Validation (2026-08-30)

AOPS-08 implements the Full V4 Analysis and Literal Validation pipeline:
evidence-aware prompt compiler, OpenAI BYOK provider (OS-keyring API key),
deterministic literal validators (11 letter checks + structural checks), one
bounded repair retry, input-hash cache scoped by engine version/hash /
prompt version / provider / model, `POST /api/v1/vacancies/{id}/analyze`
(with payload preview) and `GET /api/v1/engine/runs/{run_id}`, transactional
`EngineRun` + `EvidenceUsage` persistence with `engine_hash` run identity,
and hard blocking of Full V4 Analysis on a missing/invalid engine package
(Stage A deterministic triage stays available).

The AOPS-07 loader was extended (additive, fixture-compatible) to load the
authoritative private V4 package format: document-level frontmatter, fenced
per-entry YAML blocks, per-file content versions, `SCORING_CAPS_V4` caps and
`automatic_hard_fails` gates in the KnowledgeIndex, and a canonical
strength→evidence-level mapping with portfolio/certificate/transferable
invariants.

| Command | Exit | Result |
| --- | --- | --- |
| `ruff check` / `ruff format --check` (companion) | 0 | PASS |
| strict mypy (`mypy app/`) | 0 | 43 files, no issues |
| full companion pytest | 0 | 316 passed (incl. 39 AOPS-08 focused) |
| OpenAPI drift check | 0 | checked-in snapshot current |
| `pnpm typecheck` / `lint` / `test` / `build` / `test:release` / `verify:aops-workflow` | 0 | 2808 vitest + 1364 release tests PASS |
| `git diff --check` | 0 | PASS |
| private V4 regressions (private validator) | 0 | 15/15 PASS, 0 errors, 0 warnings |
| private V4 smoke (private validator) | 0 | 6/6 PASS |

Acceptance verdict: **READY_FOR_LIVE_PROVIDER_ACCEPTANCE** — all offline
acceptance gates PASS; the live provider smoke was not executed because no
OpenAI BYOK key is present in the OS keyring (a live PASS is never
simulated). Full evidence: `docs/development/application-ops/recovery/AOPS08_ACCEPTANCE_REPORT.md`.

Known non-blocking limitations: repair-status provenance (repaired vs
originally-valid) is lossy; portfolio boundary enforcement is advisory;
`asyncio.run()` inside the sync analyze route.

## AOPS-07 Validation (2026-08-05)

AOPS-07 adds the Application Engine V4 package loader, manifest/checksum
validation, safe-path handling, YAML frontmatter parsing, unique ID and
authority-graph validation, aggregate hash computation, immutable
`LoadedEnginePackage`, deterministic `KnowledgeIndex`, atomic package
installation (staging → rename), `vacancypilot-engine` CLI with `install`
and `verify` subcommands, `GET /api/v1/engine/status` health endpoint with
sanitized output, and synthetic offline fixtures. Review made checksum coverage
strict, included Project Instructions in validation and the package input hash,
rejected partial YAML fallback and version/status drift, made invalid installed
packages visible in health, and added rollback of a previous valid package when
activation fails.

| Command | Exit | Result |
| --- | --- | --- |
| focused engine + health pytest set | 0 | 84 tests PASS; one upstream TestClient warning |
| focused engine pytest file | 0 | 42 tests PASS, no skip |
| focused Ruff format/check | 0 | PASS |
| strict mypy on changed app modules | 0 | 8 source files PASS |
| OpenAPI drift check | 0 | checked-in snapshot current |
| workflow validator and `git diff --check` | 0 | PASS |

New files:
- `companion/app/engine/__init__.py` — package init
- `companion/app/engine/models.py` — Pydantic models (Manifest, frontmatter schemas, LoadedEnginePackage, etc.)
- `companion/app/engine/package.py` — main loader (~740 lines)
- `companion/app/engine/index.py` — deterministic KnowledgeIndex + builder
- `companion/app/engine/installer.py` — atomic install, verify, get_active_package
- `companion/app/engine/cli.py` — vacancypilot-engine CLI (install + verify)
- `companion/app/api/engine.py` — GET /api/v1/engine/status health endpoint
- `companion/tests/test_engine.py` — 42 focused tests
- `companion/tests/engine_fixtures/valid-minimal/` — synthetic test package (10 active files, manifest, checksums)

Modified files:
- `companion/app/config.py` — added `engine_package_root` setting
- `companion/app/main.py` — registered engine health router
- `companion/pyproject.toml` — added `pyyaml>=6.0.0` dependency and `vacancypilot-engine` console script
- `.gitignore` — excluded `companion/data/engine/current/`, `.staging*/`, `.previous/`
- `shared/contracts/openapi.json` — regenerated with engine status endpoint
- `companion/uv.lock` — updated for pyyaml

Privacy audit: synthetic test fixtures contain only fictional claim IDs
(SYNTH-001 through SYNTH-003, CASE-SYNTH-001, PORT-SYNTH-001, etc.).
No real candidate data, evidence bodies, or generated text is stored.
Real engine payload directories are covered by `.gitignore`.

No canonical Application Engine V4 payload, fact, rule, or version was changed,
and the absent `v4.0.0` tag was preserved.

Repository-wide builds, browser QA, release-safety and security scans remain
DEFERRED_TO_RELEASE_GATE and are not claimed as passed here.

## Existing Extension Capabilities (Preserved)

These capabilities exist in the current extension and must remain intact
throughout all AOPS epics:

### Runtime Surfaces
- Popup (`entrypoints/popup/`) — quick actions, vacancy status, side panel open
- Side panel (`entrypoints/sidepanel/`) — vacancy analysis, context-aware UI
- Options/Dashboard (`entrypoints/options/`) — full dashboard, settings, Labs
- Content scripts: `vacancy.js` (HH vacancy pages), `search.js` (HH search results)

### Features
- HH vacancy parser: 19 fixture variants
- HH search card parser: 3 fixture variants
- Local tracker: save, status management, status history
- Rule-based scoring: 8-component weighted model
- AI analysis: provider abstraction, redaction, payload preview, Strict Privacy, cache
- Cover Letter Studio: generation, edit, copy, modes
- Export/delete: CSV, JSON, full data deletion
- HR timeline: read-only capture, reply classification, follow-up planning
- Kanban queue: manual stage transitions
- Guided Apply Labs: clipboard-only workspace, Labs kill switch
- Workflow reminders: local daily summary
- Search Highlights: visit marks, batched highlight pipeline, settings
- Onboarding: permission disclosure, privacy explainer

### Technical Baseline
- WXT 0.20.26, Manifest V3, Chrome MV3
- TypeScript 6, React 19, Dexie 4.4.4, Vitest 3.2.6
- Permissions: `storage`, `sidePanel`, `activeTab`
- Optional `host_permissions`: `https://api.openai.com/*`, exact companion loopback origin
- No broad host permissions
- Package manager: pnpm 11.1.1

### Quality Baseline
- 65 test files, 1700 tests
- 10 release-safety files, 391 tests
- TypeScript strict mode
- ESLint with type-aware rules

## P0 / P1 / Non-goal Boundary

### P0 (AOPS-01 through AOPS-17) — Required for MVP release 0.2.0

- Companion foundation (FastAPI, health, quality commands)
- SQLite domain, Alembic, repositories
- Loopback-only pairing, keyring, CORS, redaction
- Extension OpsClient, settings, offline-safe health UI
- Dexie schema extension with outbox and conflict reporting
- Vacancy intake, snapshots, deduplication, local triage
- Engine V4 package loader, index, health, validators
- Full V4 analysis, provider abstraction, prompt compiler, JSON output
- Cover letter lifecycle, manual ChatGPT bridge, generated/sent diff
- Official HH public API client and search profiles
- HH OAuth PKCE, token refresh, read-only applicant sync
- Operations dashboard: Command Center, Inbox, Application Card
- Pipeline, events, follow-ups
- Interview Pack with Markdown export
- Analytics and pilot report
- Backup, restore preview, privacy, debug bundle
- Full E2E, Chrome/Edge QA, release artifacts

### P1 (AOPS-18) — Conditional, only after P0 is stable

- Daily sync scheduler
- Local notifications
- Detailed negotiations timeline
- Experiments metadata for openings/closings
- Dashboard filtering by source, role family, and score band

The manual ChatGPT Project bridge is explicitly promoted from the source
specification's conditional P1 list into P0 by ADR-006. A DeepSeek runtime
provider remains post-MVP unless separately approved; use of DeepSeek through Claude
does not authorize product integration.

### Non-goals (never in Application Ops MVP)

- Auto-submit or auto-apply
- Hidden HH page/API requests from the extension
- Programmatic writes to HH forms
- HH cookies, passwords, or session handling
- CAPTCHA or antibot bypass
- Cloud backend, Streamlit, microservices
- PostgreSQL, Redis, Celery, Kafka, Docker requirement
- Developer telemetry by default
- Multi-site support beyond HH.ru

## Epic Completion Status

| Epic | Name | Status |
| --- | --- | --- |
| AOPS-00 | Baseline and contract freeze | complete |
| AOPS-01 | Companion foundation | complete |
| AOPS-02 | SQLite domain and migrations | complete |
| AOPS-03 | Localhost security, pairing and secrets | complete |
| AOPS-04 | Extension Ops client and offline mode | complete |
| AOPS-05 | Dexie migration and outbox | complete |
| AOPS-06 | Vacancy intake, deduplication and local triage | complete |
| AOPS-07 | Engine package, deterministic index and health | complete |
| AOPS-08 | Full V4 analysis, providers and literal validation | complete |
| AOPS-09 | Letter lifecycle, manual bridge and generated/sent diff | complete |
| AOPS-10 | HH public API and search profiles | complete |
| AOPS-11 | HH OAuth and read-only applicant sync | complete — PARTIAL_LIVE_CAPABILITIES |
| AOPS-12 | Command Center, Inbox and Application Card | not started |
| AOPS-13 | Pipeline, events and follow-ups | not started |
| AOPS-14 | Interview Pack | not started |
| AOPS-15 | Analytics and production pilot | not started |
| AOPS-16 | Backup, restore, privacy and debug bundle | not started |
| AOPS-17 | E2E, browser QA and release 0.2.0 | not started |
| AOPS-18 | Conditional P1 enhancements | not started |

## Acceptance Traceability: §25 MVP Criteria → AOPS Epic

### §25.1 Functional

| # | Criterion | AOPS Epic |
| --- | --- | --- |
| 1 | Open HH vacancy can be saved to Ops | AOPS-06 |
| 2 | Duplicate upsert is idempotent | AOPS-06 |
| 3 | Official HH search works with application token | AOPS-10 |
| 4 | OAuth connect/disconnect works | AOPS-11 |
| 5 | Token refresh works | AOPS-11 |
| 6 | Resumes sync | AOPS-11 |
| 7 | Available applicant response sync | AOPS-11 |
| 8 | Local triage works without AI | AOPS-06 |
| 9 | V4 full analysis works | AOPS-08 |
| 10 | Evidence map is visible | AOPS-07, AOPS-12 |
| 11 | Score caps match V4 | AOPS-08 |
| 12 | Letter validation is literal | AOPS-09 |
| 13 | Generated and sent versions are separate | AOPS-09 |
| 14 | Pipeline works | AOPS-13 |
| 15 | Follow-up reminders work | AOPS-13 |
| 16 | Interview Pack exports | AOPS-14 |
| 17 | Analytics handles empty and populated data | AOPS-15 |
| 18 | Backup and restore preview work | AOPS-16 |

### §25.2 Safety

| # | Criterion | AOPS Epic |
| --- | --- | --- |
| 1 | No auto-apply | All epics (architectural constraint) |
| 2 | No hidden HH requests | AOPS-04, AOPS-10, AOPS-11 |
| 3 | No HH cookies/session access | AOPS-03, AOPS-10, AOPS-11 |
| 4 | No broad HH permissions | AOPS-04, AOPS-17 |
| 5 | No refresh token in extension storage | AOPS-03, AOPS-11 |
| 6 | No secrets in export | AOPS-16 |
| 7 | No secrets in logs | AOPS-03 |
| 8 | No unsupported claims | AOPS-07, AOPS-08 |
| 9 | No cloud backend | AOPS-01 |
| 10 | Companion binds only loopback | AOPS-03 |

### §25.3 Quality

| # | Criterion | AOPS Epic |
| --- | --- | --- |
| 1 | Extension typecheck PASS | AOPS-00 (baseline), all epics |
| 2 | Extension lint PASS | AOPS-00 (baseline), all epics |
| 3 | Extension tests PASS | AOPS-00 (baseline), all epics |
| 4 | Extension build PASS | AOPS-00 (baseline), all epics |
| 5 | Release-safety PASS | AOPS-00 (baseline), AOPS-17 |
| 6 | Companion pytest PASS | AOPS-01 |
| 7 | Ruff PASS | AOPS-01 |
| 8 | mypy PASS | AOPS-01 |
| 9 | Engine regressions 15/15 | AOPS-07, AOPS-08 |
| 10 | Engine smoke 6/6 | AOPS-07, AOPS-08 |
| 11 | Chrome manual QA PASS | AOPS-17 |
| 12 | Edge manual QA PASS | AOPS-17 |
| 13 | 25 parser fixtures PASS | AOPS-06, AOPS-17 |

### §25.4 Pilot Exit

| # | Criterion | AOPS Epic |
| --- | --- | --- |
| 1 | 15–20 real applications logged | AOPS-15 |
| 2 | Generated and sent letters stored | AOPS-09, AOPS-15 |
| 3 | Manual edit rate calculated | AOPS-15 |
| 4 | Outcomes recorded | AOPS-13, AOPS-15 |
| 5 | No critical claim incident | AOPS-07, AOPS-08 |
| 6 | V4.1 recommendations based on batch data | AOPS-15, AOPS-17 |

## Contract and Manifest Verification

- `wxt.config.ts` required permissions unchanged: `storage`, `sidePanel`, `activeTab`
- Exact `http://127.0.0.1:8765/*` added as an optional host permission for explicit Ops Mode opt-in
- Extension runtime/dev dependencies unchanged; root `package.json` adds only companion scripts
- Companion Python dependencies are isolated under `companion/` and locked by `uv.lock`
- No Dexie schema changes
- No Application Engine runtime edits
- No HH or AI calls introduced; companion requests are explicit loopback-only calls
