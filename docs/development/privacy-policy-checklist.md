# Privacy Policy Draft Checklist — VacancyPilot

Status: FUTURE PUBLIC-RELEASE CHECKLIST / reviewed 2026-09-01
Source: spec sections 20, 22.6, 26.4; EPIC-10

Use this checklist when drafting the public privacy policy. Each item must be addressed in the final policy document. A public privacy policy is **mandatory** for Chrome Web Store submission (spec 26.4).

---

## 1. Policy Metadata

- [ ] **Effective date**: Date the policy becomes active.
- [ ] **Last updated**: Date of most recent revision.
- [ ] **Version**: Policy version number.
- [ ] **Scope**: What the policy covers (VacancyPilot browser extension, not any developer website or backend).
- [ ] **Contact**: Email or other channel for privacy-related inquiries.

---

## 2. Data Collection

### 2.1 Data Stored Locally (browser and optional companion)

- [ ] **Vacancy data**: Title, company name, salary, description text, skills, URL, HH vacancy ID.
- [ ] **Status history**: User-assigned application statuses with timestamps.
- [ ] **User profiles**: Skills, experience, preferences entered by the user for scoring.
- [ ] **Cover letters**: Drafted and saved cover letter text.
- [ ] **Resume metadata**: Resume summary/highlights (if provided by user).
- [ ] **Settings**: User preferences (scoring weights, privacy mode, UI settings).
- [ ] **Event log**: Timestamps of user actions within the extension (status changes, exports, AI requests initiated).
- [ ] **AI cache**: Responses from AI provider, keyed by content hash (can be cleared by user).

In Standalone Mode this data is in Dexie/IndexedDB and `chrome.storage.local`. In Ops Mode operational records may be canonical in the user’s local SQLite companion; companion secrets use the OS keyring and the private engine package stays on local disk. None of this is synced to a developer cloud service.

### 2.2 Data NOT Collected

- [ ] HH.ru login credentials or session cookies.
- [ ] Browsing history (except the active vacancy page, read on user action).
- [ ] Personal identity information beyond what user enters in profiles.
- [ ] Location data (beyond what is on the vacancy page).
- [ ] Device identifiers or fingerprints.
- [ ] Any data from non-HH.ru websites.

---

## 3. Data Sent Externally

### 3.1 AI Provider (opt-in)

- [ ] Only when user clicks "Analyze" or "Generate Cover Letter".
- [ ] **What is sent**: Redacted vacancy text (title, company, skills, requirements). In Standard Privacy: cleaned description text. In Strict Privacy: description is excluded.
- [ ] **What is NOT sent**: Raw HTML, user identity, emails, phone numbers, URLs, cookies, tokens, resume full text.
- [ ] **Payload preview**: User sees exact payload before sending and can cancel.
- [ ] **Provider**: User-configured (BYOK). The extension does not route through developer servers.
- [ ] **Provider's privacy policy**: User is responsible for reviewing their chosen AI provider's privacy policy.

### 3.2 n8n Webhook (opt-in, Labs)

- [ ] Only when user enables n8n in Labs settings.
- [ ] **What is sent**: Event type, job ID, job title, company name, score, status, vacancy URL, timestamp.
- [ ] **What is NOT sent**: Full cover letter text, resume text, AI analysis results, user profile details.
- [ ] **Destination**: User-configured webhook URL. No developer-operated endpoint.
- [ ] **Retry**: Configurable retry with exponential backoff (no infinite retry).

### 3.3 No Other External Communication

- [ ] No analytics, crash reporting, or telemetry of any kind.
- [ ] No hidden browser-side HH requests. Explicit companion-side reads use only the official HH API when configured.
- [ ] No developer-operated backend or API.
- [ ] No third-party advertising or tracking.

---

## 4. Data Minimization

- [ ] **Redaction**: Emails, phone numbers, and URLs are stripped from text before any external request.
- [ ] **Strict Privacy mode**: Excludes vacancy description text and resume highlights from AI payloads.
- [ ] **HTML stripping**: Only plain text is extracted from vacancy pages; raw HTML is never stored or sent.
- [ ] **AI cache**: Cached AI responses are keyed by content hash and can be cleared.

---

## 5. User Controls

- [ ] **Export**: User can export all data as CSV or JSON at any time.
- [ ] **Delete all**: User can delete all locally stored data with one action.
- [ ] **AI cache clear**: User can clear cached AI responses independently.
- [ ] **AI disable**: AI features can be fully disabled (no key configured = no AI requests possible).
- [ ] **n8n disable**: n8n integration is off by default and can be toggled off (Labs).
- [ ] **Labs kill switch**: All experimental features can be disabled with a single toggle.
- [ ] **Permission management**: User can inspect the installed permissions in the browser extension settings and revoke all access by disabling or removing the extension. If future builds add optional permissions, disclose their grant/revoke flow explicitly.
- [ ] **Page badge toggle**: The content badge on HH.ru pages can be hidden.

---

## 6. Data Retention

- [ ] Data is stored on the user's device: browser storage in Standalone Mode and local companion SQLite/keyring/engine storage in Ops Mode.
- [ ] Data persists until the user deletes the relevant browser or companion data.
- [ ] Uninstalling the extension may remove browser-managed storage but does not necessarily remove companion data.
- [ ] No automatic data expiration or deletion (user controls retention).
- [ ] No backup or recovery mechanism (user is responsible for exports).

---

## 7. Security

- [ ] **Local storage**: Standalone data uses IndexedDB/`chrome.storage.local`; Ops data uses local SQLite and OS keyring as applicable.
- [ ] **API keys**: Standalone BYOK keys use `chrome.storage.local` with a plaintext/non-vault warning; companion provider/HH secrets use the OS keyring. Keys are never exported, synced, or sent to the developer.
- [ ] **HMAC secret**: n8n HMAC secret is stored in `chrome.storage.local` and masked in UI. Excluded from exports.
- [ ] **No remote code**: Extension does not load or execute remote code at runtime.
- [ ] **CSP**: Content Security Policy restricts external connections to user-configured hosts only.
- [ ] **Manifest V3**: Extension uses the latest Chrome extension platform with enhanced security model.

---

## 8. Third-Party Services

- [ ] **AI Provider**: User chooses and configures their own AI provider. The extension is a client, not a service. User is subject to their chosen provider's terms and privacy policy.
- [ ] **n8n**: User hosts their own n8n instance. The extension sends events to the user-configured webhook URL. User is responsible for their n8n instance security.
- [ ] **No other third parties**: No CDNs, no analytics services, no authentication providers, no external fonts or scripts.

---

## 9. Children's Privacy

- [ ] Extension is not directed at children under 13 (or relevant age in jurisdiction).
- [ ] No knowingly collected data from children.

---

## 10. Policy Changes

- [ ] How users will be notified of policy changes (extension update notes, GitHub releases).
- [ ] Material changes require renewed user acknowledgment (e.g., onboarding update).

---

## 11. Jurisdiction and Compliance

- [ ] **Applicable law**: Specify governing jurisdiction (e.g., Russian Federation for HH.ru focused tool).
- [ ] **GDPR considerations**: If EU users are expected — data minimization, user consent, right to access (export), right to deletion (delete all), no automated decisions without human involvement.
- [ ] **Russian 152-ФЗ considerations**: If Russian users — local data storage, consent for data processing.

---

## 12. Hosting the Policy

The privacy policy must be publicly accessible at a stable URL. Options:

- [ ] GitHub Pages (`https://<username>.github.io/vacancy-pilot/privacy`)
- [ ] Project website
- [ ] Raw GitHub file (`https://github.com/<username>/vacancy-pilot/blob/main/PRIVACY.md`)
- [ ] Google Docs (published to web)

The URL must be included in:
- [ ] Chrome Web Store listing (privacy policy field).
- [ ] Extension settings or About page.

---

## Draft Checklist Summary

| Section | Status |
|---------|--------|
| 1. Policy metadata | Not started |
| 2. Data collection | Checklist complete — aligned with current codebase as of ITER-064 |
| 3. Data sent externally | Checklist complete — aligned with current codebase |
| 4. Data minimization | Checklist complete — redaction, Strict Privacy, HTML stripping all implemented |
| 5. User controls | Checklist complete — export, delete, AI disable, n8n disable, Labs kill switch all implemented |
| 6. Data retention | Checklist complete — local-only storage confirmed |
| 7. Security | Checklist complete — Manifest V3, CSP, no remote code confirmed |
| 8. Third-party services | Checklist complete |
| 9. Children's privacy | Not started |
| 10. Policy changes | Not started |
| 11. Jurisdiction | Not started |
| 12. Hosting | Not started |

**Note**: This is a checklist, not a drafted policy. Drafting the actual policy document belongs to the public-release epic (EPIC-26, backlog).
