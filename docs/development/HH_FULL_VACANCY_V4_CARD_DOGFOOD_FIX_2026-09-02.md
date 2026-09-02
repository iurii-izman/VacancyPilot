# HH Full Vacancy + Full V4 Application Card Hotfix

## Verdict

HH_FULL_DETAIL_UPSTREAM_BLOCKED. Implementation and offline acceptance are complete; live MV3 Application Card smoke reached the explicit Full V4 confirmation and hydration passed. The single authorized provider execution was cancelled by the original 10-second frontend timeout before a persisted run was created. The timeout mismatch is now fixed; a new real provider run was not attempted because the acceptance authorization allowed at most one.

## Root cause

HH search results are lightweight projections. The sync path passed each search item directly to `normalize_vacancy()`, so `description` could be empty or incomplete. The Application Card rendered the initial listing Job and had no single-item Full V4 action.

## Fix

- Added `HHApiClient.vacancy(id)`, a validated GET-only request to `https://api.hh.ru/vacancies/{id}` using the existing auth, headers, timeout, retry and safe error mapping.
- Added lazy `POST /api/v1/vacancies/{id}/hydrate`. It fetches only the selected HH vacancy and reuses canonical intake/snapshot semantics; unchanged content is idempotent and search-profile provenance is preserved.
- Added an analysis readiness gate for HH vacancies (title plus at least 200 characters of persisted description). Missing/insufficient full text blocks Full V4 rather than sending known-garbage input.
- Application Card now shows Search preview vs Full, supports Refresh full vacancy details, Preview Full V4, and an explicit Confirm and run Full V4 action. Preview is provider-free; execute is disabled until preview and while running.
- Card labels distinguish Stage A deterministic values from Full V4 score/decision/confidence and render the persisted execution result. SKIP explicitly shows that no letter was generated.
- Application Factory uses the same hydration/readiness helper before Full V4 execution.
- Full V4 requests now use a dedicated 5-minute client timeout, covering the provider's bounded request and one repair attempt; ordinary companion calls retain the 10-second timeout.

## Safety

No HH writes, form interaction, auto-apply, application creation, APPLIED mutation, message sending, cookie/session handling, private endpoint access, or secret logging was added.

## Live read evidence

Official HH documentation describes `GET https://api.hh.ru/vacancies/{vacancy_id}` and its full vacancy response. The configured local client read `136022615` successfully with sanitized output: description length 3461, 6 key skills, experience `От 3 до 6 лет`, source URL preserved. Browser inspection showed the same vacancy page with full description and six key skills. The live card showed `Vacancy details: Full`; Preview Full V4 reported no provider call and a 2858-character persisted description. The one authorized Confirm and run attempt timed out after 10 seconds; no `engine_runs` row was persisted and no retry was made.

## Tests

- HH client GET/ID validation and hydration/idempotency regressions: PASS.
- Companion format, Ruff, strict mypy, full pytest and OpenAPI drift: PASS after snapshot regeneration.
- Frontend typecheck/lint: PASS; post-smoke persisted-run refresh path typechecks; dedicated Full V4 timeout regression: PASS.
- Fresh hermetic frontend suite after stopping the manually running Companion: 80 files, 1869 tests PASS. The earlier `unpaired` vs `unavailable` result was confirmed as the documented port-conflict/environment condition.
- MV3 build: PASS; release safety: 10 files, 422 tests PASS; workflow verifier: PASS; diff-check: PASS.

## Git

Branch: `hotfix/hh-vacancy-hydration-v4-card`.

Latest implementation commit: `fix: finalize Full V4 card smoke path` plus the timeout follow-up (this commit). The branch is intentionally not merged or pushed because the only authorized provider execution was cancelled by the former client timeout. No provider retry was performed.
