# ADR-001: Local Companion Required for Application Ops

Status: ACCEPTED
Date: 2026-07-29
Epic: AOPS-00

## Context

The VacancyPilot browser extension (WXT, Manifest V3) already implements
local-first vacancy tracking, scoring, AI analysis, and cover letters. The
Application Ops MVP requires:

- Running Application Engine V4 (Python package with private candidate facts)
- Making official HH API calls with application/user tokens
- Storing structured relational data (SQLite) for analytics and pipeline
- Managing OS-level secrets (HH OAuth tokens, AI keys) outside browser storage
- Generating OpenAPI contracts for typed client generation

A Manifest V3 browser extension cannot:
- Run Python packages or native binaries
- Make direct HH API calls without exposing tokens in browser storage
- Host a relational database accessible to tooling
- Bind to OS keyring

## Decision

Introduce a **local loopback companion** — a FastAPI Python process that runs
on the user's machine, binds only to `127.0.0.1`, and communicates with the
extension over HTTP.

The companion is **not** a cloud backend. It runs on the same machine, stores
data in a local SQLite file, and has no internet-facing port.

## Consequences

### Positive
- Engine V4 can run natively in its Python environment
- HH tokens stay in OS keyring, never in browser storage
- SQLite enables rich queries, analytics, backup, and migration tooling
- FastAPI auto-generates OpenAPI 3.x schema for typed TypeScript client generation
- Security boundary is clear: loopback-only, no network exposure

### Negative
- User must install Python 3.12+ and `uv` (documented prerequisite)
- Companion is a separate process the user must start in P0; any OS auto-start
  integration requires a later explicit decision
- Adds a second storage system (Dexie + SQLite) requiring clear authority rules
- Extension must handle companion offline gracefully (Standalone Mode fallback)

### Neutral
- Increases architecture complexity but is the only viable option for the
  stated MVP requirements

## Rejected Options

### Option A: Extension-only (no companion)
Cannot run Engine V4 or make HH API calls with proper secret isolation.
Rejected as technically insufficient for MVP requirements.

### Option B: Cloud backend
Violates local-first principle. Adds server costs, latency, privacy risk,
and deployment complexity. Rejected per product principles §3.4 and §3.5.

### Option C: Streamlit/Electron desktop app
Would require a completely separate UI, abandoning the existing extension
investment. Rejected as duplicative and inconsistent with the browser-native
workflow.
