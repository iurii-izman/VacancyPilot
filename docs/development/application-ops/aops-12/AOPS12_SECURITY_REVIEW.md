# AOPS-12 Security Review

Date: 2026-08-30

## Findings

| Area | Severity | Result |
|---|---|---|
| Candidate evidence/private bodies | P0/P1 | no raw private evidence is rendered |
| Provider output/secrets | P0/P1 | no provider call on load; no raw output, token or key in UI |
| OAuth/HH | P0/P1 | no new token storage or direct HH request; external link is explicit |
| HTML/XSS | P0/P1 | vacancy description is rendered as text (`white-space: pre-wrap`), not HTML |
| Query/filter injection | P0/P1 | server filters are bounded FastAPI query values; client uses URLSearchParams |
| Batch AI trigger | P0/P1 | none; analysis is not exposed as an automatic list action |
| Dexie/Ops authority | P0/P1 | connected view reads companion; offline/unavailable view uses existing local fallback |

No P0 or P1 findings remain. The existing release-safety suites also pass.

## Boundary confirmation

The change adds no HH write, form automation, hidden HH request, external
message send, credential field, telemetry, private V4 package, or second
frontend. HH denied capabilities remain unavailable rather than being mapped to
zero.

## Manual QA

Not run: this repository has no established browser/Playwright preview harness.
The production build completed successfully; desktop/narrow, standalone,
connected companion, offline companion and partial-capability visual checks
remain a manual follow-up.
