# Prompt AOPS-01 — Companion Foundation

Implement only epic `AOPS-01` in the open VacancyPilot repository root.

## Goal

Create a production-shaped but minimal local FastAPI companion with repeatable
quality commands, configuration, versioned health API, OpenAPI snapshot and
tests. Do not implement domain behavior yet.

## Read first

1. `AGENTS.md`
2. `docs/development/CODEX-RUNTIME-BRIEF.md`
3. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 5–7, 16, 19–22
4. `docs/development/application-ops/README.md`
5. ADR-001 and ADR-003
6. `API_CONTRACT_V1.md`

## Preconditions

- `AOPS-00` is committed.
- Clean `codex/application-ops-mvp` worktree.
- Python 3.12+ and `uv` are available. If not, report BLOCKED; do not silently
  replace the agreed toolchain.

## Required work

Create:

```text
companion/
├─ pyproject.toml
├─ uv.lock
├─ README.md
├─ app/
│  ├─ __init__.py
│  ├─ main.py
│  ├─ config.py
│  ├─ api/
│  │  ├─ __init__.py
│  │  ├─ errors.py
│  │  └─ health.py
│  └─ observability/
│     └─ request_context.py
└─ tests/
   ├─ conftest.py
   └─ test_health.py
```

Implement:

- application factory, not import-time global side effects;
- API base `/api/v1`;
- `GET /api/v1/health`;
- typed health response with service version, API version, status and
  `request_id`;
- stable JSON error envelope for validation and unhandled server errors;
- `X-VacancyPilot-Request-ID` acceptance/generation with safe length/charset;
- environment/config model with defaults safe for local development;
- bind command documented as `127.0.0.1:8765`, never `0.0.0.0`;
- deterministic OpenAPI generation script and sanitized checked-in snapshot
  under `shared/contracts/`;
- graceful startup/shutdown hooks ready for later DB/services;
- no network calls on import/startup.

Add canonical root commands. Prefer package scripts such as:

```text
companion:format-check
companion:lint
companion:typecheck
companion:test
verify:companion
verify:all
```

Use `uv run --project companion ...` or an equivalent documented
repository-root command.

## Dependencies

Use only the stack approved by the MVP. Keep dependencies minimal. Pin/lock
them through `uv`; do not add Docker or a second frontend.

## Tests

Cover:

- health 200 contract;
- API/version fields;
- supplied request ID echo;
- generated request ID;
- validation error envelope;
- OpenAPI snapshot generation is deterministic;
- importing the app does not bind a socket or call external services.

## Non-goals

- no SQLite schema/Alembic;
- no CORS/pairing/keyring;
- no extension integration;
- no HH/AI/engine endpoints;
- no fake domain endpoints;
- no packaging installer.

## Acceptance criteria

- documented local startup succeeds on loopback;
- health endpoint and error envelope are tested;
- root companion verification command passes;
- OpenAPI snapshot can be regenerated without diff;
- existing extension verification remains green;
- no runtime permissions or product behavior changed.

## Validation

```powershell
pnpm verify:companion
pnpm verify
pnpm test:release
git diff --check
```

If exact root script names differ, document and run the canonical equivalents.

## Handoff

Do not commit or push. Include dependency list and lockfile changes.

Expected reviewed commit message:

```text
feat: add local Ops companion foundation
```
