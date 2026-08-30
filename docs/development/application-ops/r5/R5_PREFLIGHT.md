# R5 Preflight

Date: 2026-08-31

Baseline was verified from the repository, not assumed: `main` and
`origin/main` are both `215ca476dcd01ca495355bb2cab14a685280c2eb`, and the
worktree was clean. The R4 closure is accepted; AOPS-14 is not started and
AOPS-15 is not complete.

The companion uses SQLite/Alembic as canonical Ops storage. The current
application status projection and canonical transition service are in
`companion/app/domain/workflow.py`; APPLIED requires explicit user
confirmation. Full V4 is a single-vacancy explicit action at
`POST /vacancies/{id}/analyze`, with input-hash cache and persisted
`token_input`, `token_output`, and `estimated_cost` on `engine_runs`.

Letters use the existing immutable `cover_letters`/`letter_versions` lifecycle
and explicit bridge/final/sent actions. Vacancy provenance currently comes
from HH search-profile sync; R5 adds a normalized many-to-many hit table.
Role-family representation was not persisted in the R4 vacancy projection, so
R5 adds a nullable field and preserves unknown when no deterministic value is
available. Existing analytics were not a supported conversion read model.

R5 adds migration `e5f7a9b1c3d4`, resumable human-controlled sessions, bounded
preview/execute endpoints, and local read-only descriptive analytics. No
provider, HH, external form, message, scheduler, telemetry, or secret flow is
introduced.
