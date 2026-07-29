# Codex Runtime Brief

Purpose: compact navigation and working context for late-stage implementation
iterations after the mandatory master-spec read.

Read `docs/Техническое заданиеV.1.md` before implementation as required by
`AGENTS.md`. Then use this brief to locate the constraints most likely to
matter for an ordinary late-stage row.

Re-read the relevant full-spec sections especially when:

- changing permissions or host access;
- changing the core data model in a way that affects product semantics broadly;
- changing external data flows;
- reopening deferred scope such as `n8n`;
- a product decision is unclear from the current epic/iteration docs.

## Product Boundary

VacancyPilot is a local-first, read-first HH.ru copilot.

It helps the user:

- analyze vacancies;
- track local job-search state;
- prepare cover letters;
- review HR communication;
- manage workflow safely.

It does not act on HH.ru instead of the user.

## Hard Constraints

Never introduce:

- auto-submit;
- auto-clicks on HH controls;
- programmatic writes to HH form fields;
- hidden HH fetch/XHR;
- cookie/session handling;
- CAPTCHA or antibot bypass;
- developer telemetry by default;
- broad host permissions;
- `history` permission unless the spec is explicitly reopened;
- `tabs` permission unless a dedicated approved iteration requires it.

## Current Technical Baseline

- WXT
- Manifest V3
- TypeScript
- React
- Dexie / IndexedDB
- `chrome.storage.local` for settings and small local bridge data

## Data / Settings Principles

- large structured local state belongs in IndexedDB;
- settings belong in `chrome.storage.local` through the settings bridge;
- API keys stay local and separate from IndexedDB/export;
- export/delete flows must stay complete when new tables are added.

## Search-Surface Principles

- inject only extension-owned UI;
- avoid mutating HH controls or forms;
- dynamic HH lists require dedupe and re-render protection;
- quick actions may change only local VacancyPilot state;
- do not trigger AI or hidden scoring from search results automatically.

## Implementation Discipline

- keep each iteration narrow;
- prefer existing repo patterns over inventing new architecture;
- add focused tests with the change;
- update docs when changing contracts, settings, schema, permissions, or external flow behavior.

## Current Pack Context

- `EPIC-37` is complete;
- `EPIC-38` and `ITER-079`..`ITER-081` are complete;
- HH Visual Triage / Search Highlights uses `visitMarks + jobs + settings`,
  never browser history;
- follow-up search-card discovery hardening is part of the current baseline.

## Source Priority

When documents conflict:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md`
3. target epic/iteration docs
4. this brief

The slim read set is a context optimization, not permission to override the
master specification. If a conflict or boundary ambiguity appears, read and
follow the full spec and update the narrower document.
