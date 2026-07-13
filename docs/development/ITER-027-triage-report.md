# ITER-027: Second Audit Triage Report

**Date:** 2026-06-20
**Audit commit:** `b9d114c92788c399a1bc51ffbd852328456c625f`
**Triage performed on:** current `main` (matching `b9d114c` with pre-existing doc changes)
**Author:** Zed + DeepSeek V4 Pro

---

## 1. Executive Summary

Второй внешний аудит проверил репозиторий после ITER-022..026. Из 21 substantive finding:

- **10 confirmed** — требуют code fix в текущем scope Phase 1;
- **1 partially confirmed** — логика корректна, но нужен manual QA;
- **3 verification-only** — не code fix, а ручная проверка/инфраструктурный чек;
- **7 deferred** — за пределами текущего scope Phase 1 hardening.

Главный блокер: **P0-1** — `chrome.storage.local.onChanged` вместо `chrome.storage.onChanged` в dashboard. Это реальная ошибка API, которая может сломать автообновление dashboard в runtime.

Все валидации текущего кода (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`) — pass.

---

## 2. Triaged Findings Table

### P0 — Critical / Release Blockers

| ID | Finding | Verdict | Evidence | Fix Iteration |
|----|---------|---------|----------|---------------|
| P0-1 | Dashboard auto-refresh uses `chrome.storage.local.onChanged` (should be `chrome.storage.onChanged` with `areaName` filter) | **Confirmed** | `entrypoints/options/App.tsx:268`: `chrome.storage.local.onChanged.addListener(...)`. Handler at L256 takes only `changes`, no `areaName` param. Side panel correctly uses `chrome.storage.onChanged` at L170. | ITER-028 |
| P0-2 | No confirmed live Chrome/Edge rerun after `b9d114c` | **Verification-only** | Не code fix. Требуется ручной прогон расширения в Chrome + Edge по checklist из раздела 5. | Manual gate |
| P0-3 | `pre-commit.ci - push = error` on `b9d114c` | **Verification-only** | Не code fix. Нужно открыть GitHub UI → commit `b9d114c` → checks → посмотреть лог ошибки. Локально все проверки зелёные. | Manual gate |

### P1 — Important Issues and Risks

| ID | Finding | Verdict | Evidence | Fix Iteration |
|----|---------|---------|----------|---------------|
| P1-1 | Passive HH status parser exists (`extractVisibleApplicationStatus`) but not called in `EXTRACT_VACANCY` content script handler | **Confirmed** | `HHAdapter.extractVisibleApplicationStatus()` — L142 в `hh-adapter.ts`. `EXTRACT_VACANCY` handler в `vacancy.content.ts:138-157` возвращает только `{ success, dto }`, без `passiveStatus`. | ITER-030 |
| P1-2 | ProfileTab recompute score may not update current `ctx.job` in side panel without refresh | **Partially confirmed** | Code flow: `ProfileTabWrapper` (L966-983) passes `onRefresh` as `onProfileChange`. `handleRefresh` increments `refreshKey`, triggering job re-read from DB. Flow looks correct — needs manual QA. | ITER-031 (verify) |
| P1-3 | Badge state helpers duplicated across popup, score-recompute, delete-all | **Confirmed** | `badgeStorageKey()` + `persistBadgeState()` in: `entrypoints/popup/App.tsx` (L22-35) AND `src/services/score-recompute.ts` (L11-24). `BADGE_KEY_PREFIX` + `removeBadgeKey()` in `src/services/delete-all.ts` (L17-39). No shared module. | ITER-029 |
| P1-4 | Generated manifest audit soft-skips without build output | **Confirmed** | `generated-manifest-safety.test.ts:43-51`: when `.output/chrome-mv3/manifest.json` absent, test does `expect(true).toBe(true)` — always passes. No `RELEASE_AUDIT` env guard. | ITER-028 |
| P1-5 | Generated bundle safety also soft-skips | **Confirmed** | `content-script-safety.test.ts:204-211`: when bundle dir absent, `expect(bundleScripts.length).toBeGreaterThanOrEqual(0)` always passes. No hard-fail mode. | ITER-028 |
| P1-6 | `package.json` missing `verify` and `test:release` scripts | **Confirmed** | `package.json:6-16` — only `typecheck`, `lint`, `test`, `build` exist. No `verify` or `test:release`. | ITER-028 |
| P1-7 | Profile delete sets `coverLetter.profileId = ""` (empty string, not null/undefined) | **Confirmed** | `ProfileManager.tsx:294`: `letter.profileId = ""`. Model `CoverLetter.profileId: string` — пустая строка не валидный nullable state. | ITER-031 |
| P1-8 | Profile delete removes linked resumes (potentially destructive) | **Confirmed** | `ProfileManager.tsx:275-278`: linked resumes deleted. Confirm message warns but doesn't show counts. | Deferred (UX enhancement) |
| P1-9 | Dashboard auto-refresh only listens to `badge_v1_hh_*` / `app_settings_v1` keys | **Confirmed** | `entrypoints/options/App.tsx:260-262`: `relevantChange` only checks badge and settings prefixes. Dexie mutations (profile delete clearing `selectedProfileId`, resume delete, etc.) don't trigger refresh. | Deferred (architectural) |
| P1-10 | Passive status regex `/отклик/` may match CTA `Откликнуться` (false positive) | **Confirmed** | `hh-adapter.ts:173`: regex `/отклик|отправлен|откликнулись|applied|sent/i` includes bare `отклик`. CTA button text `Откликнуться` would match. No false-positive fixtures. | ITER-029 |
| P1-11 | `experienceMinYears` always set to `undefined` in tracker | **Confirmed** | `tracker.ts:82`: `experienceMinYears: undefined`. No `parseExperienceMinYears()` function exists. `dto.experienceRaw` is stored but not parsed to numeric. | ITER-029 |
| P1-12 | `companyIdFromName()` uses name slug — collision risk | **Confirmed** | `tracker.ts:34-41`: ID built from name slug only. `sourceCompanyId` not parsed from employer link `/employer/<id>`. | ITER-031 |
| P1-13 | Side panel context depends on active tab guessing | **Confirmed** | `sidepanel/App.tsx:125-128`: `chrome.tabs.query({ active: true, lastFocusedWindow: true })`. After opening side panel, active tab may change. No explicit context passed from background. | ITER-030 |

### P2 — Quality Improvements

| ID | Finding | Verdict | Rationale |
|----|---------|---------|-----------|
| P2-1 | Mixed English/Russian UI | **Deferred** | Не блокирует Phase 1 private RC. Решить при подготовке к публичному релизу. |
| P2-2 | Settings section in dashboard still placeholder | **Deferred** | Toggles можно добавить позже. Core функциональность работает через storage напрямую. |
| P2-3 | No import JSON | **Deferred** | Экспорт есть, импорт — для backup/restore, не блокирует Phase 1. |
| P2-4 | Search parser intentionally empty | **Deferred / Out of scope** | Для Phase 2. Правильно возвращает `[]` в Phase 1. |
| P2-5 | No production AI provider | **Deferred** | AI остаётся opt-in/deferred по спецификации. Privacy contracts есть. |

---

## 3. Recommended Fix Order

Приоритет по критичности и зависимостям:

1. **P0-1** — Критический runtime-баг. Без него dashboard может не работать в браузере.
2. **P1-4 / P1-5 / P1-6** — Release safety. Без hard-fail в release mode тесты могут пропускать реальные проблемы в CI.
3. **P1-3 / P1-11 / P1-10** — Dedup + data quality. Убирает дублирование, добавляет парсинг опыта, чинит regex.
4. **P1-1 / P1-13** — Runtime integration. Подключает passive status parser, чинит side panel context.
5. **P1-7 / P1-12 / P1-2** — Lifecycle + data model. Чинит profileId nullable, company ID, верифицирует recompute refresh.

---

## 4. Proposed Next Iteration List

### ITER-028: Fix Dashboard Storage API + Release Scripts (P0-1, P1-4, P1-5, P1-6)

**Scope:**
- Replace `chrome.storage.local.onChanged` → `chrome.storage.onChanged` with `areaName === "local"` filter in `entrypoints/options/App.tsx`
- Add static test banning `chrome.storage.local.onChanged` usage
- Add `verify` and `test:release` scripts to `package.json`
- Add `RELEASE_AUDIT=true` env guard to generated-manifest and content-script safety tests — hard-fail when `.output` absent in release mode
- Ensure all existing tests pass after changes

**Commit:** `fix: correct dashboard storage listener and add release audit scripts`

---

### ITER-029: Dedup Badge Helpers + Experience Parser + Passive Status Regex (P1-3, P1-11, P1-10)

**Scope:**
- Create `src/services/badge-state.ts` with `badgeStorageKey()`, `persistBadgeState()`, `removeBadgeState()`, `removeAllBadgeStates()`
- Refactor popup, score-recompute, delete-all to use shared module
- Add `parseExperienceMinYears()` to parse `experienceRaw` → `experienceMinYears` in tracker
- Cover RU/EN experience patterns: `1–3 года`, `3–6 лет`, `более 6 лет`, `не требуется`, `5+ years`, `no experience`
- Narrow passive status `applied` regex: remove bare `отклик`, use `/вы откликнулись|отклик отправлен|response sent|you applied/i`
- Add fixture test: CTA `Откликнуться` → NOT `detectedApplied`
- Add fixture test: `Вы откликнулись` → `detectedApplied`

**Commit:** `fix: dedup badge helpers, add experience parser, tighten passive status regex`

---

### ITER-030: Integrate Passive Status + Fix Side Panel Context (P1-1, P1-13)

**Scope:**
- Integrate `extractVisibleApplicationStatus()` into `EXTRACT_VACANCY` content script handler — return `passiveStatus` alongside `dto`
- In popup/side panel: display passive status hints without auto-changing job status
  - `detectedApplied` → "HH shows: Вы откликнулись"
  - `detectedRejected` → "HH shows: Отказ"
  - `detectedInvitation` → "HH shows: Приглашение"
  - `detectedViewedByEmployer` → "HH shows: Работодатель просмотрел резюме"
- Implement explicit side panel context via background message
  - Popup `OPEN_SIDE_PANEL` message includes `tabId` and `vacancyId`
  - Background stores `activeVacancyContext`
  - Side panel reads context from background instead of guessing active tab
- Add tests for passive status hints and explicit context

**Commit:** `feat: integrate passive HH status parser and fix side panel context`

---

### ITER-031: Profile Lifecycle + Company ID + Recompute UX Verify (P1-7, P1-12, P1-2)

**Scope:**
- Change `CoverLetter.profileId` model from `string` to `string | undefined` — make it nullable
- In `ProfileManager`: on profile delete, set `letter.profileId = undefined` and optionally store `profileSnapshotName`
- Add `sourceCompanyId` parsing from employer link `/employer/<id>` in `HHAdapter.extractVacancy()`
- Store `sourceCompanyId` in `RawVacancyDTO` and populate in `dtoToNewJob()`
- Verify ProfileTab recompute → side panel refresh flow (code inspection + add explicit test)
- Ensure no regression in existing tests

**Commit:** `fix: make coverLetter profileId nullable, parse employer ID, verify recompute UX`

---

## 5. Manual Verification Gate List

Следующие пункты НЕ могут быть закрыты кодом и требуют ручного прогона:

### Chrome Rerun (после ITER-028..031)

1. Load unpacked `.output/chrome-mv3`
2. Open `https://hh.ru/vacancy/*` — badge appears
3. Popup → "Vacancy detected"
4. Save → status `saved`, badge updates
5. Create profile in Dashboard → Profiles
6. Open Side Panel → Profile tab → select profile
7. **Verify: Score appears in Score tab without closing side panel**
8. Badge updates with score
9. Dashboard table refreshes automatically after Save
10. Reject → status `rejected_by_me`, dashboard refreshes
11. Delete job → badge state cleared after page reload
12. Delete All Data → no stale badge keys in chrome.storage.local
13. Strict Privacy mode: cover letter payload does not include `resumeHighlights`

### Domain Coverage

- `https://hh.ru/vacancy/*`
- `https://spb.hh.ru/vacancy/*`

### Edge Short Rerun

- Install, badge, popup, Save, Side Panel, Reject, Dashboard

### Safety Smoke

- DevTools Network: no fetch/XHR to HH from extension
- No form auto-fill, no auto-click, no cookies permission
- No telemetry

### GitHub Infrastructure

- Open GitHub UI → commit `b9d114c` → check `pre-commit.ci` log
- If infrastructure error → document; if lint/format error → fix

---

## 6. Validation Status (Baseline)

| Command | Result |
|---------|--------|
| `pnpm typecheck` | ✅ Pass |
| `pnpm lint` | ✅ Pass |
| `pnpm test` | ✅ Pass (26 files, 762 tests) |
| `pnpm build` | ✅ Pass (`.output/chrome-mv3/` generated) |

---

## 7. Residual Risks

- **P1-9** (Dashboard refresh scope) отложен: Dexie `liveQuery` или централизованный `jobs_changed_v1` key — архитектурное изменение, выходящее за рамки hardening pass. Manual refresh остаётся основным механизмом.
- **P1-8** (Profile delete UX counts) отложен: текущий confirm message адекватен для private RC.
- **P1-12** (Company ID collisions) частично решается парсингом `sourceEmployerId`, но полное решение (гарантированная уникальность) требует хранения employer ID из HH API — вне scope Phase 1.
- **P1-2** (Recompute UX) код выглядит корректным, но без живого Chrome-прогона нельзя гарантировать отсутствие race condition между `recomputeScoreForJob()` и `handleRefresh()`.
