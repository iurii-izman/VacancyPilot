# ADR-002: SQLite/Dexie Authority Model

Status: ACCEPTED
Date: 2026-07-29
Epic: AOPS-00

## Context

The Application Ops MVP introduces SQLite (via companion) alongside the
existing Dexie/IndexedDB storage in the extension. Both stores can hold
overlapping entities (vacancies, applications, letters).

We need a clear authority rule to prevent split-brain conflicts and ensure
the user sees consistent data regardless of which surface they open.

## Decision

Three-mode authority model:

| Mode | Canonical Store | Dexie Role | Trigger |
| --- | --- | --- | --- |
| Standalone | Dexie | Full canonical | Companion absent or unpaired |
| Ops | SQLite | Cache + outbox | Companion paired and reachable |
| Migration | SQLite (target), Dexie (source) | Read-only source | First pairing after upgrade |

In **Ops Mode**:
- SQLite is the source of truth for all domain entities
- Dexie holds a read-through cache for UI performance
- Writes go through the companion API; Dexie outbox queues writes when offline
- On reconnect, outbox is drained with idempotency keys

In **Standalone Mode**:
- Extension operates exactly as it does today (pre-AOPS)
- All reads/writes go through Dexie
- No companion communication attempted

The extension derives an effective mode centrally. Ops is effective only when
the persisted user intent is enabled and authority metadata is the committed
`ops` state. Enabled intent with `standalone` or `migration` authority remains
safe Standalone/pending migration. Disabling intent makes Standalone effective
before stale authority metadata is normalized. UI capabilities and action-time
guards use this effective mode together with Companion connectivity and pairing
validity; they do not infer authority from a settings toggle alone.

The extension uses `X-VacancyPilot-Idempotency-Key` as the canonical HTTP
idempotency header. Outbox delivery is blocked without changing pending rows
whenever effective mode is not Ops.

## Consequences

### Positive
- Clear authority prevents data conflicts
- Existing Standalone Mode is preserved without changes
- Offline writes are queued safely with idempotency
- Migration is explicit and user-visible, not automatic

### Negative
- Dual-storage adds complexity in Ops Mode
- Cache invalidation between SQLite and Dexie must be handled carefully
- Migration UX must be designed for clarity (AOPS-05)

## Rejected Options

### Option A: SQLite-only, drop Dexie
Would break Standalone Mode and require companion always running.
Violates "works without companion" constraint.

### Option B: Dexie-only, no SQLite
Cannot support Engine V4 analysis storage, analytics queries, or
proper relational backup. See ADR-001.

### Option C: Last-write-wins sync
Conflict-prone. Users could lose data edited on one surface while
another surface had stale state. Rejected as unreliable.
