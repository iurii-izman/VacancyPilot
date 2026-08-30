# R1 Worktree Inventory — Recovery Milestone R1

Captured: 2026-08-30 18:25 local.

| Worktree | HEAD | Branch | Dirty | Classification |
|---|---|---|---|---|
| `C:/Dev/VacancyPilot` | `169bb5c` | `main` | clean | CLEAN_ACTIVE |
| `.claude/worktrees/elastic-mcclintock-030fcc` | `a322177` | `claude/elastic-mcclintock-030fcc` | 17 modified + 23 untracked | DIRTY_UNKNOWN (branch already merged into main; leftover working-tree state) |
| `.claude/worktrees/great-spence-0fa731` | `169bb5c` | `claude/great-spence-0fa731` | 3 modified + 9 untracked | DIRTY_RECOVERY (AOPS-08 candidate) |
| `.claude/worktrees/quizzical-haibt-c77dcd` | `dad0061` | `claude/quizzical-haibt-c77dcd` | 24 modified + 14 untracked | DIRTY_UNKNOWN (branch already merged into main; leftover working-tree state) |
| `.claude/worktrees/relaxed-tu-853f9f` | `cdc27d1` | detached | clean | CLEAN_STALE |
| `.claude/worktrees/vibrant-hamilton-c85880` | `169bb5c` | detached | clean | CLEAN_STALE |

## great-spence-0fa731 (recovery candidate) — exact status

```
 M companion/app/main.py
 M docs/development/application-ops/IMPLEMENTATION_STATUS.md
 M shared/contracts/openapi.json
?? companion/app/analysis/
?? companion/app/api/analysis.py
?? companion/tests/openapi_snapshot.json
?? companion/tests/test_analysis.py
```

Untracked expansion (9 files): `companion/app/analysis/__init__.py`,
`companion/app/analysis/compiler.py`, `companion/app/analysis/engine.py`,
`companion/app/analysis/models.py`, `companion/app/analysis/providers.py`,
`companion/app/analysis/validators.py`, `companion/app/api/analysis.py`,
`companion/tests/openapi_snapshot.json`, `companion/tests/test_analysis.py`.

## Backup

All three dirty worktrees backed up to
`C:/Dev/VacancyPilot-recovery-backups/20260830-182526/` **before** any
modification. See `R1_RECOVERY_BACKUP_MANIFEST.md`.
