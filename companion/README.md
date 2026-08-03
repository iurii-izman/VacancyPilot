# VacancyPilot Ops Companion

Local FastAPI companion for the VacancyPilot browser extension.

## Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)

## Quick start

```bash
# Install dependencies
uv sync --project companion

# Run the companion (listens on 127.0.0.1:8765)
uv run --project companion uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8765

# Health check
curl http://127.0.0.1:8765/api/v1/health
```

## Development

```bash
# Format check
uv run --project companion --extra dev ruff format --check companion/

# Lint
uv run --project companion --extra dev ruff check companion/

# Type check
uv run --project companion --extra dev mypy companion/app/

# Run tests
uv run --project companion --extra dev pytest companion/tests/ -v

# Full verification (format, lint, typecheck, test, OpenAPI drift)
pnpm verify:companion

# Regenerate the canonical OpenAPI snapshot
pnpm companion:openapi

# Check the snapshot without modifying it
pnpm companion:openapi-check
```

## Architecture

- `app/main.py` — application factory (no import-time side effects)
- `app/config.py` — typed settings with safe local defaults
- `app/api/health.py` — public health endpoint
- `app/api/errors.py` — stable JSON error envelopes
- `app/observability/request_context.py` — request ID middleware

## API contract

The canonical OpenAPI snapshot is at `shared/contracts/openapi.json`.
Regenerate after endpoint changes.

## Database and migrations

The operational SQLite database defaults to
`companion/data/vacancypilot.db`. Override it with an absolute
`VACANCYPILOT_DB_PATH` when a different local location is required. Database
files and their WAL/SHM sidecars are local runtime data and must not be
committed.

The engine enables foreign keys and a 5-second busy timeout on every
connection. WAL is enabled deliberately for concurrent companion reads while
keeping SQLite as the single local writer.

From the repository root:

```bash
# Create or upgrade the local schema
uv run --project companion alembic -c companion/alembic.ini upgrade head

# Verify model metadata and the migration head agree
uv run --project companion alembic -c companion/alembic.ini check

# Disposable-development rollback only; back up user data first
uv run --project companion alembic -c companion/alembic.ini downgrade base
```

The companion does not silently run schema migrations at startup. Apply the
reviewed migration before using operational endpoints.
