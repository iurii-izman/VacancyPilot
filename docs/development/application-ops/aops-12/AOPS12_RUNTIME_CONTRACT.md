# AOPS-12 Runtime Contract

## Frontend and modes

The existing Options dashboard remains the only frontend and React root.
Standalone Mode continues to use Dexie and must remain useful without the
companion. Ops Mode uses SQLite through typed loopback APIs; Dexie cache/outbox
is non-authoritative. Offline or incompatible Ops data renders an explicit
unavailable state and does not break local sections.

## Action-oriented data

Every Command Center count has a defined query and a destination in the Inbox,
Kanban or a filtered application view. No decorative or fabricated metrics are
allowed. Follow-up/interview/backup cards are unavailable until real supported
data exists.

## Safety and capability honesty

- HH account is `AVAILABLE`; resumes and negotiations are `DENIED_BY_HH`; HH
  writes are `FORBIDDEN_BY_PRODUCT`.
- A denied capability is never shown as zero items.
- Loading the dashboard never calls an AI provider or creates an application.
- Opening a vacancy never means applied. Copying is not sending. A final letter
  is not a sent application.
- Full V4 analysis is an explicit single-item action only.
- No HH form writes, hidden HH requests, external message sending, or auto-apply.

## Application Card

Tabs are Overview, Vacancy, Evidence, Score, Letter, Timeline, Follow-up,
Interview and Debug. AOPS-12 fully wires the first five plus safe Debug
metadata. Timeline shows only existing safe history; Follow-up and Interview
remain explicit not-yet-active/current-placeholder states.

Evidence is bounded to persisted requirement, evidence level, safe IDs, allowed
wording, source type and boundary/risk metadata. Generated/provider text and
private evidence bodies are not evidence and are not exposed. Score surfaces
only persisted values, including hard gates/caps and decision/confidence.
Letter uses the existing AOPS-09 lifecycle and preserves generated/final/sent
invariants.

## API discipline

FastAPI-generated OpenAPI remains canonical. Any added endpoint is bounded,
validated, sanitized, and mirrored in typed consumers. Existing pagination and
error envelopes are reused. No parallel Inbox table or duplicate DTO model is
permitted.
