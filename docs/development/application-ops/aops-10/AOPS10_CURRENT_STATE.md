# AOPS-10 Current State

The canonical SQLite domain already contains `vacancies`,
`vacancy_snapshots`, `hh_accounts`, `hh_sync_runs`, and `search_profiles` in
`companion/app/db/models.py`. The current migration head is
`c2a9e09add09`; no duplicate HH persistence tables are needed.

Existing reusable boundaries are:

- `app.security.keyring.SecretSlot` and `OSKeyring` for secrets;
- `app.domain.vacancy_intake.VacancyIntakeService` for normalized upsert,
  deduplication, snapshot-on-change, and idempotency;
- `app.domain.triage` for deterministic Stage A;
- authenticated FastAPI routers under `app.api`;
- generated/checkable `shared/contracts/openapi.json`;
- extension `OpsClient` and `CompanionSettings` for loopback Ops Mode.

There is no existing HH client, HH search-profile route, public HH sync route,
or HH settings UI. AOPS-10 adds one companion-side integration boundary and
extends the existing settings surface.
