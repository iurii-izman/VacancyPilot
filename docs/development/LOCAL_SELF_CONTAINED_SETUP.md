# Local self-contained setup

VacancyPilot keeps public source in Git and local-only runtime material under
the ignored `.local/` directory at the repository root.

## Canonical local paths

- `.local/private-engine/` — private V4 package source. It must contain the
  validated package root with `active/`, `manifest.json`, `checksums.sha256`,
  and the V4 project-instructions file.
- `.local/data/companion/engine/` — installed active engine package used by
  Companion.
- `.local/data/companion/vacancypilot.db` — canonical Companion SQLite DB.
- Other `.local/` subdirectories may contain local process state or audit
  output; they are not public inputs and are not required by the launcher.

The real candidate evidence is inside the private engine package's `active/`
directory. It is never copied into public fixtures or tracked files.

## Engine setup and verification

From any working directory, run the commands from the repository root:

```powershell
uv run --project companion vacancypilot-engine install
uv run --project companion vacancypilot-engine verify
```

The install command uses `.local/private-engine/` by default. An explicit
`--source` or `VACANCYPILOT_V4_PACKAGE_SOURCE` override is available for a
deliberate local package change. There is no fallback to a sibling project.

## Companion database

`pnpm companion:start` resolves its default DB from the repository root and
uses `.local/data/companion/vacancypilot.db`. `-DbPath` remains available for
isolated tests or deliberate migrations. The launcher changes to the
repository root before running Alembic and then starts the project-owned
`uv run --project companion --directory companion python -m app.server`
entrypoint, so the caller's current directory does not affect the selected app
or database. That entrypoint validates the loopback bind before starting and
uses `127.0.0.1:8765` by default. It upgrades the schema to the current
Alembic head before starting the server.

## Privacy boundary

`.local/` is ignored by Git. Do not add candidate evidence, private engine
files, SQLite databases, credentials, pairing state, or runtime logs to public
fixtures or documentation. Secrets continue to use the existing OS keyring
integration.
