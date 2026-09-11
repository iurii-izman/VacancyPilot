# Documentation

VacancyPilot is a local-first, read-first HH.ru job-search copilot. The
extension is the standalone surface; an optional loopback FastAPI companion
adds SQLite-backed operations and official read-only HH API access.

## Current truth

- [`project-memory/CURRENT_STATE.md`](project-memory/CURRENT_STATE.md) is the
  current status snapshot.
- [`../README.md`](../README.md) is the product overview and quick start.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) describes the runtime boundaries.
- [`development/application-ops/r5/R5_DAILY_USE_READINESS.md`](development/application-ops/r5/R5_DAILY_USE_READINESS.md)
  is the daily workflow.
- [`development/application-ops/IMPLEMENTATION_STATUS.md`](development/application-ops/IMPLEMENTATION_STATUS.md)
  is the implementation evidence index.

## Setup and operation

- [`development/LOCAL_SELF_CONTAINED_SETUP.md`](development/LOCAL_SELF_CONTAINED_SETUP.md)
  — local paths, private engine installation and Companion startup
- [`../companion/README.md`](../companion/README.md) — Companion commands,
  migrations and generated contract
- [`V4_ENGINE.md`](V4_ENGINE.md) — private engine boundary and Preview/Execute
  semantics
- [`TESTING.md`](TESTING.md) — verification commands and no-provider-call rule

## Authority

- [`project-memory/README.md`](project-memory/README.md) — authority order and
  startup protocol
- [`Техническое%20заданиеV.1.md`](Техническое%20заданиеV.1.md) — master product
  specification and boundaries
- [`../shared/contracts/openapi.json`](../shared/contracts/openapi.json) —
  generated Companion API snapshot
- [`development/application-ops/adr/`](development/application-ops/adr/) —
  accepted architecture decisions
- Runtime code, migrations and tests remain authoritative for implemented
  behavior.

## Privacy and release

- [`../PRIVACY.md`](../PRIVACY.md) — storage and data-flow disclosure
- [`../SECURITY.md`](../SECURITY.md) — security policy and hard boundaries
- [`ROADMAP.md`](ROADMAP.md) — dogfood observation gate and deferred work
- [`development/privacy-policy-checklist.md`](development/privacy-policy-checklist.md)
  and [`development/public-release-prerequisites.md`](development/public-release-prerequisites.md)
  — later public-release work

Historical acceptance reports remain evidence and are dated as such. Retired
executor packs, planning dumps and stale “current state” notes are not part of
the active documentation surface; use Git history when an old artifact is
needed.
