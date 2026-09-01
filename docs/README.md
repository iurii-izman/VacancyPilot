# Documentation

VacancyPilot is a local-first, read-first HH.ru job-search copilot with two local surfaces: a WXT/Manifest V3 extension and an optional loopback FastAPI companion. Standalone Mode uses Dexie/IndexedDB as its canonical store; Ops Mode uses local SQLite authority with Dexie as cache/outbox metadata.

**Current status:** R5 and R5.1 accepted; dependency maintenance merged; **FEATURE DEVELOPMENT: FROZEN** / **MODE: REAL DAILY USE / DOGFOOD**. The next step is real-use evidence collection, not an old epic.

## Start Here: Project Memory Lite

- [`project-memory/README.md`](project-memory/README.md) — authority model and startup order
- [`project-memory/CURRENT_STATE.md`](project-memory/CURRENT_STATE.md) — current product/runtime truth
- [`project-memory/DECISIONS.md`](project-memory/DECISIONS.md) — accepted decision index
- [`project-memory/PARKED_AND_REJECTED.md`](project-memory/PARKED_AND_REJECTED.md) — preserved hard boundaries and deferred work

## Current Product and Operation

- [`../README.md`](../README.md) — external product overview
- [`ROADMAP.md`](ROADMAP.md) — dogfood objectives, hotfix criteria, deferred work and public-release backlog
- [`development/application-ops/IMPLEMENTATION_STATUS.md`](development/application-ops/IMPLEMENTATION_STATUS.md) — implementation status and validation evidence
- [`development/application-ops/r5/R5_DAILY_USE_READINESS.md`](development/application-ops/r5/R5_DAILY_USE_READINESS.md) — daily-use workflow and accepted R5 boundaries
- [`development/private-install-guide.md`](development/private-install-guide.md) — Standalone and Ops Mode setup

## Authority and Specification

- [`Техническое заданиеV.1.md`](Техническое%20заданиеV.1.md) — master product specification
- [`development/application-ops/README.md`](development/application-ops/README.md) — local companion hub
- [`development/application-ops/API_CONTRACT_V1.md`](development/application-ops/API_CONTRACT_V1.md) — local API contract
- [`development/application-ops/DATA_MODEL_V1.md`](development/application-ops/DATA_MODEL_V1.md) — storage authority and invariants
- [`development/application-ops/adr/`](development/application-ops/adr/) — accepted architecture decisions
- [`../shared/contracts/openapi.json`](../shared/contracts/openapi.json) — generated OpenAPI snapshot

## Privacy and Security

- [`../PRIVACY.md`](../PRIVACY.md) — browser and companion data flows
- [`../SECURITY.md`](../SECURITY.md) — safety boundaries and reporting
- [`development/privacy-policy-checklist.md`](development/privacy-policy-checklist.md) — public-release checklist
- [`development/public-release-prerequisites.md`](development/public-release-prerequisites.md) — later store/release work

## Historical Context

The development plan, epic/iteration packs, acceptance reports, audits and release notes are retained as historical evidence or planning context. They may contain old counts and next-step language; current-facing indexes point to Project Memory Lite and the accepted R5 operational documents.

## How to Read This Repo

| If you want to… | Start here |
| --- | --- |
| Start as a future agent/developer | [`project-memory/README.md`](project-memory/README.md) |
| Understand current product state | [`project-memory/CURRENT_STATE.md`](project-memory/CURRENT_STATE.md) |
| Verify implementation | [`development/application-ops/IMPLEMENTATION_STATUS.md`](development/application-ops/IMPLEMENTATION_STATUS.md) |
| Use the product daily | [`development/application-ops/r5/R5_DAILY_USE_READINESS.md`](development/application-ops/r5/R5_DAILY_USE_READINESS.md) |
| Understand product boundaries | [`Техническое заданиеV.1.md`](Техническое%20заданиеV.1.md), [`../SECURITY.md`](../SECURITY.md) |
| Investigate historical implementation | [`development/`](development/) and milestone reports |
| See deferred/public-release work | [`ROADMAP.md`](ROADMAP.md) |
| Report a security issue | [GitHub Security Advisory](https://github.com/iurii-izman/VacancyPilot/security/advisories/new) |
