# R1 AOPS-08 Recovery Map

Recovery source: `C:/Dev/VacancyPilot/.claude/worktrees/great-spence-0fa731`
(worktree HEAD = `169bb5c` = main HEAD; all candidate work is uncommitted).

Merge-base with main: `169bb5c` (identical). All candidate content is in the
working tree (3 modified + 9 untracked files, ~3.6k lines).

## File classification

| File | Purpose | Class | Duplicate in main? | Private-data risk | Action |
|---|---|---|---|---|---|
| `companion/app/analysis/__init__.py` | package exports | AOPS08_CORE | no | none | TAKE |
| `companion/app/analysis/models.py` | Pydantic contracts (V4StructuredResult, compiler I/O, provider, API schemas) | AOPS08_CORE | no | none | TAKE |
| `companion/app/analysis/compiler.py` | deterministic prompt compiler, JSON schema, input hash | AOPS08_CORE | no | none | TAKE |
| `companion/app/analysis/provider.py` | LLMProvider protocol, OpenAI BYOK (keyring), FakeProvider, cost est. | AOPS08_CORE | no | none | TAKE |
| `companion/app/analysis/service.py` | orchestrator: load package → compile → cache → provider → validate → repair → persist | AOPS08_CORE | no | none | TAKE + FIX (P0: block on missing/invalid engine package) |
| `companion/app/analysis/validators.py` | 11 literal letter validators + structural validators | AOPS08_CORE | no | none | TAKE |
| `companion/app/api/analysis.py` | POST /vacancies/{id}/analyze, GET /engine/runs/{run_id} | AOPS08_CORE | no | none | TAKE |
| `companion/app/main.py` (diff) | router registration | AOPS08_CORE | no | none | TAKE |
| `companion/tests/test_analysis.py` | 27 focused tests | AOPS08_TEST | no | synthetic only | TAKE + EXTEND |
| `companion/tests/openapi_snapshot.json` | OpenAPI snapshot | AOPS08_TEST | no | none | TAKE (regenerate) |
| `shared/contracts/openapi.json` (diff) | regenerated contract | AOPS08_CORE | regenerated | none | REGENERATE |
| `docs/.../IMPLEMENTATION_STATUS.md` (diff) | "AOPS-08 complete" claim | AOPS08_DOC | no | none | REJECT (premature completion claim; historical draft only) |

## Known defects found during review (pre-transplant)

- **P0**: `AnalysisService.analyze()` proceeds when engine package is
  `None`/invalid — `compile_prompt` accepts `index=None, package=None` and
  builds a prompt with `engine_version='none'`. Violates contract: Full V4
  analysis MUST be BLOCKED on missing/invalid package/manifest/checksum.
- **P1**: `_to_run_result` returns `engine_hash=''` — run identity incomplete.
- **P1**: repair-status bookkeeping is lossy (comment admits it cannot
  distinguish repaired from originally-valid).
- **P2**: `_check_portfolio_boundary` is a no-op placeholder.
- **P2**: `asyncio.run()` inside sync route (works under threadpool but fragile).

## Premature completion claims

`IMPLEMENTATION_STATUS.md` in the worktree claims "AOPS-08 complete; AOPS-09
next" with a validation table. Treated as historical draft only — not trusted,
not transplanted. Status will only be updated after independent acceptance.
