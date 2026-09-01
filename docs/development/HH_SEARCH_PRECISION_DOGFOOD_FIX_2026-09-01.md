# HH Search Precision Dogfood Fix — 2026-09-01

## 1. Verdict

`HH_SEARCH_PRECISION_FIXED_AND_RESYNCED`

The broad first-live import was safely purged, profiles were narrowed, all enabled previews were within the dogfood bound, and the clean sync completed with zero errors. V4 dogfood was executed for one vacancy and exposed letter-QA warnings; no external application was sent.

## 2. Baseline

- Starting branch: `main`
- Starting SHA: `8c433e5ee76e827298b5bf54e4942fbf9b77ea03`
- `main == origin/main`: yes
- Baseline status: clean and synchronized
- Incident: 4 broad profiles, 7,803 seen, 4,493 created, 6,493 unique HH vacancies.

## 3. Backup and purge

- Active DB: `companion/data/vacancypilot.db`
- Verified backup: `C:\Dev-archive\VacancyPilot\dogfood-reset\2026-09-01\vacancypilot-purge.sqlite`
- SHA256: `6c6c326a8d4dddacf409052fc5e25b4e09103bac4d992131b958560146702b7b`
- Backup `PRAGMA integrity_check`: `ok`
- Candidates: 6,493 vacancies
- Protected: 0
- Deletable: 6,493
- Deleted: 6,493 vacancies, 6,493 snapshots, 7,803 profile-hit rows
- Preserved: 4 Search Profiles, 8 historical `hh_sync_runs`, 0 applications, 0 engine runs, 0 session rows
- Post-purge `PRAGMA foreign_key_check`: no rows
- Post-purge `PRAGMA integrity_check`: `ok`

The purge used the controlled maintenance script `scripts/maintenance/purge_hh_first_live.py`, an explicit SQLite transaction, and foreign keys remained enabled. No normal product delete-all control was added.

## 4. Profile configuration

| profile | text | search_field | schedule | period | enabled |
|---|---|---|---|---:|---:|
| System Analyst | системный аналитик | name | remote | 14 | yes |
| Integration Analyst | аналитик интеграций | name | remote | 14 | yes |
| CRM / Bitrix24 | Bitrix24 | name | remote | 30 | yes |
| Business Process Analyst | аналитик бизнес-процессов | name | remote | 14 | yes |
| AI Automation | AI автоматизация | name | remote | 14 | no |

## 5. Preview and clean sync

| profile | found | classification | synced |
|---|---:|---|---|
| System Analyst | 210 | ACCEPTABLE | yes |
| Integration Analyst | 3 | GOOD | yes |
| CRM / Bitrix24 | 65 | GOOD | yes |
| Business Process Analyst | 2 | GOOD | yes |
| AI Automation | disabled | — | no |

Clean sync: 4 profiles, 280 seen, 278 unique created, 0 updated, 2 unchanged, 278 snapshots, 0 errors, 0 too-broad profiles, 6 pages. The sync previews each profile with `per_page=1`, rejects `found > 500` as `HH_QUERY_TOO_BROAD`, and never persists a rejected profile.

## 6. Relevance sample

Sample: 30 unique resulting vacancies. Classification by title review: 29 clearly relevant, 0 adjacent, 1 clearly irrelevant. The irrelevant example was `Менеджер по продажам Битрикс24`; this shows the result is improved but not perfect and still needs daily triage.

## 7. Product changes

- Compact Search Profile editor: name, search text, title/description/company search field, 1/3/7/14/30-day period, remote/any schedule, enabled.
- Read-only official HH preview endpoint: `POST /api/v1/hh/search-profiles/{id}/preview`.
- Storage `schema_version` remains internal and is excluded before `HHApiClient`.
- `HH_QUERY_TOO_BROAD` guard at 500; no silent first-chunk ingestion.
- Per-profile sync result table: found, seen, created, updated, unchanged, error.
- Inbox profile filter is backed by `vacancy_search_profile_hits`; shared vacancies remain one canonical vacancy.
- OpenAPI snapshot and TypeScript companion contracts updated.

## 8. V4 dogfood

- Profile filter: System Analyst
- Selected: 2
- Application Factory Preview: selected `2`; possible provider calls `2`; actual provider calls `0`; applications/sessions/items before and after: `0/0/0`
- V4 processed: 1 vacancy
- Result: `skip`, score `0`, confidence `low`
- Letter QA: failed validation due missing `interest`/`value`, section order/count, trailing signature content, and missing micro-proof.
- External application: no
- HH writes/messages/auto-apply: no

## 9. Quality and safety

- Typecheck: pass
- Frontend lint: pass
- Frontend tests: pass
- Build: pass
- Release safety tests: pass
- Companion format/lint/mypy/tests: pass
- OpenAPI drift: pass
- Migration checks: existing migration suite passed as part of companion tests
- Workflow verification: pass
- `git diff --check`: pass before documentation edits
- HH writes: no
- Private HH endpoints: no
- Secrets exposed: no
- Private V4 package changed: no

## 10. Git and next step

This report and implementation are on the hotfix branch. Commit/merge/push state is recorded in the final task response after the last quality gate. Next: use the cleaned narrow Inbox for daily triage, process only a small relevant shortlist through V4, manually apply externally, then confirm `APPLIED`.
