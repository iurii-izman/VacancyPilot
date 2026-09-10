# Known Risks — VacancyPilot

Status: CURRENT DOGFOOD / PUBLIC-RELEASE RISK REGISTER — reviewed 2026-09-10
Source: release-checklist.md and spec sections 22, 26

This document lists known risks, open decisions and unresolved gaps for the
current personal dogfood baseline. Risks must be addressed or explicitly
accepted before public release; this is not a feature queue.

---

## Risk Classification

| Severity | Meaning |
|----------|---------|
| **P0** | Release blocker — must resolve before any release |
| **P1** | High risk — should resolve before public release |
| **P2** | Moderate risk — document and monitor |
| **P3** | Low risk / accepted — document for transparency |

---

## Technical Risks

### R1 — HH.ru DOM Fragility (P1)

**Risk**: The vacancy parser relies on specific CSS selectors and JSON-LD extraction from HH.ru pages. If HH changes its DOM structure, the parser may break silently or return null.

**Mitigation**:
- Parser uses JSON-LD as primary source, DOM as fallback.
- Fixture regression tests catch regressions for known page shapes (currently
  19 vacancy fixtures and 3 search-card fixtures).
- Fixture maintenance process is documented (spec 16.5).

**Residual**: Only 22 fixtures (19 vacancy + 3 search). Spec target was 50+. Fixture coverage is adequate for private use but below public-release confidence.

**Action**: Expand fixture library to 50+ before public release. Accept 22 fixtures for private/development use.

---

### R2 — Parser Fixture Coverage Gap (P1)

**Risk**: The fixture library contains 22 fixtures (19 vacancy + 3 search cards). The spec requires 50+ fixtures for Phase 1 readiness (spec 22.5, 23.5). Real-world HH vacancy diversity (salary formats, skill lists, description lengths, remote/office variations) is partially but not fully covered.

**Mitigation**: Fixture harness is built and regression tests run automatically (100 tests for vacancy fixtures, 16 for search cards). Adding fixtures is low-effort.

**Residual**: Parser may fail on vacancy types not covered by existing fixtures.

**Action**: Collect and sanitize additional fixtures from real HH.ru pages. Target 50+ before public release.

---

### R3 — Browser-Specific Rendering (P2)

**Risk**: The content badge uses Shadow DOM for style isolation, but positioning and z-index behavior may differ across Chromium browsers (Chrome, Edge, Brave, Яндекс Браузер).

**Mitigation**: Content badge is small and intentionally positioned to avoid overlapping HH UI. Manual QA checklist covers 4 browsers.

**Residual**: Badge may overlap HH elements on some browser/zoom combinations.

**Action**: Manual QA across target browsers. Adjust positioning if needed.

---

### R4 — Performance With Large Datasets (P2)

**Risk**: Local Dexie database performance is not tested with large datasets (500+ vacancies). IndexedDB operations may degrade with many records.

**Mitigation**: Dexie is designed for client-side databases of this scale. Dashboard uses pagination/filtering.

**Residual**: Untested at scale. Export/delete operations may be slow with many records.

**Action**: Manual test with 500+ synthetic jobs. Document any performance thresholds found.

---

### R5 — Network Error Resilience (P2)

**Risk**: AI and n8n features require network access. Behavior during network interruptions, timeouts, or provider errors is tested at unit level but not in integration scenarios with real providers.

**Mitigation**: Error boundaries exist in UI. AI cache provides offline access to previous results.

**Residual**: Edge cases like partial responses, rate limiting, or prolonged outages not fully tested.

**Action**: Manual test with network throttling. Document error recovery paths.

---

## Product Risks

### R6 — n8n Integration Deferred (P2)

**Risk**: n8n webhook client (ITER-014) is deferred from current Phase 1 completion path. The spec references n8n as Phase 1 scope, but the permission model remains an open decision (spec 26.5).

**Mitigation**: Active n8n UI and delivery plumbing were removed from the current build. Persisted event/export fields and redaction remain for compatibility, while EventLog data remains available for a future reviewed integration.

**Residual**: n8n feature is unavailable. No external event delivery.

**Decision (PHASE-1-SIGNOFF)**: Deferred. n8n is not an active Core or Labs feature. It will be re-evaluated only after a new permission-model decision and security review.

**Action**: Revisit n8n in a future iteration. Update roadmap and acceptance criteria accordingly.

---

### R7 — AI Provider Runtime Validation Still Pending (P2)

**Risk**: A real OpenAI provider is implemented, but the broader live-browser validation path with real API keys, error conditions, and rate-limit behavior is still narrower than the automated suite.

**Mitigation**: BYOK architecture is implemented, payload preview/redaction are in place, provider logic has automated coverage, and the feature is fully opt-in.

**Residual**: Real-provider browser QA is still needed before public release confidence.

**Action**: Run live browser QA with a real API key across analysis, cover-letter generation, and provider error handling before public release.

---

### R8 — API Key Storage Security (P1)

**Risk**: API keys are stored in `chrome.storage.local` with a clear user warning. This is acceptable for personal MVP but below public-release standard (spec 26.6).

**Mitigation**:
- Warning displayed in settings UI.
- Keys excluded from export.
- Keys not synced via Chrome Sync.

**Residual**: Keys stored in plaintext in browser profile. Accessible to other extensions with `storage` permission.

**Action**: Accept for private release. For public release, evaluate WebCrypto + master password or session-only key (spec 26.6).

---

### SEC-SERVER-AUTH-001 — Companion Server Identity (P1)

**Risk**: Loopback binding and a paired client token constrain the supported
Companion transport, but they do not prove that the local process answering on
the loopback port is the intended server against a malicious local process.

**Fix 4 disposition**: `ACCEPTED_RISK_WITH_PUBLIC_RELEASE_GATE`. This is not
technically fixed in Fix 4. The current private local dogfood assumptions are
loopback-only binding, no LAN/public bind, client authentication and no
developer cloud backend.

**Mitigation**: The project-owned launcher rejects non-loopback hosts; pairing
and protected routes require the client token; pre-auth requests are bounded
before expensive verification; CORS is constrained; error responses and
health/engine metadata are sanitized.

**Public-release gate**: Before public distribution, add and review server
identity through authenticated IPC, pinned local TLS, or an equivalent
mechanism. TLS/mTLS/named-pipe implementation is intentionally outside Fix 4.

---

### R9 — Public Release Name/Trademark (P3)

**Risk**: Product name "VacancyPilot" has not been checked against Chrome Web Store, domain availability, trademarks, or existing job-tech products (spec 26.1).

**Mitigation**: Internal use only. Public release is not imminent.

**Residual**: Name conflict may require rename before public launch.

**Action**: Perform name/trademark check before public release submission.

---

## Process Risks

### R10 — Manual QA Partially Executed, Full Matrix Pending (P1)

**Risk**: Core closeout rerun (Chrome + Edge) passed for the earlier Phase 1
scope. The wider public-release regression matrix in `release-checklist.md`
has not been fully re-run item-by-item. Several later surfaces have not been
manually QA'd in live browsers.

**Mitigation**: QA checklists are comprehensive and the current verification gates are rerun at the documentation sync/release gate. Counts are recorded from the dated run rather than hardcoded in this risk register.

**Residual**: Full public-release regression QA not yet executed. Some Phase 2+ features untested in real browser runtime.

**Action**: Execute the full release checklist across Chrome + Edge before
public release.

---

### R11 — Contributor Documentation Gaps (P2)

**Risk**: Contributor-facing onboarding remains intentionally small during
personal dogfood; broader sharing will need a maintained implementation
walkthrough and troubleshooting guide.

**Mitigation**: Root README, architecture map, local setup guide, Companion
README and testing guide are current. Onboarding UI exists in the extension.

**Residual**: New contributors may still need repo walkthrough support for implementation details and local debugging.

**Action**: Add contributor onboarding/troubleshooting docs before broader sharing.

---

## Summary

| Risk | Severity | Status | Target |
|------|----------|--------|--------|
| R1 — HH DOM fragility | P1 | Accepted with mitigation | Monitor, expand fixtures |
| R2 — Fixture coverage gap | P1 | Accepted for private use | 50+ fixtures before public |
| R3 — Browser rendering | P2 | Accepted for private use | Manual QA in 4 browsers |
| R4 — Large dataset perf | P2 | Untested | Manual test 500+ jobs |
| R5 — Network resilience | P2 | Partially tested | Manual test with throttling |
| R6 — n8n deferred | P2 | Accepted, pending decision | Go/no-go decision |
| R7 — AI provider runtime validation | P2 | Implemented, broader live validation pending | Manual QA with real key |
| R8 — API key storage | P1 | Accepted for personal MVP | Evaluate for public release |
| SEC-SERVER-AUTH-001 — Companion server identity | P1 | Accepted risk with public-release gate; not technically fixed | Authenticated IPC, pinned local TLS, or equivalent before public release |
| R9 — Name/trademark | P3 | Not checked | Before public submission |
| R10 — Manual QA pending | P1 | Initial runtime rerun completed for Phase 1 core | Expand before public release |
| R11 — Contributor docs gap | P2 | Accepted for private use | Before broader sharing |

---

## Risk Acceptance

For **private/personal use Phase 1 release**, the following risks are explicitly accepted:

- R2 (22 fixtures instead of 50+)
- R6 (n8n deferred — PHASE-1-SIGNOFF)
- R8 (plaintext key storage)
- SEC-SERVER-AUTH-001 (server identity is a public-release gate; not a private dogfood blocker)
- R10 (full matrix not yet run — core closeout passed)
- R11 (contributor onboarding still thin)

For **public release**, all P1 risks must be resolved. P2 risks must be at minimum documented with mitigation plans. Public release prerequisites are documented in `docs/development/public-release-prerequisites.md`.
