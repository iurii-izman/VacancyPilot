# HH Full Vacancy + Full V4 Application Card Hotfix

## Final offline contract status

V4_PRIVATE_ENGINE_FIX_REQUIRED. HH hydration PASS and card V4 preview/execute
wiring PASS. Public offline contract hardening is complete, but the requested
`SKIP => no letter` behavior conflicts with the read-only private V4 contract,
which currently requires a 90–130 word fallback letter for SKIP.

The persisted invalid corpus contains four runs: two initial provider outputs
and two repair outputs. The latest run is
`b4f1ce02-00af-4fbc-8b45-7d068daa46f6`; its remaining failures were a missing
value marker, 130 words instead of 150–220, and trailing signature content.
No third live attempt was performed and this task made zero provider calls.

Generation and repair now share a compact literal invariant block. Repair
receives all validator failures and must return the complete structured object;
invalid repaired responses remain `ready=false`. A local prompt preflight runs
before any future provider call. Synthetic public-safe fixtures cover the
persisted failure shapes and boundary cases.

## Rule alignment

| Rule | Canonical source | Generation | Repair | Validator |
|---|---|---:|---:|---:|
| value marker | private V4 contract + public literal rules | PASS | PASS | PASS |
| APPLY/CONSIDER 150–220 | private `active/11_letter_regression_suite.md` | PASS | PASS | PASS |
| target 165–185 | public hardening contract | PASS | PASS | PASS |
| exact signature / no trailing text | private `active/11_letter_regression_suite.md` | PASS | PASS | PASS |
| decision-dependent letter | private requires SKIP fallback; request says SKIP empty | MISMATCH | MISMATCH | public PASS / private mismatch |
| sections / evidence IDs | private source + public validators | PASS | PASS | PASS |

Private V4 was read-only and was not changed.

## Fix

- Added `HHApiClient.vacancy(id)`, a validated GET-only request to `https://api.hh.ru/vacancies/{id}` using the existing auth, headers, timeout, retry and safe error mapping.
- Added lazy `POST /api/v1/vacancies/{id}/hydrate`. It fetches only the selected HH vacancy and reuses canonical intake/snapshot semantics; unchanged content is idempotent and search-profile provenance is preserved.
- Added an analysis readiness gate for HH vacancies (title plus at least 200 characters of persisted description). Missing/insufficient full text blocks Full V4 rather than sending known-garbage input.
- Application Card now shows Search preview vs Full, supports Refresh full vacancy details, Preview Full V4, and an explicit Confirm and run Full V4 action. Preview is provider-free; execute is disabled until preview and while running.
- Card labels distinguish Stage A deterministic values from Full V4 score/decision/confidence and render the persisted execution result. SKIP explicitly shows that no letter was generated.
- Application Factory uses the same hydration/readiness helper before Full V4 execution.
- Full V4 requests now use a dedicated 5-minute client timeout, covering the provider's bounded request and one repair attempt; ordinary companion calls retain the 10-second timeout.
- Invalid persisted runs remain inspectable as safe diagnostics (score 75, `consider`, `medium` confidence) but are not represented as a ready letter/evidence result.
- Public contract hardening added deterministic marker, word-range, signature-tail, SKIP, and repair replay guards.

## Safety

No HH writes, form interaction, auto-apply, application creation, APPLIED mutation, message sending, cookie/session handling, private endpoint access, or secret logging was added.

## Live read evidence

Official HH documentation describes `GET https://api.hh.ru/vacancies/{vacancy_id}`
and its full vacancy response. The configured local client read `136022615`
successfully with sanitized output: description length 3461, six key skills,
experience `От 3 до 6 лет`, source URL preserved. The card showed `Vacancy
details: Full`; Preview Full V4 made zero provider calls and showed the persisted
full description. The details above are the complete sanitized persisted-run
summary; no raw candidate evidence or private prompt was exported.

## Tests

- HH client GET/ID validation and hydration/idempotency regressions: PASS.
- Companion format, Ruff, strict mypy, full pytest and OpenAPI drift: PASS after snapshot regeneration.
- Frontend typecheck/lint: PASS; post-smoke persisted-run refresh path typechecks; dedicated Full V4 timeout regression: PASS; invalid-run UI gating typechecks.
- Fresh hermetic frontend suite after stopping the manually running Companion: 80 files, 1869 tests PASS. The earlier `unpaired` vs `unavailable` result was confirmed as the documented port-conflict/environment condition.
- MV3 build: PASS; release safety: 10 files, 422 tests PASS; workflow verifier: PASS; diff-check: PASS.
- Offline replay tests: PASS, including all listed failure shapes, boundaries,
  SKIP gating, unknown evidence IDs, score/decision stability, and prompt preflight.
- This task made zero real provider calls.

## Git

Branch: `hotfix/hh-vacancy-hydration-v4-card`.

Starting HEAD: `589bef52790f72385040a50a76b64a53989d1a76`.
The branch remains intentionally unmerged and unpushed. Private V4 files remain
separate and were not edited.
