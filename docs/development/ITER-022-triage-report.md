# ITER-022: Audit Confirmation And Triage — Final Report

**Date:** 2026-06-20
**Audit source:** `docs/vacancypilot_deep_repo_audit_2026-06-20.md`
**Repo commit:** `b5af869`

---

## 1. Executive Summary

Аудит подтверждён. Из 28 находок (7 P0, 16 P1, 7 P2):

- **7 P0**: все подтверждены в текущем коде. Ни одна не является false positive.
- **16 P1**: все подтверждены. Часть (P1-8, P1-12) имеют спорный приоритет, но технически точны.
- **7 P2**: корректно классифицированы как out-of-current-scope, не переклассифицируем.

Репозиторий находится в здоровом состоянии: архитектура read-first/local-first не нарушена, запрещённые HH-автоматизации отсутствуют. Выявленные проблемы — это hardened-уровень баги и gaps, а не архитектурные дефекты.

**Рекомендация:** закрыть P0 в 2 итерациях (storage + status/privacy), затем P1 в 3 итерациях (parser + profile-score + manifest-safety). После этого — ручной Chrome/Edge rerun, и только потом Phase 2.

---

## 2. Triage Table

### P0 — Critical

| # | Finding | Verdict | Evidence |
|---|---------|---------|----------|
| P0-1 | Save создаёт статус `viewed`, а не `saved` | **CONFIRMED** | `tracker.ts:89` — `status: "viewed"` при создании новой вакансии |
| P0-2 | `deleteAllData()` не удаляет `badge_v1_hh_*` | **CONFIRMED** | `delete-all.ts:16-18` — `PRODUCT_STORAGE_KEYS = ["app_settings_v1"]`; badge keys не чистятся ни в `deleteAllData()`, ни в `deleteJobData()` |
| P0-3 | Dexie query без compound index `[source+sourceVacancyId]` | **CONFIRMED** | `schema.ts:9` — нет compound index; `repositories.ts:42-43` — object query `where({source, sourceVacancyId})`. Dexie может работать и без него, но это хрупкая зона для upsert. |
| P0-4 | `sourceVacancyId = "unknown"` создаёт риск коллизий | **CONFIRMED** | `tracker.ts:59` — `dto.sourceVacancyId ?? "unknown"`; все неопознанные вакансии получают id `hh_unknown` |
| P0-5 | Cover Letter payload нарушает strict privacy | **CONFIRMED** | `ai-input-builders.ts:136-138` — `resumeHighlights` отправляются без проверки `strictPrivacyMode` и `allowResumeHighlightsToAI`, в отличие от `buildVacancyAnalysisInput()` |
| P0-6 | Выбор профиля не пересчитывает score | **CONFIRMED** | `ProfileTab.tsx:77-105` — `handleSelectProfile()` сохраняет `selectedProfileId`, но не вызывает scoring |
| P0-7 | Нет живого rerun после ITER-021 | **CONFIRMED** (процесс) | Manual QA на `a602b81` показал runtime blockers; ITER-021 пометил их `LIKELY FIXED`, но без browser rerun |

### P1 — Important

| # | Finding | Verdict | Evidence |
|---|---------|---------|----------|
| P1-1 | `HHAdapter.matchUrl()` слишком широкий | **CONFIRMED** | `hh-adapter.ts:23` — `hostname.includes("hh.ru")` пропустит `evil-hh.ru` |
| P1-2 | Parser не умеет passive status sync | **CONFIRMED** | `hh-adapter.ts:139-145` — `extractVisibleApplicationStatus()` возвращает `null` |
| P1-3 | Work mode определяется слишком слабо | **CONFIRMED** | `hh-adapter.ts:72` — только `this.tryExtract(doc, "workMode")`; description/city/schedule не анализируются |
| P1-4 | `descriptionHtml` фактически содержит plain text | **CONFIRMED** | `tryExtract()` возвращает `textContent`, но поле называется `descriptionHtml`; `stripHtml()` вызывается на уже текстовых данных |
| P1-5 | Мало parser fixtures (только 3) | **CONFIRMED** | 3 fixtures: `vacancy-normal`, `vacancy-no-salary`, `vacancy-archived` |
| P1-6 | Dashboard не автообновляется | **CONFIRMED** | `VacancySection` грузит `jobRepo.list()` on mount, без `chrome.storage.onChanged` или Dexie liveQuery |
| P1-7 | Settings section пустой | **CONFIRMED** | `SectionContent` для `"settings"` возвращает `<EmptyState>` |
| P1-8 | UI частично на английском | **CONFIRMED** (низкий приоритет) | Лейблы: Save, Reject, Dashboard, Side Panel, Score, Profiles, Resumes, Export Your Data — на английском |
| P1-9 | Удаление профиля/резюме оставляет orphan references | **CONFIRMED** | `ProfileManager.handleDelete()` не чистит `jobs.selectedProfileId`, `coverLetters.profileId`, `resumes.profileId`; `ResumeManager.handleDelete()` не чистит `jobs.selectedResumeId`, `coverLetters.resumeId` |
| P1-10 | Profile form допускает `NaN` salary | **CONFIRMED** | `ProfileManager.tsx:93-95` — `Number(form.salaryExpectationMin)` при вводе `"abc"` даёт `NaN` |
| P1-11 | Scoring не пересчитывается при изменении profile/resume | **CONFIRMED** | Нет механизма инвалидации score при изменении профиля/резюме |
| P1-12 | Scoring lacks aliases/synonyms | **CONFIRMED** (P2 приоритет) | Нет словаря синонимов; `JS ≠ JavaScript`, `amoCRM ≠ Kommo` и т.д. |
| P1-13 | Generated manifest не проверяется | **CONFIRMED** | `manifest-safety.test.ts` читает `wxt.config.ts`, а не `.output/.../manifest.json` |
| P1-14 | Content safety tests regex-based и неполные | **CONFIRMED** | `content-script-safety.test.ts` использует regex, не сканирует generated bundle, не строит AST |
| P1-15 | Badge state storage может расти бесконечно | **CONFIRMED** | Связано с P0-2; нет cleanup/TTL для `badge_v1_hh_*` |
| P1-16 | Side panel current tab detection может быть хрупким | **CONFIRMED** | `PageStatus.tsx:34-36` — `chrome.tabs.query({active: true, currentWindow: true})` |

### P2 — Future / Out of Scope

| # | Finding | Verdict |
|---|---------|---------|
| P2-1 | AI production provider отсутствует | **DEFERRED** — Phase 1 core не требует production AI |
| P2-2 | Cover Letter Studio — editor, не generator | **DEFERRED** — генерация через AI будет в AI-итерациях |
| P2-3 | n8n остаётся deferred | **DEFERRED** — соответствует текущему плану (ITER-014) |
| P2-4 | Search badges Phase 2 не начинать | **DEFERRED** — правильное предостережение, вне scope |
| P2-5 | Импорт JSON отсутствует | **DEFERRED** — экспорт есть, импорт — later |
| P2-6 | Нет performance testing | **DEFERRED** — release hardening, later |
| P2-7 | Нет accessibility pass | **DEFERRED** — release hardening, later |

---

## 3. Recommended Fix Order

Приоритет основан на: безопасность данных → UX-корректность → надёжность парсера → release safety.

### Batch A: Storage & Data Integrity (P0-2, P0-3, P0-4)
Наиболее критично: потеря данных, коллизии, ghost state после удаления.
- Compound index `[source+sourceVacancyId]`
- Badge key cleanup в `deleteAllData()` + `deleteJobData()`
- Отказ от `sourceVacancyId = "unknown"`

### Batch B: Status & Privacy (P0-1, P0-5)
UX-несоответствие Save/viewed и privacy gap в Cover Letter.
- Save → `saved`
- Cover Letter privacy gate

### Batch C: Profile → Score Recompute (P0-6, P1-9, P1-10, P1-11)
Score должен появляться и обновляться при изменении профиля/резюме.
- Recompute score on profile select
- Score invalidation on profile/resume change
- Orphan cleanup при удалении профиля/резюме
- NaN guard в profile form

### Batch D: Parser Hardening (P1-1, P1-3, P1-4, P1-2, P1-5)
Улучшение точности и надёжности HH-парсера.
- Fix `matchUrl()` host check
- Rename `descriptionHtml` → clarify text vs HTML
- Improve work mode detection
- Add passive status skeleton
- Add 10–20 new fixtures

### Batch E: Dashboard & Release Safety (P1-6, P1-7, P1-13, P1-14, P1-15, P1-16)
UI improvements и release hardening.
- Dashboard auto-refresh / refresh button
- Settings section (minimal)
- Generated manifest audit
- Bundle content script scanner
- Badge storage cleanup (covered in Batch A)
- Side panel context robustness

---

## 4. Proposed Iteration Breakdown

### ITER-023 — Storage & Data Integrity Hardening (ex P0-2, P0-3, P0-4)

**Scope:** Dexie schema v2, badge cleanup, reject unknown vacancy IDs.

- Add `[source+sourceVacancyId]` compound index (schema v2 migration)
- Update `findBySourceVacancy()` to use compound index
- Add `removeBadgeKeys()` helper
- Call badge cleanup in `deleteAllData()` and `deleteJobData()`
- Reject `sourceVacancyId` missing (throw error instead of `"unknown"`)
- Tests: compound index query, badge cleanup, missing ID rejection

**Commit:** `fix: harden vacancy storage, compound index, and badge cleanup`

---

### ITER-024 — Save/Status + Cover Letter Privacy (ex P0-1, P0-5)

**Scope:** Fix Save semantics and close Cover Letter privacy gap.

- Popup Save creates status `saved` (not `viewed`)
- Preserve existing stronger statuses (applied/interview/offer) — no downgrade
- Add privacy gate to `buildCoverLetterInput()`:
  - Respect `strictPrivacyMode`
  - Respect `allowResumeHighlightsToAI`
  - `forceResumeHighlights` override option
- Tests: status transitions, privacy gates for cover letter

**Commit:** `fix: save creates saved status; apply strict privacy to cover letter`

---

### ITER-025 — Profile Score Recompute + Orphan Cleanup (ex P0-6, P1-9, P1-10, P1-11)

**Scope:** Score recompute on profile selection, orphan reference cleanup, NaN guard.

- Create `recomputeJobScore(jobId, profileId)` service
- Call recompute on profile select in `ProfileTab` + popup
- Update badge storage after recompute
- Clean orphan refs on profile delete (jobs, coverLetters, resumes, settings)
- Clean orphan refs on resume delete (jobs, coverLetters, applications)
- Add NaN guard in profile form salary field (input type=number, validate)
- Tests: recompute, orphan cleanup, NaN rejection

**Commit:** `feat: recompute score on profile selection; clean orphan refs on delete`

---

### ITER-026 — Parser Hardening (ex P1-1, P1-3, P1-4, P1-2, P1-5)

**Scope:** Improve HH adapter reliability and fixture coverage.

- Fix `matchUrl()` — use exact/suffix hostname check
- Split `descriptionHtml` / `descriptionText` clearly
- Improve `normalizeWorkMode()` — scan description text for mode hints
- Add passive status extraction skeleton (no API/fetch)
- Add 15+ new fixtures covering priority cases from audit
- Tests: host matching, work mode, fixtures

**Commit:** `fix: harden hh adapter host matching, work mode, and fixture coverage`

---

### ITER-027 — Dashboard, Settings & Release Safety (ex P1-6, P1-7, P1-13, P1-14)

**Scope:** Dashboard auto-refresh, minimal settings, generated manifest audit.

- Add refresh button to VacancySection
- Add `chrome.storage.onChanged` listener for dashboard auto-refresh
- Minimal Settings section (defaultProfileId, showPageBadge, strictPrivacy, AI/n8n toggles)
- Add generated manifest audit script (`scripts/audit-generated-manifest.mjs`)
- Add bundle content scanner for forbidden patterns
- Tests: manifest audit, content script bundle scan

**Commit:** `feat: dashboard auto-refresh, minimal settings, generated manifest audit`

---

## 5. P1 Items Deferred Beyond ITER-027

| Item | Reason |
|------|--------|
| P1-8 (UI language) | Product decision — requires explicit direction on RU vs EN |
| P1-12 (Scoring synonyms) | P2 priority; needs synonym dictionary design |
| P1-15 (Badge TTL) | Covered by P0-2 cleanup; full TTL — later |
| P1-16 (Side panel context) | Acceptable risk for now; fix in Phase 2 |

---

## 6. P0-7 (Live Rerun) Resolution

P0-7 не требует кода. После ITER-023..027 необходим ручной Chrome/Edge rerun по плану из секции 8 аудита (минимальный Chrome rerun + domain rerun + Edge short rerun). Без этого Phase 1 RC не может быть объявлен.

---

## 7. Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
