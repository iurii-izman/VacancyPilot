# ADR-004: HH Official API Only — Read-Only Boundary

Status: ACCEPTED
Date: 2026-07-29
Epic: AOPS-00

## Context

The Application Ops MVP needs to interact with HH.ru data: search vacancies,
sync application statuses, and retrieve resumes. The existing extension already
parses HH pages via content scripts (read-only DOM inspection).

We must define the boundary between extension-side HH access and companion-side
HH access to prevent violating product constraints.

## Decision

**All programmatic HH API calls go through the companion, using official
documented endpoints only.** The extension never makes hidden fetch/XHR
requests to HH.

Extension HH access remains:
- Content script DOM parsing (read-only inspection of open pages)
- No cookies, sessions, or HH auth tokens in extension storage

Companion HH access:
- Official `https://api.hh.ru/` endpoints via `httpx`
- Application token for public endpoints (search, vacancy detail)
- User OAuth token for authenticated endpoints (resumes, negotiations)
- Tokens stored in OS keyring, never in browser storage or SQLite
- `HH-User-Agent` header sent per API requirements
- Rate limiting respected (429 backoff)
- No POST/PUT/DELETE to application/negotiation endpoints (read-only)

## Consequences

### Positive
- Clear security boundary: extension has no HH auth tokens
- Companion can implement proper OAuth PKCE flow with redirect URI handling
- HH API compliance: official endpoints only, proper User-Agent
- Token refresh logic centralized in companion

### Negative
- Extension cannot call HH API directly, even for public data
- Companion must be running for any HH API access (search requires Ops Mode)
- Adds latency (extension → companion → HH API)

### Neutral
- Content script parsing continues to work independently for page-level data

## Rejected Options

### Option A: Extension calls HH API directly
Would require HH tokens in browser storage. Violates security constraint
§25.2.5 ("No refresh token in extension storage"). Rejected.

### Option B: Extension uses unofficial/internal HH endpoints
Violates product constraint §6.2. Rejected as policy violation.

### Option C: Companion has write access to HH applications
Violates product constraint against auto-apply. Rejected.
