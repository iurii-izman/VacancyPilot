# Data Model v1 — VacancyPilot Application Ops

Status: FROZEN PLANNING BASELINE (AOPS-00)

Canonical requirements:
`docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` §15.

This document fixes names, ownership, invariants, and minimum fields. AOPS-02
turns it into SQLAlchemy/Alembic definitions. Additional technical columns or
tables (for example idempotency records) require a migration and a reviewed
contract update; they may not weaken these domain requirements.

## Authority model

| Mode | Canonical store | Dexie role |
| --- | --- | --- |
| Standalone | Dexie/IndexedDB | Existing full local domain store |
| Ops | Companion SQLite | Cache, outbox, and sync metadata only |
| Migration | Dexie source, SQLite target | Read-only source until explicit import succeeds |

Entering Ops Mode is explicit. A failed preview/import does not change
authority. Returning temporarily offline in Ops Mode does not silently make
Dexie canonical; writes enter the outbox until the companion returns.

## SQLite domain tables

All timestamps are UTC. Application-generated IDs are stable UUIDs unless an
existing imported entity already has a stable compatible ID. JSON columns
contain versioned, validated JSON and never credentials.

### `vacancies`

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `source` | TEXT | NOT NULL; source namespace such as `hh` |
| `source_vacancy_id` | TEXT | NOT NULL; external vacancy ID |
| `url` | TEXT | Canonical user-visible URL |
| `title` | TEXT | NOT NULL |
| `company_id` | TEXT | External company/employer ID |
| `company_name` | TEXT | |
| `salary_min` | REAL | |
| `salary_max` | REAL | |
| `currency` | TEXT | |
| `work_mode` | TEXT | |
| `experience` | TEXT | |
| `description` | TEXT | User-visible normalized description |
| `description_hash` | TEXT | Hash of normalized description |
| `skills_json` | TEXT | Versioned JSON array |
| `first_seen_at` | TEXT | NOT NULL |
| `last_seen_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `archived` | INTEGER | NOT NULL, boolean projection |
| `revision` | INTEGER | NOT NULL; optimistic concurrency token |

Unique constraint: `(source, source_vacancy_id)`.

### `vacancy_snapshots`

Append-only.

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `vacancy_id` | TEXT | FK → `vacancies.id`, NOT NULL |
| `description_hash` | TEXT | NOT NULL |
| `payload_json` | TEXT | Versioned sanitized intake payload |
| `captured_at` | TEXT | NOT NULL |
| `capture_source` | TEXT | NOT NULL |
| `idempotency_key` | TEXT | UNIQUE retry identity; nullable for imported history |

### `applications`

Current state/projection. Every status/outcome change is paired transactionally
with a new `application_events` row.

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `vacancy_id` | TEXT | FK → `vacancies.id`, NOT NULL |
| `status` | TEXT | NOT NULL, current pipeline projection |
| `decision` | TEXT | Current explicit triage/user decision |
| `score` | REAL | Latest accepted score projection |
| `confidence` | REAL | Latest accepted confidence projection |
| `primary_proof` | TEXT | Safe evidence ID/summary, not an invented claim |
| `selected_profile_id` | TEXT | Stable existing profile ID |
| `selected_resume_id` | TEXT | Stable HH/local resume ID |
| `applied_at` | TEXT | Explicit user-recorded applied time |
| `next_action_at` | TEXT | |
| `revision` | INTEGER | NOT NULL; optimistic concurrency token |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### `application_events`

Append-only application timeline.

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `application_id` | TEXT | FK → `applications.id`, NOT NULL |
| `event_type` | TEXT | NOT NULL |
| `source` | TEXT | NOT NULL; user, local workflow, or verified sync |
| `payload_json` | TEXT | Versioned event payload |
| `occurred_at` | TEXT | NOT NULL; business occurrence time |
| `created_at` | TEXT | NOT NULL; persistence time |

### `engine_runs`

Append-only. Failed and invalid runs are retained honestly.

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `vacancy_id` | TEXT | FK → `vacancies.id`, NOT NULL |
| `engine_version` | TEXT | NOT NULL |
| `provider` | TEXT | NOT NULL |
| `model` | TEXT | |
| `prompt_version` | TEXT | NOT NULL |
| `input_hash` | TEXT | NOT NULL; deterministic cache/provenance key |
| `raw_output` | TEXT | Local raw provider/manual output |
| `validated_output` | TEXT | Structured validated JSON |
| `status` | TEXT | NOT NULL; success, invalid, error, etc. |
| `validation_errors_json` | TEXT | Sanitized structured validation failures |
| `token_input` | INTEGER | |
| `token_output` | INTEGER | |
| `estimated_cost` | REAL | |
| `created_at` | TEXT | NOT NULL |

No API key, authorization header, or provider secret is stored with a run.

### `evidence_usage`

Append-only evidence trace for an engine run.

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `engine_run_id` | TEXT | FK → `engine_runs.id`, NOT NULL |
| `requirement` | TEXT | Vacancy requirement being addressed |
| `evidence_level` | TEXT | V4 evidence level |
| `claim_id` | TEXT | Canonical claim ID, nullable |
| `case_id` | TEXT | Canonical case ID, nullable |
| `portfolio_id` | TEXT | Canonical portfolio ID, nullable |
| `allowed_wording` | TEXT | Literal wording boundary |

Referenced IDs must exist in the loaded validated Engine package. Generated
text is never promoted to evidence.

### `cover_letters`

Current aggregate/projection; immutable history remains in `letter_versions`.

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `application_id` | TEXT | FK → `applications.id`, NOT NULL |
| `mode` | TEXT | NOT NULL; API/manual bridge |
| `generated_text` | TEXT | Projection of generated/imported version |
| `sent_text` | TEXT | Projection of explicit sent snapshot |
| `is_final` | INTEGER | NOT NULL, boolean projection |
| `revision` | INTEGER | NOT NULL |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### `letter_versions`

Append-only.

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `cover_letter_id` | TEXT | FK → `cover_letters.id`, NOT NULL |
| `version_type` | TEXT | generated, imported, user draft, final, or sent |
| `body_text` | TEXT | NOT NULL |
| `source` | TEXT | NOT NULL |
| `provider` | TEXT | Nullable for local/manual edits |
| `model` | TEXT | |
| `prompt_version` | TEXT | |
| `created_at` | TEXT | NOT NULL |

An actually-sent version is immutable. “Copied” is not equivalent to “sent.”

### `followups`

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `application_id` | TEXT | FK → `applications.id`, NOT NULL |
| `reason` | TEXT | |
| `due_at` | TEXT | |
| `status` | TEXT | NOT NULL |
| `draft_text` | TEXT | Draft only; no automatic sending |
| `sent_at` | TEXT | Explicit user-recorded send time only |
| `revision` | INTEGER | NOT NULL |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### `interview_packs`

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `application_id` | TEXT | FK → `applications.id`, NOT NULL |
| `engine_run_id` | TEXT | FK → `engine_runs.id` |
| `content_json` | TEXT | Versioned structured pack |
| `export_path` | TEXT | Local safe path/reference, never arbitrary extraction |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `revision` | INTEGER | NOT NULL; optimistic concurrency token |

### `hh_accounts`

Account metadata only; no tokens.

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `hh_user_id` | TEXT | UNIQUE |
| `display_name` | TEXT | |
| `connected` | INTEGER | NOT NULL, boolean projection |
| `capabilities_json` | TEXT | Verified official capabilities |
| `last_sync_at` | TEXT | |
| `revision` | INTEGER | NOT NULL; optimistic concurrency token |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### `hh_sync_runs`

Append-only sync audit record.

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `sync_type` | TEXT | NOT NULL |
| `status` | TEXT | NOT NULL |
| `items_seen` | INTEGER | |
| `items_created` | INTEGER | |
| `items_updated` | INTEGER | |
| `error_summary` | TEXT | Sanitized; no response bodies/tokens |
| `started_at` | TEXT | NOT NULL |
| `finished_at` | TEXT | |

### `search_profiles`

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `id` | TEXT | PK |
| `name` | TEXT | NOT NULL |
| `query_json` | TEXT | NOT NULL, validated official API parameters |
| `enabled` | INTEGER | NOT NULL |
| `schedule` | TEXT | Nullable; P1 scheduler remains disabled by default |
| `last_run_at` | TEXT | |
| `revision` | INTEGER | NOT NULL |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### `settings`

Non-secret companion settings.

| Column | Type | Constraint/meaning |
| --- | --- | --- |
| `key` | TEXT | PK |
| `value_json` | TEXT | NOT NULL |
| `revision` | INTEGER | NOT NULL |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

Provider/HH keys, OAuth tokens, pairing codes, and raw client tokens are never
settings values.

## Dexie schema extension

The next Dexie version preserves all existing tables and adds exactly:

### `syncOutbox`

| Field | Meaning |
| --- | --- |
| `id` | Stable UUID primary key |
| `sequence` | Monotonic local FIFO sequence |
| `entityType` | Versioned entity/command type |
| `operation` | Target operation |
| `payload` | Versioned sanitized command payload |
| `payloadVersion` | Required payload schema discriminator |
| `idempotencyKey` | Stable retry key |
| `expectedRevision` | Nullable optimistic revision |
| `createdAt` | UTC creation time |
| `retryCount` | Bounded retry count |
| `nextAttemptAt` | Earliest eligible retry time |
| `lastError` | Sanitized error code/summary |
| `status` | Pending, retrying, dead, or visible conflict state |

Minimum Dexie index contract from the MVP:
`&id, entityType, operation, createdAt, retryCount`.

### `opsCache`

| Field | Meaning |
| --- | --- |
| `key` | Stable cache key |
| `entityType` | Cached contract/entity type |
| `entityId` | Stable entity ID |
| `payload` | Versioned sanitized response |
| `revision` | Server revision represented by the entry |
| `updatedAt` | UTC refresh time |
| `expiresAt` | Optional freshness boundary |

### `opsMeta`

| Field | Meaning |
| --- | --- |
| `key` | Metadata key |
| `value` | Versioned non-secret metadata |
| `updatedAt` | UTC update time |

`opsMeta` records mode/migration/sync cursors; it never stores credentials.
Extension UI settings continue through the existing settings bridge. In Ops
Mode, provider and HH secrets live only in OS keyring.

## Required invariants

1. SQLite is canonical only after explicit successful entry into Ops Mode.
2. Dexie remains canonical in Standalone Mode.
3. Events, letter versions, engine runs, and snapshots are append-only.
4. Status/current-letter/current-score fields are projections updated in the
   same transaction as their source event/version/run.
5. Sent letter versions are immutable.
6. All optimistic writes compare `revision`; stale writes return `409`.
7. Intake is idempotent by `(source, source_vacancy_id)` plus request key.
8. No secret enters SQLite, Dexie domain tables, exports, backups, logs,
   fixtures, screenshots, or Git.
9. In Standalone Mode, the pre-existing BYOK bridge remains unchanged. In Ops
   Mode, programmatic provider and HH credentials live only in OS keyring. The
   manual bridge requires no API key.
10. Foreign keys are enforced and delete behavior is explicit; append-only
    audit rows are not silently cascaded away.
11. All JSON payloads have a schema/version discriminator before migration or
    long-term persistence.
12. All user-visible deletion/import/restore operations have preview and
    confirmation semantics.

## Conflict and migration policy

1. Migration begins with a read-only snapshot and preview.
2. Entities absent from SQLite may be imported with stable IDs.
3. Natural-key duplicates are compared and reported.
4. Append-only records deduplicate only by stable ID/idempotency key or an
   explicitly defined content hash; they are never collapsed by “latest wins.”
5. Mutable projections/settings use `expectedRevision`. A mismatch is a
   conflict, not an automatic timestamp overwrite.
6. Every conflict is returned in the migration/sync report for explicit user
   resolution.
7. Failed/cancelled import leaves Dexie canonical and SQLite changes rolled
   back.
8. No destructive merge is silent.
