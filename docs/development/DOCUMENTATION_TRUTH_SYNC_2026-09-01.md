# Documentation Truth Sync — 2026-09-01

## Verdict

Target verdict: `DOCS_TRUTH_SYNC_COMPLETE_AND_PUSHED` after the local merge and main push described by the final Git verification.

## 1. Baseline

| Item | Result |
| --- | --- |
| Input/runtime baseline SHA | `607f8004f39ab2d810181f7fd973bbb8935e871c` |
| Baseline message | `merge: accept dependency updates` |
| Documentation snapshot | 2026-09-01 |
| R5 | PASS; accepted and pushed |
| R5.1 | Project Memory Lite accepted and pushed |
| Dependency maintenance | Merged before this pass; no upgrade performed here |
| Fresh dependency audit | `pnpm audit --json`: 3 high, 1 moderate in the pnpm graph |
| GitHub Dependabot | 2 open alerts visible through the API |
| Starting branch/worktree | `main`, clean, one registered worktree |
| Starting branch sync | `main == origin/main` at the input SHA |
| Ending SHA | Reported by final Git verification; deliberately not embedded as a self-referential “verified commit” |

## 2. Current Product Truth

VacancyPilot is a local-first, user-controlled HH.ru job-search copilot for read-only vacancy intake, deterministic triage, explainable Full V4 analysis, evidence-aware cover letters, a human-controlled application preparation queue, application tracking/follow-ups and descriptive conversion feedback.

Standalone Mode is a WXT/Manifest V3/TypeScript/React extension using Dexie/IndexedDB and `chrome.storage.local`. Ops Mode is an explicitly paired loopback FastAPI companion using SQLite authority, OS-keyring secrets, a private local V4 package, generated OpenAPI and official read-only HH API calls. No auto-apply, hidden browser-side HH requests, external sending or developer cloud backend is part of the product boundary.

Current operation is **FEATURE DEVELOPMENT: FROZEN** / **MODE: REAL DAILY USE / DOGFOOD**. The next step is real vacancy/application evidence collection, not automatic AOPS-14, full AOPS-15 or EPIC-31 execution.

## 3. Documents Updated

| File | Why | Authority/source used |
| --- | --- | --- |
| `README.md` | Replaced extension-only story with current product, two surfaces, safety, R5, quick start and roadmap | Current code/config, R5 acceptance/QA, Application Ops ADRs |
| `docs/project-memory/CURRENT_STATE.md` | Removed stale verified SHA and active-next semantics; recorded reviewed baseline, audit state and dogfood mode | Git state, current implementation status, R5.1 map |
| `docs/project-memory/README.md` | Put current-state and daily-use startup path first; clarified historical planning role | Memory Lite authority model |
| `docs/development/application-ops/README.md` | Replaced AOPS-01 next marker with accepted AOPS-00..13/R5 state and deferred AOPS-14/15+ | AOPS implementation status and R5 artifacts |
| `docs/development/application-ops/IMPLEMENTATION_STATUS.md` | Updated current snapshot, pushed/accepted wording, baseline and dependency/audit state | Git, package metadata, fresh gates |
| `docs/ROADMAP.md` | Replaced old P0/P1 execution queue with dogfood objectives, hotfix criteria and evidence gate | R5 daily-use readiness and current state |
| `docs/development/00-product-development-plan.md` | Marked plan historical/superseded for active execution and pointed to current truth | Accepted R5 freeze |
| `docs/development/README.md` | Removed automatic ITER-060 startup instruction | Project Memory Lite and current roadmap |
| `docs/README.md` | Updated overview, stack, Memory Lite entry point and reading map | Current architecture and docs |
| `PRIVACY.md` | Documented browser vs companion storage, key paths, HH API, retention and uninstall scope | Source code, ADR-002/004/005, companion contracts |
| `SECURITY.md` | Updated extension-only boundary to extension + loopback companion and current verification/audit state | Security code, ADR-001/004/005, fresh audit |
| `docs/development/private-install-guide.md` | Added current Standalone/Ops, pairing, engine, AI/HH setup and troubleshooting | Existing scripts, CLI and companion UI/docs |
| `docs/development/public-release-prerequisites.md` | Marked future/non-imminent; corrected companion/pairing and storage assumptions | Current manifest and Ops architecture |
| `docs/development/store-listing-draft.md` | Corrected architecture and public links; kept as future draft | Current product and repository metadata |
| `docs/development/privacy-policy-checklist.md` | Corrected storage/key/retention checklist for both modes | Current storage code |
| `docs/development/release-checklist.md` | Marked future backlog and removed hardcoded obsolete test counts | Fresh validation model |
| `.github/SUPPORT.md`, `.github/CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/config.yml` | Corrected public owner/path and current status | GitHub repository metadata |
| `src/components/AboutSection.tsx` | Corrected status, architecture and public links | Current UI/runtime |
| `src/components/OnboardingSection.tsx` | Distinguished standalone browser keys from companion OS-keyring secrets and deferred n8n | Current settings/companion behavior |
| `src/components/TrustSafetySummary.tsx` | Corrected browser-only storage claim | Current storage architecture |
| `src/components/PrivacyDisclosureSection.tsx` | Corrected storage, HH API and key-handling disclosures | Current code |
| Matching UI tests | Updated assertions for changed informational copy | UI-only text changes |
| `docs/development/application-ops/r3/R3_POST_MERGE_ACCEPTANCE.md` | Redacted historical local absolute paths without changing acceptance facts | Public-doc secret/path scan |

## 4. Historical Documents Preserved

Old audits, accepted ADRs, milestone acceptance reports, manual QA evidence, release notes, dependency reports, epic/iteration prompts and historical decomposition remain unchanged except for the two non-semantic absolute-path redactions noted above. They retain their original dates, counts and historical claims. Current indexes now frame them as evidence or planning context rather than active next steps.

## 5. Major Contradictions Closed

| Finding | Previous claim | Current truth | Action |
| --- | --- | --- | --- |
| README architecture | Extension-only / browser-only | Standalone extension plus optional local companion | Rewritten README and docs |
| Roadmap active sequence | Old P0/P1 runtime work next | Dogfood evidence collection; hotfix-only gate | Rewritten roadmap |
| Application Ops next marker | AOPS-01 next | AOPS-00..13 accepted where supported; R5 accepted; AOPS-14 deferred | Rewritten hub |
| Memory Lite baseline | Stale `b57b73a...` verified commit | Reviewed runtime baseline `607f8004...`; no self-referential verified commit | Rewritten current state |
| Privacy/storage/key handling | All data/browser and all keys in `chrome.storage.local` | Standalone browser paths plus Ops SQLite/OS keyring/local engine | Rewritten policy/UI |
| HH boundary | Browser-only/no server-side component | Read-only browser DOM plus official companion-side HH API reads | Rewritten security/privacy |
| Install guide | Extension-only and old counts | Standalone/Ops, pairing, engine and current commands | Rewritten guide |
| Owner links | `github.com/VacancyPilot/VacancyPilot` | `github.com/iurii-izman/VacancyPilot` | Current links corrected |
| Dependency status | Old alert counts/clean claims | Fresh pnpm audit: 3 high/1 moderate; Dependabot: 2 open | Current docs record measured state |
| GitHub metadata | Older description/topics | Product description and high-signal topics aligned to current runtime | Metadata updated after docs |

## 6. GitHub Metadata

Before:

- Description: `Local-first HH.ru job-search copilot: safe vacancy parsing, explainable scoring, cover letters, application tracking, Kanban and export.`
- Topics: `browser-extension, job-search, manifest-v3, react, typescript, wxt, ai-copilot, career-tools, chrome-extension, cover-letter, developer-tools, dexie, hh-ru, indexeddb, job-tracker, kanban, local-first, privacy-first, scoring`
- Homepage: empty

After:

- Description: `Local-first HH.ru copilot: read-only vacancy intake, explainable V4 analysis, evidence-aware letters, human-controlled application tracking. No auto-apply.`
- Topics: `ai-copilot, application-tracking, browser-extension, career-tools, chrome-extension, cover-letter, dexie, fastapi, hh-ru, job-search, job-tracker, local-first, manifest-v3, openapi, privacy-first, react, scoring, sqlite, typescript, wxt`
- Homepage: empty; no invented project page added

## 7. Validation

| Gate | Result | Details |
| --- | --- | --- |
| Relative Markdown links | PASS | 16 current/changed files checked |
| Stale phrase scan | PASS with historical classifications | No high-impact stale current claim remains; old phrases remain only in historical evidence or planning archaeology |
| Owner URL scan | PASS for current-facing files | Old owner references classified as historical where retained; current-facing links use `iurii-izman/VacancyPilot` |
| Secret/path scan | PASS for changed/public current docs | No new local paths, engine payloads, API keys, OAuth tokens or candidate data; one historical report had absolute paths redacted |
| `pnpm typecheck` | PASS | included in `pnpm verify` |
| `pnpm lint` | PASS | included in `pnpm verify` |
| `pnpm test` | PASS | 78 files, 1,864 tests |
| `pnpm build` | PASS | WXT 0.21.4, chrome-mv3, 779.04 kB |
| `pnpm verify:aops-workflow` | PASS | included in `pnpm verify` |
| `pnpm verify:companion` | PASS | Ruff format/lint, mypy 58 files, 356 pytest, OpenAPI current |
| `pnpm test:release` | PASS | 10 files, 420 tests; final rerun after documentation/UI changes |
| `git diff --check` | PASS | no whitespace errors (Git emitted only CRLF normalization warnings) |
| Mermaid structure | PASS | README diagram has balanced fenced Mermaid block and flowchart declaration |
| Dependency audit | MEASURED / NOT CLEAN | 3 high, 1 moderate from `pnpm audit --json`; no upgrade in scope |
| Dependabot | MEASURED / NOT CLEAN | 2 open alerts accessible through `gh api` |
| CI | CONFIGURED | CI, Dependency Review and advisory SonarQube Cloud workflow present; remote run not waited on |

## 8. Deferred / Not Changed

AOPS-14 Interview Pack, full AOPS-15, AOPS-16/17/18 execution, release/version changes, license selection, runtime behavior, HH permissions/capabilities, provider/network logic, schema/migrations, OpenAPI behavior, backup/recovery redesign, new AI providers, n8n/Telegram, scheduler/background sync and public-store packaging were not implemented.

## 9. Safety

- Runtime behavior changed: **NO**; only informational UI text/links changed.
- HH permissions changed: **NO**.
- Auto-apply introduced: **NO**.
- External send introduced: **NO**.
- V4 changed: **NO**.
- Schema/API changed: **NO**.
- Secrets/private candidate data committed: **NO**.

## 10. Git

The feature branch and commit/merge/push details are completed and recorded by the final verification after this report is committed. The required final state is one clean `main` branch, local `main == origin/main`, no feature branch, no force push and one registered worktree.

## 11. Current Operational Mode

**FEATURE DEVELOPMENT: FROZEN**
**MODE: REAL DAILY USE / DOGFOOD**

## 12. Next

Use VacancyPilot with real vacancies and applications.
Collect repeated friction, quality, cost and conversion evidence.
Choose the next feature milestone only from real dogfood evidence.
Do not start AOPS-14 or full AOPS-15 by default.

Search before create. Read current code before updating documentation claims. Preserve historical evidence. Prefer one canonical current statement over duplicated status prose. Fix links and contradictions systematically, do not invent capability, do not hide limitations, do not expose private data and do not broaden scope.
