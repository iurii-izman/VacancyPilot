# R5 Manual Browser QA

Date: 2026-09-01  
Verdict: `PASS`

## Scope and environment

The production Chrome MV3 build was loaded as an unpacked extension in an
isolated Playwright Chromium persistent profile. The local Companion used a
separate migrated SQLite database under `output/playwright/`. All vacancies,
applications, events, V4 cache records and Search Profile provenance were
synthetic.

No HH.ru page was opened. No HH form was read or changed. No OpenAI, HH or
other external origin was contacted. The browser request log contained only
extension resources and `http://127.0.0.1:8765/api/v1/*` Companion requests.

## Scenarios

| Scenario | Result | Evidence |
|---|---|---|
| Production extension load | PASS | VacancyPilot enabled; MV3 service worker active |
| Clean Inbox | PASS | Empty state, 0 selected, disabled batch controls, no analysis |
| Companion unavailable/not-paired/connected states | PASS | Status transitions rendered correctly; explicit pairing required |
| Synthetic Inbox load | PASS | Seven local vacancies rendered with filters and selection controls |
| Explicit batch selection | PASS | Two QA vacancies selected; selection count updated to 2 |
| Application Factory preview | PASS | 2 selected, 2 cached V4, 0 possible provider calls, 0 ineligible |
| Preview safety | PASS | UI stated that preview made no provider call; network log stayed local |
| Explicit confirmation | PASS | Processing started only after `Confirm and process selected` |
| Queue completion | PASS | Both items became `READY_FOR_MANUAL_APPLY`; session became completed |
| No implicit application | PASS | Database remained at five historical applications; zero applications for the two Factory vacancies |
| Cache-only execution | PASS | Engine-run count remained seven; no run or external provider request was added |
| Performance sufficient sample | PASS | 5 applied, 3 responses, 60%, 2 interviews, 2 pending, 1 session |
| Performance small sample | PASS | 3 applied and directional small-sample warning rendered |
| Performance no data | PASS | 0 applied, no-data copy and undefined response rate rendered |
| Descriptive disclaimer | PASS | Current-sample/non-causation wording remained visible |
| AI accounting | PASS | Persisted tokens and cost rendered; cache reuse remained explicitly unknown |
| Layout at 1440 and 1024 px | PASS | Cards reflowed, Inbox filters wrapped, no overlap or horizontal overflow |

## Database readback

After restoring the five historical applications, the disposable QA database
reported:

```text
applications_total: 5
factory_applications: 0
explicit_applied: 5
engine_runs_total: 7
sessions_total: 1
session_statuses: completed
queue_states: READY_FOR_MANUAL_APPLY, READY_FOR_MANUAL_APPLY
```

## Browser evidence

The local, gitignored evidence is retained under `output/playwright/`:

- `page-2026-09-01T09-57-11-970Z.png` — explicit preview;
- `page-2026-09-01T09-57-42-975Z.png` — completed human-review queue;
- `page-2026-09-01T09-58-19-156Z.png` — sufficient descriptive sample;
- `page-2026-09-01T10-00-45-297Z.png` — small-sample state;
- `page-2026-09-01T10-01-13-581Z.png` — no-data state;
- Playwright YAML snapshots, browser request log and console log.

Two console errors were the expected refused health checks performed before
the Companion was started. Remaining console messages were WXT preload
warnings for extension chunks. No error was emitted by the confirmed Factory
or Performance flows after the Companion was connected.

## Acceptance

The previously pending narrow Inbox/Performance browser QA is complete. R5
retains explicit human confirmation, never marks queue preparation as Applied,
and keeps conversion intelligence descriptive and provenance-backed.

