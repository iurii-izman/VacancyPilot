# VacancyPilot — HH Visual Triage / Search Highlights Concept Pack

**Дата:** 2026-06-22

**Проект:** `VacancyPilot/VacancyPilot`

**Статус документа:** product/technical concept для Codex analysis и последующего разбиения на implementation prompts.
**Цель:** аккуратно встроить идею подсветки просмотренных вакансий HH.ru в текущий VacancyPilot без раздувания scope, без новых опасных permissions и без отхода от privacy-first / local-first принципов.

---

## 1. Краткое резюме идеи

Вдохновение: простое расширение, которое подсвечивает посещённые вакансии/резюме на hh.ru.

Но для VacancyPilot лучше не делать отдельную “красную подсветку посещённых”, а встроить более полезный слой:

```text
HH Visual Triage / Search Highlights
```

Суть:

- на страницах поиска HH.ru визуально помечать вакансии, которые пользователь уже открывал;
- показывать локальные статусы VacancyPilot: viewed, saved, rejected, applied, interview, offer;
- показывать score, если он уже известен;
- показывать view count / last seen;
- позже — company history, duplicate hints, new since last search;
- помогать быстро ориентироваться в большом списке вакансий без повторных кликов.

Ключевой принцип:

```text
Не читать browser history в MVP.
Не добавлять permission "history".
Не делать скрытые запросы к HH.
Не расширять host permissions.
Использовать только локальные данные VacancyPilot.
```

---

## 2. Почему не просто “красить посещённое красным”

Простая красная подсветка решает только одну задачу: “я уже открывал эту страницу”.

VacancyPilot уже знает больше:

- вакансия сохранена или отклонена;
- рассчитан score;
- есть risk flags;
- есть profile match;
- есть company history;
- есть local application status;
- есть search-page quick actions;
- есть dashboard/Kanban.

Поэтому правильная фича — не `Visited Highlighter`, а **Visual Triage Layer**:

```text
new / viewed / saved / rejected / applied / score / risk / duplicate / company history
```

Это превращает поиск на HH из линейного просмотра карточек в управляемую воронку.

---

## 3. Current VacancyPilot baseline, с которым нужно синхронизироваться

Текущие принципы проекта:

```text
read-first
local-first
no auto-submit
no auto-click on HH controls
no hidden HH fetch/XHR
no cookies/session handling
no broad host permissions
no telemetry by default
AI/Labs opt-in only
```

Текущие permissions:

```text
storage
sidePanel
activeTab
```

Текущие install host permissions:

```text
host_permissions: []
```

Optional host access сейчас должен оставаться узким, например:

```text
https://api.openai.com/*
```

Для Search Highlights **не требуется**:

```text
history
tabs
webRequest
cookies
scripting
https://hh.ru/*
<all_urls>
```

Текущие технические блоки, с которыми нужно интегрироваться:

| Блок | Как использовать |
|---|---|
| `entrypoints/search.content.ts` | Парсинг видимых карточек поиска и инъекция extension-owned UI |
| `entrypoints/vacancy.content.ts` | Фиксация факта открытия vacancy page |
| Dexie / IndexedDB | Хранение visit marks, snapshots, локальных статусов |
| `jobs` table | Источник saved/rejected/applied/status/score |
| `companies` table | Источник company history |
| `profiles` | Источник avoid keywords / scoring context |
| `badge-state` | Можно переиспользовать часть логики для card chips |
| `settings-bridge` | Настройки визуальной подсветки |
| release-safety tests | Должны продолжать запрещать hidden HH fetch / auto-click / form writes |

---

## 4. Privacy / permission rationale

### 4.1. Почему не использовать Chrome History API в MVP

Chrome History API позволяет читать/искать историю браузера, но для него требуется permission:

```json
"history"
```

Это чувствительное разрешение и серьёзный privacy red flag. Для VacancyPilot оно не нужно на MVP-этапе.

MVP должен фиксировать только те вакансии, которые пользователь открыл при активном установленном VacancyPilot:

```text
user opens hh.ru/vacancy/123
content script detects page
VacancyPilot stores local VisitMark
search page highlights vacancy 123 later
```

Такой подход:

- не читает всю историю браузера;
- не знает, что пользователь посещал вне контекста VacancyPilot;
- не требует `history`;
- лучше соответствует privacy-first обещанию.

### 4.2. Почему не полагаться на CSS `:visited`

CSS `:visited` ограничен браузерами по privacy причинам. Нельзя надёжно читать visited state через JS, нельзя использовать его как полноценную основу для карточек и сложной визуализации.

Поэтому VacancyPilot должен использовать собственную локальную историю просмотров.

### 4.3. Почему visit marks лучше хранить в IndexedDB, а не `chrome.storage.local`

`chrome.storage.local` хорош для настроек и небольших данных, но visual triage может накопить тысячи записей. В проекте уже есть Dexie/IndexedDB, и это лучшее место для:

- visit marks;
- search snapshots;
- company visit summaries;
- duplicate hints.

`chrome.storage.local` оставить для настроек:

- enabled/disabled;
- color mode;
- dim rejected;
- hide rejected;
- show score;
- badge style.

---

## 5. Scope control

### MVP scope

```text
MVP = подсветить карточки вакансий на HH search page по локальному состоянию VacancyPilot.
```

Включить:

1. Local vacancy visit marks.
2. Mark vacancy as viewed when user opens HH vacancy page.
3. Highlight visible search result cards by local state.
4. Show compact chip: viewed/saved/rejected/score.
5. Settings:
   - Enable search highlights;
   - Highlight viewed;
   - Highlight saved/rejected;
   - Dim rejected;
   - Show score chip.
6. Export/delete includes visit marks.
7. Tests + manual QA report.

### Explicit non-goals for MVP

Не включать:

- Chrome browser history import;
- permission `history`;
- host permission `https://hh.ru/*`;
- hidden fetch to HH;
- resume/candidate page support;
- AI scoring on search page;
- LLM similarity/deduplication;
- sync/cross-device;
- auto-hide by default;
- automatic application actions;
- mutation of HH forms/controls;
- telemetry.

---

## 6. Proposed naming

В UI:

```text
Search Highlights
```

В документации/архитектуре:

```text
HH Visual Triage
```

В коде:

```text
visual-triage
search-highlights
visit-marks
```

---

## 7. User stories

### US-01 — Seen vacancies

Как пользователь, я хочу видеть, какие вакансии уже открывал, чтобы не тратить время на повторные клики.

Acceptance:

```text
Открытая vacancy page создаёт/обновляет VisitMark.
На search page карточка этой вакансии получает Viewed chip.
```

### US-02 — Saved/rejected visibility

Как пользователь, я хочу видеть прямо в выдаче, что вакансия уже сохранена или отклонена.

Acceptance:

```text
Saved vacancies show Saved chip.
Rejected vacancies show Rejected chip.
Rejected can be dimmed if setting enabled.
```

### US-03 — Score visibility

Как пользователь, я хочу видеть score в выдаче, если вакансия уже оценена.

Acceptance:

```text
Known scored cards show VP score chip.
Unknown cards do not trigger scoring automatically.
```

### US-04 — Session navigation

Как пользователь, я хочу видеть, какие вакансии уже открывал сегодня/в этой сессии.

Acceptance:

```text
Cards opened in current session show Seen today / Seen now marker.
```

### US-05 — Company repetition

Как пользователь, я хочу понимать, что эта компания уже встречалась много раз.

Acceptance for V2:

```text
Company seen count shown if locally known.
Company rejected history shown if locally known.
```

---

## 8. Visual states

### Recommended visual hierarchy

Не заливать всю карточку ярким цветом. Использовать:

```text
left border + subtle background + compact chip
```

| State | Meaning | Visual treatment |
|---|---|---|
| New | Не видели | No highlight / neutral |
| Viewed | Открывали, не сохранили | Gray left stripe + `Viewed` chip |
| Viewed today | Открывали сегодня | Gray/blue chip `Seen today` |
| Saved | Сохранено | Blue stripe + `Saved` chip |
| Rejected | Отклонено мной | Red/rose stripe + `Rejected` chip; optional dim |
| Applied | Отклик | Violet/blue chip |
| Interview | Интервью | Purple chip |
| Offer | Оффер | Green/gold chip |
| High score | Strong match | Green score chip / subtle outline |
| Risk | Есть risk flags | Amber dot/chip |
| Blacklist company | Нежелательная компания | Dark red warning stripe |
| Duplicate | Похожая/повторная вакансия | Small duplicate icon/chip |

### Suggested compact chip examples

```text
VP · 87 · saved
VP · viewed · 3x
VP · rejected
VP · 47 · risk
```

### Color rules

| Category | Color |
|---|---|
| Viewed | gray |
| Saved | blue |
| Rejected | red/rose |
| Applied | violet |
| Interview | purple |
| Offer | green/gold |
| Strong score | green |
| Risk | amber |
| Blacklist | dark red |

Accessibility:

- never rely on color only;
- use text chips;
- add `aria-label`;
- support colorblind-safe mode later.

---

## 9. Data model

### 9.1. New table: `visitMarks`

Prefer a separate table instead of polluting `jobs`.

```ts
export interface VisitMark {
  id: string;                    // hh_vacancy_<vacancyId>
  source: "hh";
  sourceType: "vacancy";         // resume later, not MVP
  sourceId: string;              // HH vacancyId
  normalizedUrl?: string;

  title?: string;
  companyName?: string;
  companyId?: string | null;

  firstSeenAt: string;
  lastSeenAt: string;
  viewCount: number;

  firstSeenSessionId?: string;
  lastSeenSessionId?: string;

  lastSearchQuery?: string;
  lastSearchUrl?: string;

  lastKnownJobId?: string | null;
  lastKnownStatus?: JobStatus | "viewed";
  lastKnownScore?: number;

  manuallyHidden?: boolean;
}
```

### 9.2. Optional V2 table: `searchSnapshots`

```ts
export interface SearchSnapshot {
  id: string;                    // hash(normalized search URL)
  source: "hh";
  searchUrl: string;
  searchFingerprint: string;
  query?: string;
  createdAt: string;
  updatedAt: string;
  vacancyIds: string[];
  totalVisibleCount?: number;
}
```

### 9.3. Optional V2 derived model: `CompanyHistorySummary`

May be computed from existing `jobs`, `companies`, and `visitMarks`, not necessarily stored.

```ts
interface CompanyHistorySummary {
  companyName: string;
  seenVacancies: number;
  savedVacancies: number;
  rejectedVacancies: number;
  lastSeenAt?: string;
}
```

---

## 10. Settings model

Add to settings:

```ts
interface SearchHighlightSettings {
  enabled: boolean;

  markOpenedVacanciesAsViewed: boolean;

  showViewed: boolean;
  showSaved: boolean;
  showRejected: boolean;
  showApplied: boolean;
  showScore: boolean;
  showViewCount: boolean;
  showSessionMarks: boolean;

  dimRejected: boolean;
  hideRejected: boolean;

  showCompanyHistory: boolean;
  showDuplicateHints: boolean;

  style: "minimal" | "compact" | "detailed";
  placement: "left-border" | "chip" | "both";
  colorMode: "default" | "colorblind-safe" | "monochrome";
}
```

MVP defaults:

```ts
{
  enabled: true,
  markOpenedVacanciesAsViewed: true,
  showViewed: true,
  showSaved: true,
  showRejected: true,
  showApplied: true,
  showScore: true,
  showViewCount: true,
  showSessionMarks: false,
  dimRejected: true,
  hideRejected: false,
  showCompanyHistory: false,
  showDuplicateHints: false,
  style: "compact",
  placement: "both",
  colorMode: "default",
}
```

---

## 11. UI integration

### 11.1. Search page cards

Add extension-owned UI only:

```text
Shadow DOM / extension-owned host
No mutation of HH forms
No mutation of HH buttons
No auto-click
No hidden fetch
```

Possible placement:

- top-right of vacancy card;
- under title;
- left border on root card;
- compact status chip area.

### 11.2. Search page summary toolbar

MVP optional; V2 better.

```text
VacancyPilot: 42 cards · 10 new · 18 viewed · 4 saved · 6 rejected
[Dim rejected] [Hide rejected] [Only new] [Strong matches]
```

For MVP, maybe skip toolbar and just inject chips.

### 11.3. Settings UI

Add new section:

```text
Settings → Search Highlights
```

Minimum fields:

```text
Enable search highlights
Highlight viewed vacancies
Show score chips
Dim rejected vacancies
Hide rejected vacancies
Show view count
Color mode
```

### 11.4. Dashboard integration

Add small stats card later:

```text
Search triage:
- Viewed vacancies: 123
- Viewed today: 14
- Rejected from search: 8
- Saved from search: 5
```

Not MVP unless easy.

---

## 12. Technical architecture

```text
vacancy.content.ts
  └─ on HH vacancy page open:
       extract vacancyId/title/company
       upsert VisitMark

search.content.ts
  └─ on HH search page:
       parse visible cards
       extract vacancyIds
       send ids to extension service/repo
       receive CardHighlightState[]
       render chips/stripes

src/db/visit-mark-repository.ts
  └─ upsertViewed()
  └─ getBySourceIds()
  └─ clear/delete/export support

src/services/search-highlights.ts
  └─ buildCardHighlightState()
  └─ combine visitMarks + jobs + settings

src/models/search-highlights.ts
  └─ VisitMark
  └─ HighlightSettings
  └─ CardHighlightState

src/db/schema.ts
  └─ add visitMarks table / schema version bump

src/services/export-data.ts
src/services/delete-all.ts
  └─ include visitMarks through TABLE_NAMES if schema source of truth is current

entrypoints/options/App.tsx
  └─ settings section for Search Highlights
```

---

## 13. CardHighlightState

```ts
export interface CardHighlightState {
  source: "hh";
  vacancyId: string;

  state:
    | "new"
    | "viewed"
    | "saved"
    | "rejected"
    | "applied"
    | "interview"
    | "offer";

  score?: number;
  recommendation?: "strong" | "good" | "maybe" | "skip";

  viewCount?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  seenThisSession?: boolean;

  companySeenCount?: number;
  duplicateHint?: "exact" | "same-title-company" | null;

  riskLevel?: "none" | "low" | "medium" | "high";
  chips: Array<{
    label: string;
    tone: "neutral" | "blue" | "green" | "amber" | "red" | "purple";
  }>;

  dim: boolean;
  hide: boolean;
}
```

---

## 14. Status priority

If multiple states exist, display priority:

```text
offer > interview > applied > rejected > saved > viewed > new
```

Score is additional, not primary status.

Examples:

| Job status | Visit mark | Display |
|---|---|---|
| none | none | no chip |
| none | viewed | Viewed |
| saved | viewed | Saved + score |
| rejected_by_me | viewed | Rejected + dim |
| applied | viewed | Applied |
| interview | viewed | Interview |
| offer | viewed | Offer |

---

## 15. Event logic

### Vacancy page opened

When content script detects vacancy page:

1. Extract vacancyId from URL.
2. Extract title/company if available.
3. Upsert VisitMark:
   - if new: set firstSeenAt, viewCount = 1;
   - if existing: update lastSeenAt, viewCount += 1.
4. Do not save full vacancy as `Job` unless user clicks Save.
5. Do not run scoring automatically unless already saved or user action.

### Search page loaded

1. Parse visible cards.
2. Extract vacancyId from card links.
3. Batch query local state by vacancyIds.
4. Build highlight states.
5. Render extension-owned chips/stripes.
6. Observe DOM changes / pagination / infinite loading carefully.

### Search page DOM changes

Use MutationObserver with debounce:

```text
debounce 300–500ms
batch IDs
do not re-render duplicate hosts
cleanup when cards disappear
```

---

## 16. Testing strategy

### Unit tests

- `upsertVisitMark()`:
  - creates first mark;
  - updates existing mark;
  - preserves `firstSeenAt`;
  - increments `viewCount`;
  - updates `lastSeenAt`.

- `buildCardHighlightState()`:
  - new card;
  - viewed card;
  - saved card;
  - rejected card;
  - score chip;
  - dim rejected setting;
  - hide rejected setting.

- settings defaults.

- export/delete includes `visitMarks`.

### Static release safety

Ensure tests still catch:

- no hidden HH fetch;
- no XMLHttpRequest;
- no auto-click;
- no value mutation;
- no broad host permissions;
- no history permission;
- no tabs permission.

Add release-safety test:

```text
manifest does not request "history"
manifest does not request "tabs"
manifest does not request "https://hh.ru/*"
```

### Manual QA

| Case | Expected |
|---|---|
| Open vacancy page | VisitMark created |
| Reopen same vacancy | viewCount increments |
| Search page card for opened vacancy | Viewed chip appears |
| Save vacancy | Saved chip appears |
| Reject vacancy | Rejected chip + dim appears |
| Toggle dim rejected off | Card opacity returns |
| Hide rejected on | Rejected card hidden/collapsed |
| Disable highlights | All chips/stripes removed |
| Export JSON | visitMarks included |
| Delete all data | visitMarks cleared |
| No new permissions | Confirm manifest/Chrome details |

---

## 17. Safety requirements

Must keep:

```text
No auto-submit
No HH auto-click
No HH form writes
No hidden HH fetch/XHR
No cookies/session handling
No browser history permission
No tabs permission
No broad host permissions
No telemetry
No AI calls on search page
No scoring requests on search page
```

Search highlights should be local and deterministic.

---

## 18. Phased implementation

## EPIC-HH-TRIAGE-01 — Local Visit Marks

Goal: record local vacancy page visits.

Scope:

- Add `visitMarks` model/table/repo.
- Upsert on vacancy page open.
- Include export/delete.
- Tests.

Acceptance:

```text
Opened vacancy page creates/updates VisitMark.
firstSeenAt stable.
lastSeenAt updates.
viewCount increments.
No new permissions.
No HH fetch.
Export/delete includes visitMarks.
```

## EPIC-HH-TRIAGE-02 — Search Card Highlights MVP

Goal: show local visual status on HH search result cards.

Scope:

- Search page parser maps visible card → vacancyId.
- Batch read local state.
- Render chips and left stripe.
- Settings:
  - enabled;
  - show viewed;
  - show saved/rejected;
  - dim rejected;
  - show score.
- Tests + manual QA report.

Acceptance:

```text
Viewed cards highlighted.
Saved/rejected statuses shown.
Score shown if known.
No aggressive full-card red by default.
No HH controls mutated.
No new permissions.
```

## EPIC-HH-TRIAGE-03 — Search Triage Controls

Goal: add search page mini-toolbar.

Scope:

- Counts: new/viewed/saved/rejected.
- Toggle dim rejected.
- Toggle hide rejected.
- Toggle only new.
- Persist settings.

Acceptance:

```text
Counts match visible cards.
Toggles affect only extension UI/display.
No data loss.
No hidden network.
```

## EPIC-HH-TRIAGE-04 — New Since Last Search

Goal: show new vacancies relative to a saved search fingerprint.

Scope:

- Build normalized search fingerprint from query params.
- Store snapshot of visible vacancy IDs.
- Mark first-time-in-this-search cards as New.
- Add setting.

Acceptance:

```text
Search snapshot created.
New since last search chip appears.
No external calls.
```

## EPIC-HH-TRIAGE-05 — Company History / Duplicate Hints

Goal: add higher-level intelligence.

Scope:

- Company seen count.
- Company rejected count.
- Duplicate title+company hint.
- Settings.

Acceptance:

```text
Company history is local only.
Duplicate hints are deterministic.
No AI required.
```

---

## 19. Recommended MVP Codex analysis prompt

```text
You are working in `VacancyPilot/VacancyPilot`.

Goal:
Analyze and decompose the HH Visual Triage / Search Highlights concept into safe implementation PRs.

Context:
VacancyPilot is a local-first HH.ru job-search copilot. It already has WXT, MV3, React, TypeScript, Dexie/IndexedDB, content scripts for vacancy/search pages, jobs/profiles/settings/export/delete flows, release-safety tests and strict privacy boundaries.

Feature idea:
Highlight HH search result cards using local VacancyPilot state:
- viewed;
- saved;
- rejected;
- applied/interview/offer later;
- known score;
- view count;
- optional dim/hide rejected.

Strict boundaries:
- no "history" permission;
- no "tabs" permission;
- no host permissions for hh.ru;
- no hidden HH fetch/XHR;
- no cookies/session handling;
- no auto-click;
- no HH form writes;
- no telemetry;
- no AI calls on search page;
- no browser history import in MVP.

Tasks:
1. Inspect current code:
   - `entrypoints/search.content.ts`
   - `entrypoints/vacancy.content.ts`
   - `src/db/schema.ts`
   - `src/db/repositories.ts`
   - `src/services/search-actions.ts`
   - `src/services/badge-state.ts`
   - `src/services/export-data.ts`
   - `src/services/delete-all.ts`
   - settings models/bridges
   - release-safety tests
2. Propose minimal data model:
   - VisitMark
   - HighlightSettings
   - CardHighlightState
3. Determine schema migration impact.
4. Determine whether to add a new table or reuse jobs.
5. Recommend PR breakdown:
   - PR1 Local Visit Marks
   - PR2 Search Card Highlights MVP
   - PR3 Search Triage Controls
   - PR4 New Since Last Search
6. For PR1 and PR2, provide exact implementation prompts with:
   - files to change;
   - tests;
   - manual QA;
   - acceptance criteria;
   - safety checklist.
7. Identify risks:
   - HH DOM changes;
   - performance on large search pages;
   - duplicate render hosts;
   - settings sync;
   - export/delete completeness.
8. Do not implement yet unless explicitly instructed.

Return:
- architecture recommendation;
- MVP scope;
- PR breakdown;
- data model;
- tests;
- safety checks;
- unresolved questions.
```

---

## 20. Decision points for product owner

Before implementation, decide:

1. Should `viewed` be recorded automatically on every vacancy page open?
   - Recommended: yes.

2. Should viewed-only records appear in main Dashboard/Kanban?
   - Recommended: no. Keep visit marks separate from saved jobs.

3. Should rejected cards be hidden by default?
   - Recommended: no. Dim by default, hide optional.

4. Should search page show score if unknown?
   - Recommended: no. Show only known score.

5. Should the feature support resumes/candidates?
   - Recommended: later, not MVP.

6. Should browser history import be included?
   - Recommended: later optional, not MVP.

7. Should visual style be red like the reference extension?
   - Recommended: no. Use status-specific subtle colors.

---

## 21. Final recommendation

Implement as a restrained, high-value MVP:

```text
Local Visit Marks + Search Card Highlights
```

Do not expand into full analytics, history import, AI search scoring or resume support yet.

Best first implementation:

```text
PR1: Local Visit Marks
PR2: Search Card Highlights MVP
```

This will immediately improve real HH job-search workflow while preserving the core VacancyPilot promise:

```text
local-first
read-first
privacy-first
safe visual assistance
```

---

## 22. References for Codex / reviewer

- Chrome History API requires the `history` permission and can query visited URLs: https://developer.chrome.com/docs/extensions/reference/api/history
- Chrome Storage API has quotas and `storage.local` is intended for extension data/settings, while larger structured data in this project should remain in IndexedDB/Dexie: https://developer.chrome.com/docs/extensions/reference/api/storage
- CSS `:visited` is privacy-restricted and cannot be used as a reliable app-level visited-state mechanism: https://developer.mozilla.org/en-US/docs/Web/CSS/:visited
