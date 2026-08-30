# AOPS-08 Acceptance Report — Recovery Milestone R1

Date: 2026-08-30

# Verdict

**PASS**

R2 completed live-provider acceptance using the configured OS-keyring BYOK
slot and the active real V4 package. The canonical provider, structured
parsing, deterministic validation, evidence usage persistence, and run
read-back passed. The detailed sanitized record is
`R2_LIVE_PROVIDER_ACCEPTANCE.md`.

# Baseline

- Original main SHA: `169bb5c3c82f41f286ca620d10b93ca0938864d9`
- Recovery source: `C:/Dev/VacancyPilot/.claude/worktrees/great-spence-0fa731`
  (HEAD = `169bb5c`; all candidate work was uncommitted)
- Feature branch: `feat/aops-08-recovery`
- Real private engine: version `4.0.0`, package aggregate hash
  `3cfc6d4c2199aa3b8d175014de08cb74bffb8dcacb1517447c915166af7e2c9d`
  (source zip SHA-256 `dbdbe8f6…`, verified against the private manifest)

# Recovery

| File | Source | Classification | Action | Reason |
|---|---|---|---|---|
| `companion/app/analysis/*` (6 modules) | great-spence worktree | AOPS08_CORE | TAKE + FIX | sound architecture; P0 engine-gating fix applied |
| `companion/app/api/analysis.py` | great-spence worktree | AOPS08_CORE | TAKE + FIX | 409 mapping via dedicated handler |
| `companion/app/main.py` (router) | great-spence worktree | AOPS08_CORE | TAKE | re-applied manually (ruff import order) |
| `companion/tests/test_analysis.py` | great-spence worktree | AOPS08_TEST | TAKE + EXTEND | hermetic engine fixture added |
| `shared/contracts/openapi.json` | regenerated | AOPS08_CORE | REGENERATE | new analysis endpoints |
| `docs/.../IMPLEMENTATION_STATUS.md` diff | great-spence worktree | AOPS08_DOC | REJECT | premature "AOPS-08 complete" claim |
| worktree metadata / stale configs | — | UNRELATED/OBSOLETE | REJECT | not part of the epic |

# Review findings

See `R1_AOPS08_CODE_REVIEW.md`: 2×P0, 3×P1 (all fixed), 3×P2 (documented),
2×P3 (fixed/noted).

# Fixes

| Severity | Finding | Fix | Proving test |
|---|---|---|---|
| P0 | Generic fallback on missing/invalid engine package | `_require_package()` + 409 `ENGINE_PACKAGE_UNAVAILABLE` | `test_missing_engine_blocks_analysis`, `test_invalid_engine_blocks_analysis`, `test_missing_engine_blocks_preview` |
| P0 | AOPS-07 loader rejected the authoritative V4 package | loader extension (document frontmatter, fenced entries, per-file versions) | CLI install/verify PASS; 42 engine tests; index smoke 119/15/20 |
| P1 | `engine_hash` missing from run identity | column + migration + persistence | `test_engine_run_and_evidence_usage_persisted` |
| P1 | e2e success never proven (default letter failed 4 validators) | fixture letter fixed | e2e success tests |
| P1 | Non-hermetic tests (depended on local package) | isolated engine root fixture | whole contract suite |
| P3 | 15 mypy strict errors | fixed | `mypy app/` clean (43 files) |

# Tests

| Command | Exit | Actual count | Result |
|---|---|---|---|
| `ruff check companion/` | 0 | all files | PASS |
| `ruff format --check companion/` | 0 | 71 files unchanged | PASS |
| `mypy app/` (strict) | 0 | 43 source files | PASS |
| `pytest companion/tests/` | 0 | 316 passed | PASS |
| `pnpm companion:openapi-check` | 0 | snapshot current | PASS |
| `pnpm typecheck` | 0 | — | PASS |
| `pnpm lint` | 0 | — | PASS |
| `pnpm test` | 0 | 78 files / 2808 tests | PASS |
| `pnpm build` | 0 | chrome-mv3 | PASS |
| `pnpm test:release` | 0 | 10 files / 1364 tests | PASS |
| `pnpm verify:aops-workflow` | 0 | — | PASS |
| `git diff --check` | 0 | — | PASS |

# R2 live acceptance and final gates

| Gate | Exit | Actual evidence | Result |
|---|---|---|---|
| Real OpenAI BYOK smoke | 0 | `SYNTH-R2-LIVE-011`; `gpt-4o`; V4 `4.0.0`; run `710ee415-e1e-4a69-b52a-7e65b6fe54cf`; 2 persisted evidence usages; 0 validation errors | PASS |
| `pnpm verify:companion` | 0 | 322 companion tests; Ruff; strict mypy on 43 source files; OpenAPI current | PASS |
| `pnpm typecheck` / `pnpm lint` | 0 | — | PASS |
| `pnpm test` | 0 | 78 files / 2,808 tests | PASS |
| `pnpm build` | 0 | Chrome MV3 production build | PASS |
| `pnpm test:release` | 0 | 10 files / 1,364 tests | PASS |
| `git diff --check` | 0 | — | PASS |

# Private V4 acceptance (sanitized summary)

| Gate | Result | Evidence |
|---|---|---|
| 15 private V4 regressions | **15/15 PASS** | private `tools/validate_application_engine_v4.py --root .` → `status=PASS`, `regression_cases=15`, errors 0, warnings 0, exit 0 |
| 6 private V4 smoke | **6/6 PASS** | private `tools/validate_smoke_v4.py --root .` → `status=PASS`, 6 fixtures PASS, exit 0 |
| unsupported direct claims | 0 | validator gate + `test_unknown_evidence_id_rejected` |
| false QA PASS | 0 | local validators are the only PASS source; `qa.pass` ignored |
| score cap divergence | 0 | Pydantic cap math + `SCORE_CAP_PARITY` validator |

No private scenario content, candidate facts, real letters, or evidence
bodies were copied into VacancyPilot Git.

# Security/privacy

- Secrets leaked: 0 (keyring checked without printing; no key in code/DB/logs)
- Private tracked files: 0 (`git status` clean of private payload; runtime
  package under ignored `companion/data/engine/current/`)
- Invalid engine behavior: blocked with 409 + sanitized reason
- Provider error behavior: sanitized messages, bounded timeout, no key echo
- Auth boundary: `ClientTokenDep` on both analysis endpoints (proven)

# Remaining risks

- Repair-status provenance (repaired vs originally-valid) is lossy (P2).
- Portfolio boundary enforcement is advisory (P2).
- `asyncio.run()` inside sync route (P2) — acceptable under threadpool.
