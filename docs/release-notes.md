# VacancyPilot — Private Alpha Release Notes

**Version**: 0.1.0
**Date**: 2026-06-22
**Status**: Private alpha / dogfooding build
**Target**: First real private release baseline

---

## Overview

VacancyPilot is a **local-first, read-first HH.ru job search copilot**. It helps candidates analyze vacancies, score opportunities, generate cover letters, and track their job search — all without risking their HH.ru account.

**Core principle**: decision quality over automation. The extension reads, scores, and assists. It never auto-applies, auto-clicks, or fills HH forms.

---

## What's Included

### Vacancy Parser
- Extracts title, company, salary, description, skills from HH.ru vacancy pages.
- Uses JSON-LD as primary source with DOM fallback.
- Handles archived/removed vacancies gracefully.

### Local Tracker
- Save vacancies to local database (IndexedDB via Dexie).
- Track application status: Saved → Applied → Interview → Offer → Rejected → Archived.
- Full status history with timestamps.
- Dashboard shell and local data views.

### Rule-Based Scoring
- Explainable 0–100 score without AI.
- Factor breakdown: title match, skills, experience, work mode, salary, company preference.
- Configurable scoring weights and thresholds.
- User profiles with skills and preferences.

### AI Analysis (opt-in)
- BYOK (Bring Your Own Key) architecture.
- Payload preview before every request — see exactly what is sent.
- Redaction of emails, phones, URLs before external requests.
- Strict Privacy mode excludes description and resume text.
- AI cache with configurable controls.
- Real OpenAI provider is implemented and gated behind explicit user action.
- Mock provider remains available for local testing.

### Cover Letter Studio
- Generate cover letters using AI with multiple modes (short, full, concise).
- Edit, save, and copy letters.
- Saved letters persist locally and can be reused from the vacancy workflow.

### Export & Data Ownership
- Export all data as CSV or JSON.
- Delete all data with one action.
- No data lock-in — all data is local.

### Privacy & Safety
- No telemetry, no analytics, no developer backend.
- All data stored locally (IndexedDB, chrome.storage.local).
- AI and n8n features are opt-in and off by default.
- Labs kill switch disables experimental features.
- Onboarding explains permissions, storage, and non-goals.

### Extension UI
- Content badge on HH.ru vacancy pages (Shadow DOM isolated).
- Side panel with vacancy details, score, and actions.
- Popup shell with vacancy detection and navigation.
- Dashboard/options shell with responsive navigation, onboarding, About surface, export and privacy controls.
- Search-result quick actions for Save / Reject triage.
- Workflow queue, company greylist, reminders, and HR follow-up workspace.

---

## What's NOT Included

### Deferred from Phase 1
- **n8n / Telegram integration** (ITER-014): UI placeholders exist, implementation deferred pending go/no-go decision.
- **Guided apply**: Still Labs-scoped and intentionally not part of the core product promise.
- **Multi-site support** (Phase 6).

### Forbidden by Design (never in Core)
- Auto-submit or auto-apply.
- Auto-click on HH controls.
- Programmatic form fill on HH pages.
- Synthetic DOM events for HH fields.
- Hidden fetches to HH endpoints.
- CAPTCHA or antibot bypass.
- Cookie/session handling.
- Developer telemetry.

---

## Technical Details

| Item | Detail |
|------|--------|
| Platform | Chrome Extension Manifest V3 |
| Framework | WXT 0.20.26 |
| UI | React 19 |
| Storage | Dexie 4 (IndexedDB) + chrome.storage.local |
| Language | TypeScript 6 |
| Tests | 1615 automated tests across 60 files |
| Permissions | `storage`, `sidePanel`, `activeTab` |
| Optional runtime host access | `https://api.openai.com/*` |
| Release-safety tests | 373 tests across 9 files |
| Build size | ~700 KB unpacked production output |

---

## Known Limitations

### Parser Coverage
Current parser coverage is 22 fixtures (19 vacancy + 3 search cards). This is materially better than the earliest MVP baseline but still below the 50+ public-release target.

### AI Provider
OpenAI is implemented, but live browser QA with a real API key still belongs to the public-ready validation path. Alternative providers remain backlog work.

### API Key Storage
API keys are stored in `chrome.storage.local` as plaintext. This is acceptable for personal use but should be hardened before public release (see spec 26.6).

### Browser Testing
Core runtime reruns in Chrome and Edge were reported as successful earlier in the project, but the full public-release regression matrix still needs a fresh broad rerun after the latest UI and AI changes.

### Large Datasets
Performance with 500+ tracked vacancies is untested. Export and dashboard operations may be slow with large datasets.

### n8n Integration
Not implemented (deferred). Event logging infrastructure exists but no external delivery.

---

## Installation

For private/personal use, build from source:

```bash
git clone <repo-url>
cd vacancy-pilot
pnpm install
pnpm build
```

Load `.output/chrome-mv3/` as unpacked extension in Chrome (Developer mode).

See `docs/development/private-install-guide.md` for detailed instructions.

---

## Documentation

| Document | Location |
|----------|----------|
| Specification | `docs/Техническое заданиеV.1.md` |
| Development plan | `docs/development/00-product-development-plan.md` |
| Iteration map | `docs/development/02-iteration-map.md` |
| QA checklist | `docs/development/qa-checklist.md` |
| Known risks | `docs/development/known-risks.md` |
| Install guide | `docs/development/private-install-guide.md` |
| Public release prereqs | `docs/development/public-release-prerequisites.md` |
| Privacy policy checklist | `docs/development/privacy-policy-checklist.md` |

---

## What's Next

| Priority | Item | Iteration |
|----------|------|-----------|
| P0 | Execute full manual QA in 2+ browsers on the current feature surface | Follow-up |
| P0 | Expand parser fixtures to 50+ | Follow-up |
| P1 | Resolve API key storage approach | Spec 26.6 |
| P1 | Prepare store assets, public policy hosting, and permissions justification | EPIC-26 |
| P2 | Keep n8n deferred unless permission model is intentionally reopened | ITER-014 / ITER-043 |
| P2 | Expand contributor onboarding docs | Future |
| P2 | Test performance with 500+ jobs | Manual QA |

---

## Acknowledgments

Built with WXT, React, TypeScript, Dexie, and Vitest. AI-assisted development using Cursor/Codex and Zed autopilot workflow.
