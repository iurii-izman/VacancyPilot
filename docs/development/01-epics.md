# Epic Index

This file is the working map from the master specification to implementation epics.

## Phase 0 / Phase 1 Core Epics

| Epic | Name | Phase | Status | Depends On |
| --- | --- | --- | --- | --- |
| EPIC-00 | Foundation and Tooling | 0 | ready | none |
| EPIC-01 | Domain Models and Local Storage | 0/1 | ready | EPIC-00 |
| EPIC-02 | HH Vacancy Parser and Fixtures | 0/1 | ready | EPIC-00, EPIC-01 |
| EPIC-03 | Local Tracker and Status History | 1 | ready | EPIC-01, EPIC-02 |
| EPIC-04 | Rule-Based Scoring | 1 | ready | EPIC-01, EPIC-02 |
| EPIC-05 | Extension UI Shell | 1 | ready | EPIC-00, EPIC-03, EPIC-04 |
| EPIC-06 | AI Privacy Layer and Analysis | 1 | ready | EPIC-01, EPIC-04, EPIC-05 |
| EPIC-07 | Cover Letter Studio | 1 | ready | EPIC-06 |
| EPIC-08 | Export, Import Backlog, and Delete All | 1 | ready | EPIC-03 |
| EPIC-09 | n8n and Telegram Webhook Events | 1 | ready | EPIC-03, EPIC-08 |
| EPIC-10 | Release Hardening and QA | 1 | ready | all Phase 1 epics |
| EPIC-11 | Runtime Workflow Completion | 1 | ready | EPIC-03, EPIC-04, EPIC-05, EPIC-07, EPIC-10 |
| EPIC-12 | Post-Signoff Audit Hardening | 1.5 | ready | EPIC-01, EPIC-02, EPIC-03, EPIC-04, EPIC-06, EPIC-08, EPIC-10, EPIC-11 |
| EPIC-13 | Confirmed Audit Fixes | 1.6 | ready | EPIC-12 |
| EPIC-14 | Second Audit Confirmation And Closure | 1.7 | done | EPIC-13 |
| EPIC-15 | Phase 1 Closeout And Phase 2 Readiness | 1.9 | done | EPIC-14 |

## Phase 2 Epics

| Epic | Name | Phase | Status |
| --- | --- | --- | --- |
| EPIC-20 | Search Triage Core | 2 | done |
| EPIC-21 | Queue And Dashboard Follow-Up | 2 | done |

## Phase 2.5 Maintenance Epics

| Epic | Name | Phase | Status |
| --- | --- | --- | --- |
| EPIC-27 | Dependency And Toolchain Maintenance | 2.5 | done |
| EPIC-28 | Security Alert Closure | 2.6 | done |

## Phase 3 Epics

| Epic | Name | Phase | Status |
| --- | --- | --- | --- |
| EPIC-22 | Guided Apply Labs | 3 | done |
| EPIC-25 | Workflow Automation And Reminders | 3 | done |

## Phase 4 Epics

| Epic | Name | Phase | Status |
| --- | --- | --- | --- |
| EPIC-23 | HR Communication Hub | 4 | done |
| EPIC-29 | Post-Audit Reliability And Scoring | 4.1 | done |
| EPIC-30 | Final Security Tail Closure | 4.2 | ready |
| EPIC-31 | AI Assist Quality And Trust | 5 | active |
| EPIC-32 | Private Release Readiness | 5 | done |
| EPIC-33 | UI Foundation And Surface Consistency | 5.5 | ready |
| EPIC-34 | Workflow UX Refinement | 5.6 | ready |
| EPIC-35 | Runtime Stabilization And Surface Hardening | 5.7 | ready |
| EPIC-36 | Runtime Visual Consistency Consolidation | 5.8 | ready |
| EPIC-37 | Audit Closure And Trust Surface Alignment | 5.9 | ready |
| EPIC-38 | HH Visual Triage And Search Highlights MVP | 6.1 | done |

## Later Epics

| Epic | Name | Phase | Status |
| --- | --- | --- | --- |
| EPIC-09 | n8n And Telegram Webhook Events (re-open only after permission decision) | 4 | deferred |
| EPIC-24 | Multi-Site Adapter Expansion | 5 | backlog |
| EPIC-26 | Public Release And Store Readiness | 6 | backlog |

## Non-Negotiable Constraints

- No auto-submit.
- No auto-clicks on HH controls.
- No programmatic writes to HH form fields in Core.
- No hidden HH fetches.
- No broad permissions.
- AI and n8n are opt-in.
- All meaningful external payloads require preview or explicit settings.
