# Application Ops — Implementation Status

Status: AOPS-01 complete (reviewed companion foundation); AOPS-02 next
Date: 2026-07-29

## Baseline Snapshot

```text
branch:            codex/application-ops-mvp
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
- Optional `host_permissions`: `https://api.openai.com/*`
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
provider remains post-MVP unless separately approved; use of DeepSeek in Zed
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
| AOPS-02 | SQLite domain and migrations | not started |
| AOPS-03 | Localhost security, pairing and secrets | not started |
| AOPS-04 | Extension Ops client and offline mode | not started |
| AOPS-05 | Dexie migration and outbox | not started |
| AOPS-06 | Vacancy intake, deduplication and local triage | not started |
| AOPS-07 | Engine package, deterministic index and health | not started |
| AOPS-08 | Full V4 analysis, providers and literal validation | not started |
| AOPS-09 | Letter lifecycle, manual bridge and generated/sent diff | not started |
| AOPS-10 | HH public API and search profiles | not started |
| AOPS-11 | HH OAuth and read-only applicant sync | not started |
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

- `wxt.config.ts` permissions unchanged: `storage`, `sidePanel`, `activeTab`
- Extension runtime/dev dependencies unchanged; root `package.json` adds only companion scripts
- Companion Python dependencies are isolated under `companion/` and locked by `uv.lock`
- No Dexie schema changes
- No Application Engine runtime edits
- No HH or AI calls introduced
