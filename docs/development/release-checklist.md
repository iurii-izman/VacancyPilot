# Release Checklist — VacancyPilot

Status: ITER-064
Source: spec sections 19.6, 22.4, 26.5, 26.6; EPIC-11; EPIC-15; PHASE-1-SIGNOFF

## Automated Checks (CI Gate)

These checks run automatically via `pnpm test` and must all pass before release. Status as of ITER-064:

- [x] **Manifest permission audit** — `src/release-safety/manifest-safety.test.ts`
  - Only `storage`, `sidePanel`, `activeTab` in permissions
  - No broad host permissions (`<all_urls>`, `*://*`)
  - No forbidden permissions (`downloads`, `cookies`, `webRequest`, etc.)
  - MV3, valid version, icons present

- [x] **Privacy payload safety** — `src/release-safety/privacy-safety.test.ts`
  - AI payloads are free of emails, phones, URLs, tokens
  - Strict Privacy mode excludes description and resume highlights
  - Redaction functions strip all sensitive patterns
  - Payload preview reports excluded fields correctly

- [x] **Content script safety** — `src/release-safety/content-script-safety.test.ts`
  - No `fetch()` to HH domains
  - No `XMLHttpRequest`
  - No `.click()` on HH UI controls
  - No `.value` mutation on HH form elements
  - Shadow DOM isolation used for UI

- [x] **Export secret exclusion** — `src/release-safety/export-safety.test.ts`
  - `webhookUrl` is redacted in exports
  - `hmacSecretSet` is always `false` in exports
  - CSV columns do not include secrets or settings
  - Export envelope structure is valid

- [x] **Fixture regression** — `src/release-safety/fixture-regression.test.ts`
  - All parser fixtures pass (currently 19 vacancy fixtures: `vacancy-normal`, `vacancy-no-salary`, `vacancy-archived`, `vacancy-applied-status`, `vacancy-english`, `vacancy-hybrid`, `vacancy-invitation-status`, `vacancy-minimal`, `vacancy-multiple-cities`, `vacancy-no-company`, `vacancy-no-experience`, `vacancy-no-skills`, `vacancy-office`, `vacancy-part-time`, `vacancy-rejected-status`, `vacancy-remote-description`, `vacancy-salary-from`, `vacancy-salary-to`, `vacancy-viewed-status`)
  - Search card regression: 3 search fixtures (`search-multiple-cards`, `search-no-salary`, `search-normal`)
  - Aggregate check: zero fixture failures

## Manual QA Checklist

These checks require a human tester and a running extension instance.
Execute in at least Chrome and one additional Chromium browser (Edge, Brave, or Яндекс Браузер).

> **Status (2026-06-20)**: Initial QA run found core runtime blockers. ITER-017..021 addressed the defects, GitHub Actions `Quality` on `main` is green, and the follow-up Chrome + Edge rerun for the current Phase 1 core scope was reported as successful. See `docs/development/manual-qa-run-2026-06-20.md` § Phase 1 Closeout Rerun. Keep this checklist as the wider regression/public-release matrix rather than treating it as fully exhausted by the closeout gate.

### Browser Compatibility (spec 22.4)

- [ ] Chrome (latest stable)
- [ ] Edge (latest stable)
- [ ] Brave (latest stable)
- [ ] Яндекс Браузер (latest stable)

### HH.ru States (spec 22.4)

- [ ] Logged-in HH user — vacancy page loads, badge appears
- [ ] Logged-out HH user — vacancy page loads, badge appears
- [ ] Vacancy with salary — badge shows without errors
- [ ] Vacancy without salary — badge shows without errors
- [ ] Remote vacancy — parsed correctly
- [ ] Office vacancy — parsed correctly
- [ ] Archived/removed vacancy — parser returns null (no crash)
- [ ] Already-applied vacancy (passive status) — no crash

### Permissions UI (spec 19.6)

- [ ] Extension installs without requesting unexpected permissions
- [ ] OpenAI runtime host access can be granted/denied when AI is actually used
- [ ] No unexpected webhook/n8n host permission is requested in the current build
- [ ] Permission status is visible in settings
- [ ] Instructions for revoking access via browser settings are accessible

### AI Privacy (spec 26.6)

- [ ] API key is stored in `chrome.storage.local` with clear warning
- [ ] Payload preview is shown before every AI request
- [ ] Strict Privacy mode can be enabled and excludes description/resume
- [ ] Redaction visibly strips emails, phones, URLs from preview
- [ ] No raw HTML is sent to AI

### n8n Readiness (spec 26.5, deferred)

- [ ] n8n toggle is off by default (Labs)
- [ ] n8n webhook URL field is visible but optional
- [ ] HMAC secret field exists and is masked
- [ ] Payload preview shown before sending webhook events
- [ ] Retry policy is documented

Known open: runtime `optional_host_permissions` behavior for user webhook host — needs testing before Sprint 6.

### Data Safety

- [ ] Export JSON does not contain `webhookUrl` in plain text
- [ ] Export JSON does not contain `hmacSecretSet: true`
- [ ] Export CSV contains only job data, no settings or secrets
- [ ] "Delete all data" clears Dexie tables and `chrome.storage.local` keys
- [ ] No crashes on empty data

### Labs & Kill Switch (spec 19.7)

- [ ] Labs toggle is off by default
- [ ] Guided apply is off by default (Labs)
- [ ] Kill switch disables all Labs features when enabled
- [ ] Daily action limit is enforced when Labs are enabled

## Known Automation Gaps

The following checks are NOT automated and require manual verification:

1. **Real HH DOM changes** — Fixtures are snapshots. If HH changes its DOM, fixtures must be updated and re-validated manually.
2. **Browser-specific rendering** — Content badge positioning may differ across browsers.
3. **Performance with large datasets** — Not automated; test with 500+ jobs manually.
4. **Network error resilience** — AI/n8n retry behavior when offline.
5. **CSP compliance** — Verify no inline scripts violate extension CSP.

## Release Candidate Sign-off

- [x] All automated CI checks pass (1615 tests, 0 failures)
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test:release` passes (373 release-safety tests, 0 failures)
- [x] No secrets committed
- [x] Manifest permissions are minimal
- [x] Manual QA rerun completed in at least 2 browsers for the current Phase 1 core scope (see `docs/development/manual-qa-run-2026-06-20.md` § Phase 1 Closeout Rerun)
- [ ] Release notes drafted
- [ ] Full public-release matrix re-run across all checklist sections
