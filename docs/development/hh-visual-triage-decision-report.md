# HH Visual Triage Decision Report

Source concept: `docs/vacancypilot_hh_visual_triage_concept_2026-06-22.md`

Purpose: convert the concept into a realistic Codex implementation pack that respects current product boundaries and the already shipped search-triage baseline.

## Executive Decision

The idea is worth building, but not as a generic "visited highlighter" and not as a wide multi-surface platform pass.

The right MVP is:

```text
local visit marks + richer search-card highlights
```

The wrong first move would be:

- adding `history`;
- importing browser history;
- creating viewed-only `jobs`;
- triggering scoring from search pages;
- piling company history, duplicates, and saved-search snapshots into the same first PR.

## Why This Fits VacancyPilot

The concept is aligned with the current product in four ways:

1. it is local-first and read-first;
2. it improves the HH search workflow directly, which is already a real product surface;
3. it can reuse the search-card parser and quick-action infrastructure from `EPIC-20`;
4. it does not require new install permissions if implemented correctly.

## Current Baseline Assessment

From the current repository state:

- `entrypoints/search.content.ts` already parses visible HH search cards and injects extension-owned badge UI;
- current search badges are driven mainly by `chrome.storage.local` badge state, which is too narrow for the new viewed/search-triage layer;
- `entrypoints/vacancy.content.ts` already detects vacancy pages and is therefore the right place to emit "viewed" events;
- Dexie schema/export/delete flows already exist and are the correct home for visit marks;
- settings already live in `chrome.storage.local`, so Search Highlights settings can fit the current pattern cleanly.

Conclusion:

We should not bolt this feature onto the current `badge_v1_hh_*` storage shape alone. We should add a dedicated local visit-mark layer and then build a batched search highlight state on top of `visitMarks + jobs + settings`.

## Scope Decision

### MVP accepted now

Included in the next pack:

1. local `visitMarks` table in IndexedDB;
2. automatic view recording on user-opened HH vacancy pages;
3. batched search-card highlight state using local data only;
4. safe card-level visual treatments for viewed/saved/rejected/known score;
5. Search Highlights settings in the current settings UI;
6. export/delete/test coverage for the new data.

### Explicitly deferred

Not included in the first pack:

1. browser history import or `history` permission;
2. `tabs` permission;
3. search snapshots / "new since last search";
4. company history counters on cards;
5. duplicate hints;
6. resume/candidate-page support;
7. AI scoring from search results;
8. broad toolbar/filtering logic beyond small local toggles.

## Architecture Recommendation

### 1. Keep viewed-only data separate from saved jobs

Do not create `Job` rows just because a vacancy page was opened.

Reason:

- it pollutes tracker semantics;
- it makes dashboard/Kanban noisier;
- the concept explicitly distinguishes lightweight seen-state from saved workflow state.

### 2. Add a dedicated `visitMarks` store

The concept is correct here. A dedicated store is the cleanest option.

Recommended MVP shape:

```ts
interface VisitMark {
  id: string; // hh_vacancy_<vacancyId>
  source: "hh";
  sourceType: "vacancy";
  sourceId: string;
  normalizedUrl?: string;
  title?: string;
  companyName?: string;
  companyId?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  viewCount: number;
  firstSeenSessionId?: string;
  lastSeenSessionId?: string;
}
```

Keep `lastSearchQuery`, `lastSearchUrl`, and `manuallyHidden` out of the first row unless they become immediately necessary. They are valid extensions, but not required for MVP correctness.

### 3. Resolve highlights through a batched service boundary

Recommended flow:

```text
search.content.ts
  -> parse visible cards
  -> send visible vacancyIds to background
  -> background/service loads visitMarks + jobs + settings
  -> returns CardHighlightState[]
  -> content script renders extension-owned UI
```

Why:

- keeps Dexie/repository logic out of the content script surface;
- reuses the background as the safe state boundary;
- allows the renderer to stay lightweight and DOM-focused.

### 4. Keep `chrome.storage.local` only for settings and legacy badge compatibility

Do not move the main highlight state into `chrome.storage.local`.

Reason:

- viewed/search-triage state will grow;
- Dexie already exists and is the better fit;
- `chrome.storage.local` should remain settings-first plus small bridge data.

## Implementation Shape

This should be one epic with three large Codex iterations.

### ITER-079

Foundation:

- model + schema + migration;
- repository/service helpers;
- vacancy-page view recording;
- export/delete coverage;
- settings shape baseline;
- release-safety assertions for no new permissions.

### ITER-080

Core user value:

- batched highlight-state pipeline;
- viewed/saved/rejected/known-score card rendering;
- dim/hide rejected behavior;
- runtime tests and search-surface hardening.

### ITER-081

Finish the MVP:

- settings UI section;
- optional small local search-surface controls;
- manual QA report and residual-risk capture;
- final polish to make the feature operable, not just implemented.

## Risks To Manage

### HH DOM drift

Search cards are dynamic and HH can re-render them. The implementation must reuse the current dynamic-list protections instead of reinventing them.

### Render duplication

The current search surface already attaches badge hosts. The new renderer must avoid double-hosting and should extend or replace the current host contract deliberately.

### Settings drift

Settings must be normalized through the existing bridge; do not let search-content read ad hoc setting keys.

### Data-lifecycle completeness

`visitMarks` must be covered by:

- migrations;
- export;
- delete all;
- delete-job behavior where applicable;
- tests.

### Product-semantics drift

Viewed-only records must not appear as saved jobs or pollute downstream queues and Kanban views.

## Recommendation

Proceed with `EPIC-38` as a Codex-led MVP pack after the current runtime/UI/search surfaces are stable enough that we are not layering new search UI on top of unresolved search UI bugs.
