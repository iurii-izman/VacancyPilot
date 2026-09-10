# Application Ops

This folder records the current local Companion/Application Ops surface. It is
not an active epic queue.

## Current state

- The generated OpenAPI snapshot at
  [`../../../shared/contracts/openapi.json`](../../../shared/contracts/openapi.json)
  is the API contract. FastAPI routes and tests are executable authority.
- SQLite plus Alembic is canonical in Ops Mode. Dexie remains the extension
  cache/outbox and standalone canonical store.
- Ops UI reads the derived, authenticated `/api/v1/ops/work-items` projection;
  it is not a persisted third authority. Inbox is Vacancy-based, Pipeline is
  Application-based, and no-Application/unknown states remain explicit.
- The R5 Application Factory is bounded and human-controlled: Preview is
  provider-free, execution is explicitly confirmed, and queue preparation does
  not create an application or `APPLIED` state.
- HH browser interaction remains read-only. A user must apply externally and
  explicitly confirm `APPLIED`.
- Feature development is frozen while dogfood evidence is collected.

## Read order

1. [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) — evidence index
2. [`r5/R5_DAILY_USE_READINESS.md`](r5/R5_DAILY_USE_READINESS.md) — daily flow
3. [`../../../ARCHITECTURE.md`](../../../ARCHITECTURE.md) — boundaries
4. [`../../../V4_ENGINE.md`](../../../V4_ENGINE.md) — engine semantics
5. [`adr/`](adr/) — accepted decisions

## Options and route truth

The Options app keeps compatibility routes for Inbox and Applications; both
open the application workspace, while Summary is a separate performance view.
Companies, Letters and Events are visible placeholders; Interview is deferred;
Labs, Export, Settings, Privacy, Permissions, Companion, About, Onboarding and
Debug are separate sections. Do not describe placeholders as implemented
backend capabilities.

## Accepted decisions

ADR-001 covers the loopback Companion, ADR-002 storage authority, ADR-003 the
generated OpenAPI source, ADR-004 the read-only HH boundary, ADR-005 private V4
placement, and ADR-006 the opt-in AI/provider boundary.

Older AOPS acceptance and recovery reports are historical snapshots. They may
mention commands, versions or routes that no longer describe the current
checkout.
