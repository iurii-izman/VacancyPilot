# AOPS-12 Current State

## Route and surface inventory

The dashboard currently has a single Options React root and state-selected
sections. There is no competing Ops frontend.

| Current route/section | Responsibility | Decision | Authority |
|---|---|---|---|
| `vacancies` | local Kanban and status actions | keep as compatible Pipeline surface | Dexie |
| `summary` | local daily summary/reminders | merge into Command Center | Dexie; Ops read model when paired |
| `applications` | empty placeholder | replace with Application workspace | hybrid; companion canonical in Ops |
| `companies` | empty placeholder | keep as legacy deep-link-compatible section | Dexie |
| `profiles` | candidate profiles | keep | Dexie |
| `resumes` | resumes | keep | Dexie |
| `letters` | empty placeholder | keep as legacy entry; link into existing letter workflow | Dexie/companion |
| `events` | local event log placeholder | keep for compatibility; Application Card Timeline is separate | Dexie |
| `labs` | guided/manual actions | keep, no auto-apply | Dexie |
| `export` | export | keep | Dexie |
| `settings` | AI/search settings | keep | chrome.storage.local |
| `privacy`, `permissions` | disclosures and permissions | keep | local/browser |
| `companion` | pairing and Ops status | keep | companion + local settings |
| `debug` | debug placeholder | consolidate safe diagnostics into Application Card/Engine Health | hybrid |
| `onboarding`, `about` | onboarding/about | keep | local |

## Existing implementation notes

- `KanbanBoard` reads and writes Dexie directly and uses local status history.
- `OpsClient` has typed health, pairing, HH profile and vacancy sync methods;
  it has no application or overview methods.
- Companion vacancy list/detail/triage, analysis, engine, letter, HH and health
  APIs exist. Applications/followups are currently model/repository-only.
- `CoverLetterStudio` is the existing letter editor/lifecycle surface and is
  not duplicated by AOPS-12.
- Existing responsive breakpoints are 1000px/760px in the dashboard and
  700px in Kanban. Existing tests use Vitest + happy-dom.

## AOPS-12 consolidation

The navigation will expose one Command Center and one Inbox while preserving
the old section IDs for deep-link compatibility. The current Kanban remains
the compatible Applications/Pipeline surface until AOPS-13 adds canonical
transitions. AOPS-12 does not implement follow-up, interview, analytics or
automatic analysis behavior.
