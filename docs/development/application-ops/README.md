# VacancyPilot Application Ops — Documentation Hub

This hub describes the accepted local companion and operational product state. It is current-facing documentation, not a new implementation queue.

Canonical MVP specification: [`docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md`](../../mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md)
Pinned SHA-256: `5ABDC4B3AE59029BB3159CA8F3FE2D82C58B37660396D53F3904FE0F32662C08`

## Current accepted state

- AOPS-00 through AOPS-13 are landed/accepted where recorded in [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).
- R5 is a deliberate post-AOPS-13 product milestone: the human-controlled Application Factory and bounded descriptive Conversion Intelligence are accepted.
- R5 manual browser QA is PASS with synthetic local data.
- R5.1 Project Memory Lite is accepted/pushed.
- Dependency maintenance is merged; current audit counts belong in the project current-state snapshot, not in historical acceptance reports.
- **FEATURE DEVELOPMENT: FROZEN** — **MODE: REAL DAILY USE / DOGFOOD**.

## Sequence status

The original AOPS decomposition is preserved as historical planning context. It is not an active next-step marker during dogfood:

```text
AOPS-00..AOPS-13  landed / accepted where supported
R5                accepted post-AOPS-13 milestone
AOPS-14           deferred / not started
AOPS-15           incomplete; bounded R5 slice accepted
AOPS-16..AOPS-18  not active during dogfood freeze
```

Do not mark R5 as canonical AOPS-15 completion. The next work is evidence collection from real vacancies and applications; a future feature milestone must be selected from that evidence.

## Read order

1. [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) — current baseline and validation
2. [`API_CONTRACT_V1.md`](API_CONTRACT_V1.md) — local API contract
3. [`DATA_MODEL_V1.md`](DATA_MODEL_V1.md) — SQLite/Dexie authority and invariants
4. [`R5_DAILY_USE_READINESS.md`](r5/R5_DAILY_USE_READINESS.md) — daily operation
5. [`adr/`](adr/) — accepted architecture decisions

## Key decisions

| Decision | ADR | Summary |
| --- | --- | --- |
| Local companion | ADR-001 | Loopback FastAPI keeps Engine V4, relational storage and secrets local without a cloud backend |
| Storage authority | ADR-002 | SQLite canonical in Ops Mode; Dexie canonical in Standalone Mode and cache/outbox in Ops Mode |
| API contract | ADR-003 | Generated OpenAPI is canonical |
| HH boundary | ADR-004 | Official read-only HH API through companion; extension page access is read-only DOM inspection |
| Engine privacy | ADR-005 | Real V4 candidate knowledge stays outside the repository |
| AI provider boundary | ADR-006 | OpenAI BYOK plus manual bridge; no automatic provider expansion |

## Cross-references

- Implementation pack: [`../application-ops-pack/`](../application-ops-pack/)
- Epic map and gates: [`../application-ops-pack/EPIC_MAP.md`](../application-ops-pack/EPIC_MAP.md)
- Master specification: [`../../Техническое%20заданиеV.1.md`](../../Техническое%20заданиеV.1.md)
