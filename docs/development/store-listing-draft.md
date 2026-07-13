# Chrome Web Store Listing Draft — VacancyPilot

Status: first real release baseline
Date: 2026-06-22

This file contains ready-to-edit store copy and review-facing text for a future public release. It is intentionally narrower than the full public-release prerequisites checklist.

## Candidate Name

VacancyPilot

## Short Description

Local-first HH.ru job-search copilot for vacancy scoring, cover letters, and tracking without auto-apply.

## Full Description

VacancyPilot is a local-first, read-first browser extension for HH.ru.

It helps you:

- analyze vacancies you open yourself;
- score opportunities against your profile with an explainable breakdown;
- track saved, applied, interview, offer, rejected, and archived statuses;
- review HR timeline events captured from user-opened HH surfaces;
- generate and edit cover-letter drafts with optional BYOK AI assistance;
- export your local data as JSON or CSV.

VacancyPilot is explicitly designed around safety boundaries:

- no auto-submit;
- no auto-click on HH controls;
- no form autofill on HH pages;
- no hidden HH requests;
- no cookies or session handling;
- no telemetry by default.

All core product data stays local in your browser through IndexedDB and `chrome.storage.local`. Optional AI requests are user-triggered, previewed before sending, and routed directly to the user-configured provider.

## Permissions Justification

### `storage`

Stores the user's local vacancy history, statuses, profiles, settings, AI cache, and related extension data on the device.

### `sidePanel`

Opens the VacancyPilot side panel when the user clicks the extension UI or page badge.

### `activeTab`

Reads the currently active HH.ru page the user is already viewing in order to extract visible vacancy information and show analysis in the extension.

### Optional runtime host access: OpenAI

Requested only when the user explicitly enables AI and confirms an AI action. Used to send the reviewed payload directly to OpenAI with the user's own API key.

## Privacy / Support Links

- Privacy policy: `https://github.com/VacancyPilot/VacancyPilot/blob/main/PRIVACY.md`
- Support: `https://github.com/VacancyPilot/VacancyPilot/blob/main/.github/SUPPORT.md`
- Security: `https://github.com/VacancyPilot/VacancyPilot/security/advisories/new`

## Store Screenshot Plan

1. Popup on a real HH vacancy page
2. Side panel with score breakdown
3. Dashboard / vacancies workspace
4. Search triage badges on search results
5. AI payload preview / privacy surface

## Reviewer Notes

- The extension is read-first and local-first.
- It does not automate applications or form submission.
- It does not scrape hidden HH APIs.
- The optional AI flow is explicit, previewed, and BYOK.
- Webhook automation remains outside the current public-ready scope unless explicitly reopened later.
