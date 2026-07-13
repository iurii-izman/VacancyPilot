# AI Agent Instructions

This repository is specification-first. Before making implementation changes, read:

1. `docs/Техническое заданиеV.1.md`
2. Relevant files in `docs/search/` only when validating a product or architecture decision.

## Product Boundaries

VacancyPilot is a local-first, read-first HH.ru copilot. It helps the user analyze vacancies, prepare cover letters, and track job search history.

Do not turn the project into an auto-apply bot.

Forbidden in Core:

- auto-submit;
- auto-clicks on HH controls;
- programmatic writes to HH form fields;
- synthetic DOM events for HH forms;
- hidden fetches to HH pages or endpoints;
- CAPTCHA or antibot bypass;
- cookies, passwords, or HH session handling;
- developer telemetry by default.

## Technical Direction

Use the stack fixed in the specification unless the spec is intentionally updated:

- WXT
- Manifest V3
- TypeScript
- React
- Dexie / IndexedDB
- `chrome.storage.local`

Keep permissions minimal. Do not add broad host permissions or sensitive extension permissions without updating the spec and explaining the reason.

## Development Workflow

- Keep changes small and aligned with the current phase.
- Prefer parser fixtures and tests over live HH scraping.
- Treat manifest changes as security-sensitive.
- Keep AI and n8n opt-in with payload preview.
- Update the specification when changing product boundaries, permissions, data model, or external data flows.

## Commit Hygiene

- Use clear, short commit messages.
- Do not commit generated build outputs, secrets, API keys, browser profiles, or local logs.
- If adding implementation code, include the relevant test or fixture coverage in the same change when practical.
