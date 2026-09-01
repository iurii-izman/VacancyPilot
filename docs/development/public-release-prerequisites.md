# Public Release Prerequisites — VacancyPilot

Status: FUTURE BACKLOG / NOT IMMINENT
Last reviewed: 2026-09-01
Source: spec sections 26.1, 26.4, 26.5, 26.6; EPIC-10

This document lists everything that must be completed or resolved before VacancyPilot can be published to the Chrome Web Store or distributed publicly. Most items are **not required** for private/personal use. Current product operation is a local extension plus optional loopback FastAPI companion; public packaging must decide how that companion is installed, paired and supported.

---

## 1. Store Assets

### 1.1 Extension Icons
- [x] Produce icon in required sizes: 16x16, 32x32, 48x48, 128x128 (actual PNG, not SVG reference).
- [x] Replace SVG-only manifest icon references with packaged PNG assets in `public/icons/`.
- [ ] Icon must be original work or properly licensed.

### 1.2 Store Listing
- [ ] **Name**: "VacancyPilot" — verify availability in Chrome Web Store (spec 26.1).
- [x] **Short description** draft prepared in `docs/development/store-listing-draft.md`.
- [x] **Full description** draft prepared in `docs/development/store-listing-draft.md`.
- [ ] **Screenshots** (at least 1, recommended 3–5): 1280x800 or 640x400.
- [ ] **Promotional images**: small (440x280), large (920x680), marquee (1400x560) — optional but recommended.

### 1.3 Category
- [ ] Select appropriate Chrome Web Store category (likely "Productivity" or "Job Search").

---

## 2. Permissions Justification

Chrome Web Store requires justification for each permission. Prepare text for:

| Permission | Justification |
|------------|---------------|
| `storage` | Stores user's vacancy tracking data, profiles, and settings locally on device |
| `sidePanel` | Opens a side panel with vacancy analysis when user clicks the extension |
| `activeTab` | Reads the current HH.ru vacancy page to extract job details, only on user action |

Optional permissions (requested at runtime):
| Optional | Justification |
|----------|---------------|
| AI provider host | Users configure their own AI provider. The host is requested only when the user enters an API key and initiates an AI request. |
| Loopback companion host | Ops Mode is explicitly paired to the user’s local companion at `127.0.0.1:8765`; no broad host access is requested. |

n8n remains deferred and is not an optional host permission in the current build.

Store-facing draft text is prepared in `docs/development/store-listing-draft.md`.

**No sensitive permissions** (`cookies`, `webRequest`, `downloads`, `tabs` with broad access) are requested.

---

## 3. Privacy Policy

A public privacy policy is **mandatory** for Chrome Web Store submission. The policy must cover:

- [ ] **Data collected**: What data the extension accesses and stores.
- [ ] **Data storage**: Data may be stored in Standalone browser storage (IndexedDB, `chrome.storage.local`) or Ops Mode local SQLite/keyring/engine storage. No developer cloud storage or sync.
- [ ] **Data sent externally**: AI payloads (to user-configured AI provider), n8n webhooks (to user-configured webhook URL). Both are opt-in.
- [ ] **Data minimization**: Redaction of PII before external requests. Payload preview for user transparency.
- [ ] **No telemetry**: No analytics, no crash reporting, no usage tracking sent to developer.
- [ ] **User controls**: Export, delete all, AI cache controls, Strict Privacy mode, Labs kill switch.
- [ ] **Third-party services**: Only user-configured providers (AI API, n8n). No developer-operated backend.
- [ ] **Contact**: How users can reach the developer with privacy questions.
- [ ] **Policy URL**: Hosted, publicly accessible URL (e.g., GitHub Pages, project site).

See `docs/development/privacy-policy-checklist.md` for detailed coverage.

---

## 4. Name and Trademark (spec 26.1)

- [ ] Check Chrome Web Store for name conflicts.
- [ ] Check GitHub for organization/repo name availability.
- [ ] Check domain availability (`vacancypilot.dev`, `vacancypilot.app`, etc.).
- [ ] Search existing job-tech products for trademark conflicts.
- [ ] Search Russian trademark registry for "VacancyPilot" or "CareerSignal".
- [ ] Verify "HH.ru" / "HeadHunter" trademark usage in extension description complies with their terms.

---

## 5. Technical Requirements

### 5.1 AI Provider Implementation (spec 26.2)
- [x] Implement at least one real AI provider (OpenRouter or OpenAI recommended).
- [x] Mock provider is no longer the only path.
- [ ] Test with real API calls in live browser flow: analysis, cover letter generation, error handling, rate limiting.

### 5.2 API Key Security (spec 26.6)
- [ ] Decide on key storage approach for public release:
  - Keep BYOK local with warnings (simplest, acceptable for Chrome Web Store with clear disclosure).
  - Session-only key (no persistent storage).
  - WebCrypto + master password (more secure, more complex).
- [ ] Update privacy policy with chosen approach.
- [ ] Update settings UI with appropriate warnings.

### 5.3 n8n Decision (spec 26.5)
- [x] Make explicit go/no-go decision on n8n for Phase 1 public release.
- **Decision (PHASE-1-SIGNOFF)**: Deferred. n8n is opt-in Labs, not Core. The spec lists n8n permission model as an open decision (spec 26.5). n8n UI is already gated behind Labs toggle (off by default).
- [ ] If/when re-evaluated: test `optional_host_permissions` behavior for user-defined webhook hosts across target browsers.
- [ ] If/when re-evaluated: verify CORS implications and Chrome Web Store review impact.

### 5.4 Parser Fixtures (spec 22.5, 23.5)
- [ ] Expand fixture library to 50+ sanitized vacancy fixtures.
  - Current: 22 fixtures (19 vacancy + 3 search cards).
- [ ] Cover diverse vacancy types: with/without salary, remote/office, various skills formats, Cyrillic content, edge cases.
  - Partially covered: 19 vacancy + 3 search fixtures already include remote, hybrid, office, part-time, no-salary, no-skills, no-company, no-experience, English, Cyrillic, applied/invitation/rejected/viewed statuses.

### 5.5 CSP Compliance (spec 20.8)
- [ ] Verify no inline scripts violate Content Security Policy.
- [ ] Verify no remote code execution vectors.
- [ ] Verify all external resources are declared in manifest `content_security_policy`.

---

## 6. Testing & QA

### 6.1 Manual QA (spec 22.4)
- [ ] Execute full manual QA checklist (`docs/development/qa-checklist.md`).
- [ ] Pass in Chrome + at least one additional Chromium browser.
- [ ] Document results with dates and browser versions.

### 6.2 Release Gate (spec 22.7)
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes (use the fresh dated validation report; do not hardcode an old count).
- [ ] `pnpm build` succeeds without warnings.
- [ ] `pnpm test:release` passes (use the fresh dated validation report; do not hardcode an old count).
- [ ] All P0/P1 risks (`docs/development/known-risks.md`) are resolved or explicitly accepted.

### 6.3 Privacy/Safety Tests (spec 22.6)
- [ ] All automated safety tests pass (manifest-safety, privacy-safety, content-script-safety, export-safety).
- [ ] Manual verification of safety boundaries (see QA checklist section 11).

---

## 7. Support & Documentation

### 7.1 User-Facing Documentation
- [ ] Onboarding flow in extension is complete and accurate.
- [ ] Settings page explains all options with clear language.
- [ ] Error messages are user-friendly and actionable.

### 7.2 Support Channel
- [ ] Decide on support channel: GitHub Issues, email, or other.
- [ ] Add support link in extension (settings or popup).
- [ ] Add support link in Chrome Web Store listing.

### 7.3 README (project root)
- [ ] Create `README.md` with: project description, features, install guide, development setup, contributing.

---

## 8. Legal & Compliance

### 8.1 HH.ru Terms of Service
- [ ] Review HH.ru terms regarding browser extensions and page analysis.
- [ ] Confirm read-only, user-initiated analysis does not violate terms.
- [ ] Extension does not automate HH interactions, bypass paywalls, or scrape at scale.

### 8.2 Open Source License
- [ ] Choose and apply an open source license (MIT, Apache 2.0, GPL, etc.).
- [ ] Add `LICENSE` file to repository.
- [ ] Verify all dependencies are compatible with chosen license.

---

## Summary: Blockers for Public Release

| # | Blocker | Severity | Status |
|---|---------|----------|--------|
| 1 | Privacy policy drafted and hosted | **P0** | Draft now exists in `PRIVACY.md`; public hosting still pending |
| 2 | Store listing assets (icons, screenshots, description) | **P0** | Not started |
| 3 | Permissions justification text | **P0** | Draft exists in this doc |
| 4 | At least one real AI provider implemented | **P0** | Resolved — OpenAI provider implemented; live manual validation still pending |
| 5 | Name/trademark clearance | **P0** | Not checked |
| 6 | 50+ parser fixtures | **P1** | 22 fixtures (19 vacancy + 3 search); 28 more needed |
| 7 | API key storage decision | **P1** | Accepted for personal, not for public |
| 8 | n8n go/no-go decision | **P2** | Resolved — deferred (PHASE-1-SIGNOFF) |
| 9 | Manual QA in 2+ browsers | **P1** | Core rerun completed; broader public-release QA still pending |
| 10 | Root README | **P2** | Present — may need update before public store listing |
| 11 | Open source license | **P1** | Not chosen |

**Current state**: ready for private/personal dogfood, not a public release candidate. Public release requires resolving the blockers above, including the local-companion packaging/pairing question, current dependency findings, legal/privacy hosting and broader QA. The private release readiness pack remains historical baseline evidence; public release work belongs to the backlog.
