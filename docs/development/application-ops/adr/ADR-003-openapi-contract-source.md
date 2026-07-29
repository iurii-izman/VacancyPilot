# ADR-003: OpenAPI as Canonical API Contract Source

Status: ACCEPTED
Date: 2026-07-29
Epic: AOPS-00

## Context

The companion exposes a REST API consumed by the extension's TypeScript
client. We need a way to keep the TypeScript request/response types in
sync with the Python FastAPI server without hand-maintaining duplicate
interfaces.

## Decision

FastAPI's auto-generated OpenAPI 3.x schema is the **canonical contract
source**. A checked-in snapshot (`companion/openapi.json`) is used to:

1. Generate TypeScript types via a code-generation tool (e.g., `openapi-typescript`)
2. Validate the running companion against the frozen contract in CI
3. Serve as the reviewable diff when endpoints change

Hand-maintained duplicate TypeScript interfaces are forbidden for companion
API types. The generated types are the single source of truth for the
extension client.

Before the companion exists, `API_CONTRACT_V1.md` is the reviewed planning
baseline. AOPS-01 must generate an OpenAPI snapshot conforming to it. After
that point, OpenAPI becomes executable authority; changing the frozen surface
requires a reviewed contract/ADR update rather than silent drift.

## Consequences

### Positive
- Single source of truth eliminates drift between server and client
- Contract changes are visible in code review as OpenAPI diff
- CI can validate that the running server matches the checked-in schema
- Standard tooling (`openapi-typescript`, `openapi-generator`) works out of the box

### Negative
- Generated TypeScript types may be less ergonomic than hand-crafted ones
- Requires a build step to regenerate types when the contract changes
- OpenAPI snapshot must be kept in sync with the running server

### Neutral
- Type generation is a development-time concern; runtime uses the generated output

## Rejected Options

### Option A: Hand-maintained TypeScript interfaces + separate Python Pydantic models
Duplicate source of truth. Drift is inevitable. Manual sync is error-prone.
Rejected as unsustainable.

### Option B: Shared JSON Schema, hand-written on both sides
Adds maintenance burden without tooling benefits. Rejected.

### Option C: gRPC/protobuf
Over-engineering for a local-only API. Adds build complexity disproportionate
to the problem. Rejected.
