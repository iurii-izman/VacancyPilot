# R3 Preflight

Date: 2026-08-30

## Git baseline

- repository: `C:/Dev/VacancyPilot`
- branch: `main`
- actual main SHA: `ce62c51c87bf2fbc43b88db67b54a970a018f69b`
- origin/main SHA: `ce62c51c87bf2fbc43b88db67b54a970a018f69b`
- working tree: clean apart from the user-supplied untracked master prompt
- AOPS-09: accepted on main (`ce62c51`)
- push: not performed

## Tooling

- Node: `v24.18.0`
- pnpm: `11.1.1`
- Python: `3.12.10`
- uv: `0.9.30`
- WXT: `0.20.26` (package lock)

## Runtime baseline

- Alembic migration head: `c2a9e09add09`
- OpenAPI snapshot: current (`pnpm companion:openapi-check` PASS)
- HH application token configured: YES (boolean-only probe; secret not read into output)
- private V4 runtime tracked: NO; ignored local runtime is present as expected

## Preflight commands

`git diff --check` passed. Existing worktrees were inspected and left unchanged.
