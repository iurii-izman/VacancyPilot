# Iteration Map

Status values:

- `planned`
- `in_progress`
- `done`
- `blocked`
- `deferred`
- `backlog`

## Phase 0: Foundation

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-001 | EPIC-00 | Scaffold WXT + React + TypeScript extension | done | `chore: scaffold extension foundation` |
| ITER-002 | EPIC-00 | Add lint/test/typecheck/build scripts and CI smoke shape | planned | `chore: add project quality scripts` |
| ITER-003 | EPIC-01 | Add domain models and shared type contracts | done | `feat: add domain model contracts` |
| ITER-004 | EPIC-01 | Add Dexie schema v1, migrations, settings storage | done | `feat: add local storage schema` |
| ITER-005 | EPIC-02 | Add HHAdapter interface and vacancy parser skeleton | done | `feat: add hh vacancy parser skeleton` |
| ITER-006 | EPIC-02 | Add parser fixture harness and first sanitized fixtures | done | `test: add vacancy parser fixtures` |

## Phase 1: Read & Assist MVP

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-007 | EPIC-03 | Save current vacancy locally and manage statuses | done | `feat: add local vacancy tracker` |
| ITER-008 | EPIC-04 | Implement explainable rule-based scoring | done | `feat: add rule based scoring` |
| ITER-009 | EPIC-05 | Build side panel, popup, and dashboard shell | done | `feat: add extension ui shell` |
| ITER-010 | EPIC-06 | Implement redaction, payload preview, Strict Privacy | done | `feat: add ai privacy layer` |
| ITER-011 | EPIC-06 | Add AI provider interface, mock provider, cache | done | `feat: add ai analysis workflow` |
| ITER-012 | EPIC-07 | Add Cover Letter Studio editor and copy workflow | done | `feat: add cover letter studio` |
| ITER-013 | EPIC-08 | Add CSV/JSON export and delete all data | done | `feat: add export and data deletion` |
| ITER-014 | EPIC-09 | Add n8n webhook client with HMAC and retry queue | deferred | `feat: add opt in n8n events` |
| ITER-015 | EPIC-10 | Add privacy/safety tests and release checklist | done | `test: add release safety checks` |
| ITER-016 | EPIC-10 | Manual QA pass and Phase 1 release candidate docs | done | `docs: prepare phase 1 release candidate` |

## Phase 1 Follow-up: Runtime Completion

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-017 | EPIC-11 | Wire popup actions and live vacancy state | done | `feat: wire popup runtime actions` |
| ITER-018 | EPIC-11 | Replace dashboard vacancy shell with runtime views | done | `feat: add dashboard runtime views` |
| ITER-019 | EPIC-11 | Add profile and resume management flow | done | `feat: add profile resume management` |
| ITER-020 | EPIC-11 | Sync popup, side panel, and dashboard state | done | `feat: sync runtime surfaces` |
| ITER-021 | EPIC-11 | Fix runtime QA findings and prep rerun | done | `fix: address runtime qa findings` |

> **ITER-021 note**: Closed after live browser rerun confirmation for the current Phase 1 core flow. Keep `docs/development/manual-qa-run-2026-06-20.md` as the regression reference for future hardening passes.
>
> **ITER-014 decision**: n8n deferred from current Phase 1 completion path (PHASE-1-SIGNOFF). n8n is opt-in Labs, not Core; the spec lists n8n permission model as an open decision (spec 26.5). Will be re-evaluated only if webhook automation returns to active scope.

## Post-Phase-1: Audit Hardening

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-022 | EPIC-12 | Confirm or refute external audit findings and produce a triaged hardening report | done | `docs: triage external audit findings` |

## Post-Phase-1: Confirmed Audit Fixes

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-023 | EPIC-13 | Harden vacancy storage, badge cleanup, and ID integrity | done | `fix: harden vacancy storage and badge cleanup` |
| ITER-024 | EPIC-13 | Align save semantics and recompute score on profile changes | done | `fix: align save semantics and score recompute` |
| ITER-025 | EPIC-13 | Close cover-letter privacy gap and profile lifecycle leaks | done | `fix: close privacy gap and clean profile lifecycle refs` |
| ITER-026 | EPIC-13 | Harden HH parser, dashboard refresh, and generated-manifest safety | done | `fix: harden parser and release safety` |

## Post-Phase-1: Second Audit Cycle

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-027 | EPIC-14 | Confirm or refute the second audit and produce a narrow follow-up hardening plan | done | `docs: triage second audit findings` |
| ITER-028 | EPIC-14 | Fix dashboard storage listener and harden release-audit execution | done | `fix: correct dashboard storage listener and add release audit scripts` |
| ITER-029 | EPIC-14 | Deduplicate badge-state helpers and improve parsing quality | done | `fix: dedup badge helpers, add experience parser, tighten passive status regex` |
| ITER-030 | EPIC-14 | Integrate passive HH status and replace side panel context guessing | done | `feat: integrate passive HH status parser and fix side panel context` |
| ITER-031 | EPIC-14 | Clean up profile lifecycle nullability and strengthen company identity | done | `fix: make coverLetter profileId nullable, parse employer ID, verify recompute UX` |

## Phase 1 Closeout Gate

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-032 | EPIC-15 | Finalize the Phase 1 private-RC gate and explicitly decide whether Phase 2 may start | done | `docs: finalize phase 1 private rc gate` |

## Phase 2: Search Triage Core

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-033 | EPIC-20 | Add safe HH search-card parser and fixture harness | done | `feat: add hh search card parser` |
| ITER-034 | EPIC-20 | Render lightweight search-result badges | done | `feat: add search result badges` |
| ITER-035 | EPIC-20 | Add local quick save/reject from search cards | done | `feat: add search quick actions` |
| ITER-036 | EPIC-20 | Harden search triage runtime for dynamic HH result pages | done | `fix: harden search triage runtime` |

## Phase 2: Queue And Dashboard Follow-Up

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-037 | EPIC-21 | Add local queue task list and duplicate detection | done | `feat: add queue task list` |
| ITER-038 | EPIC-21 | Add company greylist workflow and stronger Phase 2 dashboard | done | `feat: add company greylist workflow` |

## Phase 2.5: Dependency And Toolchain Maintenance

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-048 | EPIC-27 | Refresh the pinned WXT stack and re-establish a clean dependency baseline | done | `chore: refresh wxt dependency baseline` |
| ITER-049 | EPIC-27 | Migrate the repository cleanly to TypeScript 6 | done | `chore: migrate to typescript 6` |
| ITER-050 | EPIC-27 | Align the React runtime/type stack deliberately after dependency triage | done | `chore: align react stack` |

## Phase 2.6: Security Alert Closure

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-051 | EPIC-28 | Inventory remaining GitHub security alerts and map each one to a fix path or blocker | done | `docs: inventory remaining security alerts` |
| ITER-052 | EPIC-28 | Close safe transitive alerts with targeted overrides and minimal version moves | done | `fix: close safe transitive security alerts` |
| ITER-053 | EPIC-28 | Resolve toolchain-linked high alerts that require coordinated dependency updates | done | `fix: resolve toolchain linked security alerts` |
| ITER-054 | EPIC-28 | Re-run audit/verification and document final remaining alert posture | done | `docs: finalize security alert closure status` |

## Phase 3: Guided Apply Labs

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-039 | EPIC-22 | Add Labs control plane, kill switch, and local action log | done | `feat: add labs safety controls` |
| ITER-040 | EPIC-22 | Add clipboard-only guided-apply workspace and resume recommendation | done | `feat: add guided apply workspace` |

## Phase 3: Workflow Automation And Reminders

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-041 | EPIC-25 | Add kanban queue workflow and manual stage actions | done | `feat: add kanban queue workflow` |
| ITER-042 | EPIC-25 | Add local reminders and daily workflow summary | done | `feat: add workflow reminders and summary` |

## Phase 4: HR Communication Hub

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-043 | EPIC-09 | Re-open n8n via permission-gated manual workflow events | deferred | `feat: add opt in workflow webhooks` |
| ITER-044 | EPIC-23 | Add read-only HR timeline capture and reply classification from user-opened HH pages | done | `feat: add hr timeline capture` |
| ITER-045 | EPIC-23 | Add reply drafts and follow-up planning workspace | done | `feat: add hr follow up workspace` |

## Phase 4.1: Post-Audit Reliability And Scoring

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-055 | EPIC-29 | Align lifecycle utilities with the current live schema and HR data model | done | `fix: align schema lifecycle utilities` |
| ITER-056 | EPIC-29 | Wire migrations into boot flow and refresh runtime QA evidence | done | `fix: wire migrations and refresh runtime qa gate` |
| ITER-057 | EPIC-29 | Extend profiles with experience and seniority inputs | done | `feat: add profile experience model` |
| ITER-058 | EPIC-29 | Upgrade scoring using the new experience/seniority signals | done | `feat: improve scoring fit signals` |

## Phase 4.2: Final Security Tail Closure

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-059 | EPIC-30 | Close the remaining moderate transitive dependency alert with the smallest safe lockfile/toolchain move | done | `fix: close final moderate dependency alert` |

## Phase 5: AI Assist Quality And Trust

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-060 | EPIC-31 | Harden AI settings lifecycle and land the first real BYOK AI provider without adding sync or backend storage | planned | `feat: harden ai settings and add first real provider` |
| ITER-061 | EPIC-31 | Add token/cost preview and local request-budget controls to AI execution flows | planned | `feat: add ai budget preview controls` |
| ITER-062 | EPIC-31 | Add cover-letter quality guardrails and draft provenance markers | planned | `feat: add letter quality guardrails` |

## Phase 5: Private Release Readiness

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-063 | EPIC-32 | Complete onboarding, permission disclosure, and privacy explainer surfaces for real private installs | done | `feat: complete onboarding and permission disclosure` |
| ITER-064 | EPIC-32 | Harden private packaging assets, install flow docs, and release verification evidence | done | `docs: finalize private release readiness pack` |

## Phase 5.5: UI Foundation And Surface Consistency

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-065 | EPIC-33 | Extract shared UI tokens/primitives and normalize popup, side panel, dashboard shell styling | planned | `refactor: unify ui surface foundations` |
| ITER-066 | EPIC-33 | Polish empty/loading/error states and responsive density across core surfaces | planned | `feat: polish shared ui states and responsiveness` |

## Phase 5.6: Workflow UX Refinement

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-067 | EPIC-34 | Improve kanban, HR, and guided-apply workflow ergonomics for repeated daily use | planned | `feat: refine workflow ergonomics` |
| ITER-068 | EPIC-34 | Improve popup, side panel, and search triage interaction clarity, feedback, and accessibility | planned | `feat: improve runtime interaction clarity` |

## Phase 5.7: Runtime Stabilization And Surface Hardening

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-069 | EPIC-35 | Fix popup-to-side-panel runtime opening flow and background boot synchronization without expanding permissions | planned | `fix: stabilize side panel open flow` |
| ITER-070 | EPIC-35 | Polish popup density and HH page badge placement after the side-panel runtime fix | planned | `polish: improve popup and page badge UX` |
| ITER-071 | EPIC-35 | Improve dashboard/options responsive layout and reduce nested scroll friction in narrow widths | planned | `feat: polish dashboard responsive ergonomics` |

## Phase 5.8: Runtime Visual Consistency Consolidation

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-072 | EPIC-36 | Stabilize popup shell dimensions and finish ambient badge placement/behavior polish | planned | `fix: stabilize popup shell and badge placement` |
| ITER-073 | EPIC-36 | Separate About and Onboarding roles and introduce a reusable trust/safety summary layer | planned | `refactor: separate onboarding and about surfaces` |
| ITER-074 | EPIC-36 | Consolidate dashboard navigation, scroll ownership, and narrow-layout shell behavior | planned | `feat: consolidate dashboard shell responsiveness` |
| ITER-075 | EPIC-36 | Finish forms, disabled-state readability, empty-state polish, and capture the final visual consistency report | planned | `docs: finalize runtime visual consistency pass` |

## Phase 5.9: Audit Closure And Trust Surface Alignment

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-076 | EPIC-37 | Add a repo-local Sonar coverage baseline and make advisory quality-signal docs explicit without guessing external Sonar identity | done | `ci: add sonar coverage baseline` |
| ITER-077 | EPIC-37 | Reduce HR timeline export/privacy risk by storing safer content and documenting the trust boundary precisely | done | `fix: harden hr timeline trust surface` |
| ITER-078 | EPIC-37 | Capture the 2026-06-22 audit closure report and manual infra handoff without reopening duplicated runtime/UI work | done | `docs: finalize 2026-06-22 audit closure` |

## Phase 6.1: HH Visual Triage And Search Highlights MVP

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-079 | EPIC-38 | Add local visit marks, vacancy-open recording, and lifecycle coverage without polluting saved jobs | done | `1d55ab0` |
| ITER-080 | EPIC-38 | Replace storage-only search badge reads with a batched highlight-state pipeline and render viewed/saved/rejected/score states safely on HH search cards | done | `63474fb` |
| ITER-081 | EPIC-38 | Add Search Highlights settings, optional local search-surface controls, and final manual QA/reporting for the MVP pack | done | `e6c3958` |

Post-iteration rendering/discovery hardening landed in `71ab48c` and `083d360`.

## Phase 5: Expansion And Release

| Iteration | Epic | Goal | Status | Commit |
| --- | --- | --- | --- | --- |
| ITER-046 | EPIC-24 | Extract SiteAdapter boundary and add second-site skeleton | backlog | `refactor: extract site adapter contract` |
| ITER-047 | EPIC-26 | Add public-release permissions, onboarding, and store-readiness pack | backlog | `docs: prepare public release pack` |

## Cursor/Codex Rule

Do not ask autopilot to implement more than one row at a time. If it touches unrelated epics, reject or split the change.
