# R1 AOPS-08 Code Review

Independent review of the recovered AOPS-08 implementation against
`R1_AOPS08_RUNTIME_CONTRACT.md`, performed before remediation.

## Findings

| Severity | Finding | Resolution |
|---|---|---|
| P0 | `AnalysisService.analyze()` proceeded with `package=None`/invalid package — `compile_prompt` accepted `index=None` and built a prompt with `engine_version='none'` (generic fallback). Violates contract §1. | Fixed: `_require_package()` raises `EnginePackageUnavailableError`; dedicated FastAPI handler maps it to 409 `ENGINE_PACKAGE_UNAVAILABLE` with a sanitized reason. Proven by `test_missing_engine_blocks_analysis`, `test_invalid_engine_blocks_analysis`, `test_missing_engine_blocks_preview`. |
| P0 | The AOPS-07 loader could not load the authoritative private V4 package at all (39 validation errors: document frontmatter schema, fenced per-entry YAML blocks, per-file content versions). Full V4 analysis was impossible on the real engine. | Fixed in the loader (additive, fixture-compatible, strictness preserved). Proven by CLI install/verify PASS and 42 engine tests. See `R1_REAL_ENGINE_INSTALL.md`. |
| P1 | `_to_run_result` returned `engine_hash=''` — run identity incomplete (contract §2). | Fixed: `engine_hash` persisted on `engine_runs` (model + Alembic migration) and returned in run results. Proven by `test_engine_run_and_evidence_usage_persisted`. |
| P1 | The recovered suite never proved a successful end-to-end analysis: the default FakeProvider letter failed 4 literal validators (sections, word count, signature trailing). | Fixed: default fixture letter rewritten to satisfy all 11 validators; e2e success proven by `test_engine_run_and_evidence_usage_persisted` and `test_run_detail_does_not_leak_raw_output`. |
| P1 | Tests depended on a locally installed engine package (no isolation) — non-hermetic, would fail on clean machines. | Fixed: per-test isolated engine root fixture + synthetic valid-minimal package. |
| P2 | Repair-status bookkeeping could not distinguish repaired from originally-valid runs (lossy heuristic). | Documented; not expanded (would require schema change beyond epic scope). `repair_status` remains correct for the failure path (proven) and success path. |
| P2 | `_check_portfolio_boundary` is a placeholder (flags nothing). | Documented; boundary data is exposed in the index and included in the compiled prompt; deeper boundary enforcement deferred. |
| P2 | `asyncio.run()` inside sync route. | Documented; works under FastAPI threadpool, single-call semantics, no loop conflicts in tests. |
| P3 | `EngineRun.model` nullable → `_to_run_result` fabricates model name fallback. | Noted; harmless for identity. |
| P3 | 15 mypy strict errors across recovered + touched files (unused ignores, implicit re-exports, Optional narrowing, exception naming). | All fixed; mypy strict now passes on 43 files. |

## Architecture review

- Existing AOPS architecture reused: canonical FastAPI routers, Pydantic
  contracts, `app.security.auth.ClientTokenDep`, error envelope, SQLAlchemy
  session/transaction handling, AOPS-07 engine loader/index/installer. No
  duplicate engine loader, DB layer, provider config system, auth system, or
  error system was introduced.
- No silent LLM fallback (after P0 fix).
- Persistence uses canonical `EngineRun`/`EvidenceUsage` models.

## Security review

- Endpoints require `ClientTokenDep` (proven by `test_analyze_requires_auth`).
- API key only read from OS keyring at call time; never logged, never stored
  in DB; provider errors return sanitized messages without echoing the key.
- No private engine content in error responses: `EnginePackageUnavailableError`
  messages carry only error codes/filenames (`safe_summary()`).
- Provider timeout bounded (120s); input bounded by Pydantic field limits;
  request ID echoed in error envelope; rate limiting inherited from the
  companion middleware stack.

## Privacy review

- No real candidate data in tracked fixtures (synthetic `SYNTH-*` IDs only).
- Provider payload = compiled prompt (vacancy fields + selected evidence
  metadata); strict privacy mode drops the vacancy description.
- Run detail endpoint does not expose raw output or letter content (proven).

## Reliability review

Covered by tests: provider timeout → `error` run persisted; malformed JSON →
`invalid`; unknown evidence ID → `invalid`; score cap violation → rejected at
two deterministic layers; repair second failure → stays invalid with exactly
one retry; DB failure → rollback in route; duplicate request → input-hash
cache; engine package removed/invalid → 409 block.
