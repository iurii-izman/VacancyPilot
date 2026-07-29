# VacancyPilot Application Ops — Documentation Hub

Canonical MVP specification:
[`docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md`](../../mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md)

Pinned SHA-256:
`5ABDC4B3AE59029BB3159CA8F3FE2D82C58B37660396D53F3904FE0F32662C08`

## Read Order

1. `IMPLEMENTATION_STATUS.md` — current baseline and epic completion status
2. `API_CONTRACT_V1.md` — frozen v1 local API contract
3. `DATA_MODEL_V1.md` — SQLite schema, invariants and authority rules
4. `adr/` — architecture decision records (ADR-001 through ADR-006)

## Epic Sequence

```text
AOPS-00 Baseline and contract freeze ✓
  ↓
AOPS-01 Companion foundation ← NEXT AFTER REVIEWED COMMIT
  ↓
AOPS-02 SQLite domain and migrations
  ↓
AOPS-03 Localhost security, pairing and secrets
  ↓
AOPS-04 Extension Ops client and offline mode
  ↓
AOPS-05 Dexie migration and outbox
  ↓
AOPS-06 Vacancy intake, deduplication and local triage
  ↓
AOPS-07 Engine package, deterministic index and health
  ↓
AOPS-08 Full V4 analysis, providers and literal validation
  ↓
AOPS-09 Letter lifecycle, manual bridge and generated/sent diff
  ↓
AOPS-10 HH public API and search profiles
  ↓
AOPS-11 HH OAuth and read-only applicant sync
  ↓
AOPS-12 Command Center, Inbox and Application Card
  ↓
AOPS-13 Pipeline, events and follow-ups
  ↓
AOPS-14 Interview Pack
  ↓
AOPS-15 Analytics and production pilot
  ↓
AOPS-16 Backup, restore, privacy and debug bundle
  ↓
AOPS-17 E2E, browser QA and release 0.2.0
  ↓
AOPS-18 Conditional P1 enhancements
```

## Key Decisions Frozen in AOPS-00

| Decision | ADR | Summary |
| --- | --- | --- |
| Local companion required | ADR-001 | Extension cannot host Engine V4, AI providers, or HH API client securely |
| SQLite canonical in Ops Mode | ADR-002 | Dexie canonical in Standalone Mode; SQLite canonical in Ops Mode |
| OpenAPI is contract source | ADR-003 | FastAPI generates canonical schema; TypeScript contracts derived from it |
| Official HH API only | ADR-004 | No extension-side hidden HH requests; loopback companion proxies official API |
| Engine package privacy | ADR-005 | Real V4 candidate knowledge not committed; synthetic fixtures in repo |
| AI provider boundary | ADR-006 | DeepSeek coding tool ≠ product provider; P0 is OpenAI BYOK + manual bridge |

## Cross-references

- Implementation pack: `docs/development/application-ops-pack/`
- Epic map and gates: `docs/development/application-ops-pack/EPIC_MAP.md`
- Existing extension epics: `docs/development/epics/`
- Master specification: `docs/Техническое заданиеV.1.md`
