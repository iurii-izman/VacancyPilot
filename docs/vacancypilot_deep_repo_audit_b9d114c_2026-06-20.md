# VacancyPilot — повторный глубокий аудит после последних патчей

**Дата аудита:** 2026-06-20
**Репозиторий:** `iurii-izman/VacancyPilot`
**Проверяемый коммит:** `b9d114c92788c399a1bc51ffbd852328456c625f`
**Предыдущая база:** `c547273010e9fe3112f6c298e35e12be0aef53b7`
**Цель:** повторно проверить исправления последних патчей, найти остаточные баги, несоответствия ТЗ, runtime-риски и подготовить добивочный план для Codex.
**Метод:** GitHub connector audit + compare commits + статический code review + проверка контрактов, сервисов, тестов и документации.

> Ограничение: живой запуск расширения в Chrome/Edge из этой среды невозможен. Runtime-выводы, которые нельзя доказать кодом, помечены как требующие manual rerun.

---

## 1. Executive Summary

После последних патчей проект стал заметно сильнее. Большая часть проблем из предыдущего аудита действительно закрыта:

- добавлен Dexie schema v2 с compound index `[source+sourceVacancyId]`;
- `findBySourceVacancy()` переведён на compound index;
- `tracker.saveFromDTO()` больше не создаёт `hh_unknown`;
- `Save` теперь создаёт статус `saved`, а не `viewed`;
- `deleteAllData()` и `deleteJobData()` чистят `badge_v1_hh_*`;
- `buildCoverLetterInput()` теперь уважает Strict Privacy / `allowResumeHighlightsToAI`;
- добавлен `recomputeScoreForJob()`;
- `ProfileTab` пересчитывает score после выбора профиля;
- `HHAdapter.matchUrl()` исправлен на точную проверку `hh.ru` / `*.hh.ru`;
- parser стал сильнее: `descriptionHtml` теперь берётся из `innerHTML`, work mode анализирует description, добавлен passive status parser;
- добавлено много fixture-файлов;
- добавлен generated manifest audit;
- content safety tests расширены на generated bundle;
- dashboard получил кнопку refresh и попытку auto-refresh.

Но Phase 1 всё ещё не стоит объявлять полностью закрытой без добивочного прохода. Главная новая найденная проблема: в dashboard используется `chrome.storage.local.onChanged`, тогда как корректный API для storage changes — `chrome.storage.onChanged`. Это может ломать auto-refresh dashboard в runtime.

### Новая оценка

| Направление | Было | Сейчас |
|---|---:|---:|
| Product strategy | 92 | 93 |
| Safety boundaries | 88 | 90 |
| Architecture | 80 | 83 |
| Runtime wiring | 68 | 78 |
| Storage/data integrity | 70 | 84 |
| Parser HH | 60 | 74 |
| Scoring/Profile flow | 76 | 82 |
| AI/privacy layer | 72 | 83 |
| UI/UX | 62 | 70 |
| Tests/release safety | 72 | 80 |
| Release readiness | 48 | 68 |

**Итоговая оценка:** `80/100` как codebase foundation.
**Release readiness:** `68/100` до живого rerun и фикса dashboard storage listener.
**После добивочного Codex-прогона + Chrome/Edge rerun:** потенциально `86–90/100`.

---

## 2. Что изменилось с `c547273`

Сравнение `c547273 → b9d114c` показывает:

- `ahead_by: 9`, `behind_by: 0`;
- добавлены/изменены ITER-022..026 docs/prompts;
- добавлены новые parser fixtures;
- изменены schema/database/repositories;
- изменены tracker/delete-all/ai-input-builders;
- добавлен score-recompute service/tests;
- изменены ProfileManager/ResumeManager/ProfileTab;
- добавлен generated manifest safety test;
- расширен content safety test;
- добавлен dashboard refresh.

Коммит `b9d114c` имеет message:

```text
fix: harden parser and release safety
```

GitHub combined status для `b9d114c` показывает:

```text
pre-commit.ci - push: error
```

Лог ошибки через доступные инструменты не получен. Это нужно отдельно проверить в GitHub UI.

---

## 3. Статус проблем из предыдущего аудита

| Предыдущая проблема | Статус на `b9d114c` | Комментарий |
|---|---|---|
| `Save` создаёт `viewed`, а не `saved` | Исправлено | `tracker.dtoToNewJob()` теперь ставит `status: "saved"` |
| `deleteAllData()` не чистит `badge_v1_hh_*` | Исправлено | Добавлены `BADGE_KEY_PREFIX`, `removeAllBadgeKeys()`, `removeBadgeKey()` |
| Нет compound index `[source+sourceVacancyId]` | Исправлено | Добавлены `SCHEMA_V2` и compound index |
| `findBySourceVacancy()` object query без compound index | Исправлено | Теперь используется `.where("[source+sourceVacancyId]").equals(...)` |
| `hh_unknown` fallback | Исправлено | `saveFromDTO()` бросает error при missing/empty/whitespace ID |
| Cover Letter privacy gap | Исправлено | `buildCoverLetterInput()` теперь gate’ит `resumeHighlights` |
| Profile selection не пересчитывает score | Частично исправлено | `ProfileTab` вызывает `recomputeScoreForJob()`, но нужен runtime rerun UI-refresh |
| `HHAdapter.matchUrl()` через `includes()` | Исправлено | Теперь exact/suffix host check |
| `descriptionHtml` был textContent | Исправлено | Теперь description element отдаёт `innerHTML` и `textContent` отдельно |
| Слабый work mode parser | Улучшено | Анализирует badge + description text |
| Нет passive status parser | Частично исправлено | Parser есть, но интеграция в tracker/UI не найдена |
| Мало fixtures | Улучшено | Добавлено много новых fixtures |
| Нет generated manifest audit | Частично исправлено | Test есть, но soft-skips, если build output отсутствует |
| Dashboard не автообновляется | Частично исправлено | Добавлен listener, но с вероятной ошибкой API: `chrome.storage.local.onChanged` |
| GitHub/CI confidence | Не закрыто | combined status: `pre-commit.ci - push = error` |

---

## 4. P0 — критичные проблемы / release blockers

### P0-1. Dashboard auto-refresh использует вероятно неверный Chrome Storage API

**Файл:** `entrypoints/options/App.tsx`
**Место:** `VacancySection`, auto-refresh effect.

Текущий код:

```ts
chrome.storage.local.onChanged.addListener(handleStorageChange);
return () => {
  chrome.storage.local.onChanged.removeListener(handleStorageChange);
};
```

**Почему это проблема**

В side panel используется корректный вид:

```ts
chrome.storage.onChanged.addListener(onChanged);
chrome.storage.onChanged.removeListener(onChanged);
```

Официальная документация Chrome Storage API также показывает событие как:

```js
chrome.storage.onChanged.addListener((changes, namespace) => { ... });
```

То есть событие находится на `chrome.storage`, а не на `chrome.storage.local`.

**Возможный runtime-эффект**

- Dashboard может падать при mount `VacancySection`.
- Или auto-refresh просто не будет работать.
- QA увидит, что vacancy сохраняется, но dashboard не обновляется, пока не перезагрузить options page.
- Если TypeScript не ловит это из-за loose typings, ошибка появится только в браузере.

**Решение**

Заменить на:

```ts
chrome.storage.onChanged.addListener(handleStorageChange);
return () => {
  chrome.storage.onChanged.removeListener(handleStorageChange);
};
```

И отфильтровать namespace:

```ts
const handleStorageChange = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => {
  if (areaName !== "local") return;
  const relevantChange = Object.keys(changes).some(
    key => key.startsWith("badge_v1_hh_") || key === "app_settings_v1",
  );
  if (relevantChange) void loadJobs(true);
};
```

**Acceptance criteria**

- Dashboard не падает при открытии.
- Dashboard обновляется после Save/Reject без reload.
- Есть unit/static test, который запрещает `chrome.storage.local.onChanged`.

---

### P0-2. Нет подтверждения живым Chrome/Edge rerun после `b9d114c`

Старый manual QA на `a602b81` показал реальные runtime-блокеры:

- badge empty/non-interactive;
- Save/Reject/Side Panel не работают;
- Score/Status placeholders;
- core save/status unusable.

Код теперь выглядит намного лучше, но это всё ещё не runtime pass.

**Нужно прогнать**

1. Chrome: `hh.ru/vacancy/*`
2. Chrome: `*.hh.ru/vacancy/*`
3. Edge: короткий повтор core-flow
4. Save → score/status/badge
5. Side Panel → Overview/Score/History
6. Reject → status everywhere
7. Dashboard → vacancy appears/refreshes
8. Delete All → no stale badge
9. Strict Privacy → no resumeHighlights in cover letter payload

---

### P0-3. `pre-commit.ci - push = error` на `b9d114c`

Даже если локально `pnpm typecheck/lint/test/build` проходили, внешний статус ошибки нельзя игнорировать перед sign-off.

**Решение**

- Открыть GitHub UI → commit `b9d114c` → checks.
- Посмотреть точный лог `pre-commit.ci`.
- Если ошибка инфраструктурная — отметить в docs.
- Если ошибка форматирования/lint — исправить.
- Если pre-commit config отсутствует/битый — привести в порядок или отключить.

**Acceptance criteria**

- GitHub checks green или documented accepted exception.
- В release checklist добавлен пункт `GitHub checks are green`.

---

## 5. P1 — важные проблемы и риски

### P1-1. Passive HH status parser есть, но не интегрирован в runtime flow

**Файл:** `src/adapters/hh/hh-adapter.ts`

Появился метод:

```ts
extractVisibleApplicationStatus(doc)
```

Он ищет applied/viewed/invitation/rejected. Но поиск по репозиторию показывает, что метод используется только в adapter/tests/docs, а не в content script/tracker/UI.

**Риск**

ТЗ требовало passive status sync, чтобы локальный статус не расходился с HH. Сейчас parser есть, но статус не применяется.

**Что нужно**

В `EXTRACT_VACANCY` content script возвращать:

```ts
{ success: true, dto, passiveStatus }
```

Дальше в popup/side panel:

- если `detectedApplied` → показать hint: HH показывает, что отклик уже был;
- если `detectedRejected` → hint “HH показывает отказ”;
- если `detectedInvitation` → hint “HH показывает приглашение”;
- не менять статус автоматически без confirmation.

---

### P1-2. `ProfileTab` recompute score может не обновлять текущий `ctx.job` без refresh

`ProfileTab.handleSelectProfile()` вызывает:

```ts
await recomputeScoreForJob(jobId, profileId);
onProfileChange?.(profileId);
```

Нужно убедиться, что wrapper в side panel реально вызывает `onRefresh()` после `onProfileChange`, иначе:

- score пересчитается в DB;
- badge state сохранится;
- но текущая side panel может показывать старый `ctx.job`.

**Manual QA**

- Save без профиля → score `—`.
- Создать/выбрать profile в side panel.
- Score tab должен обновиться без закрытия side panel.

---

### P1-3. Badge state helpers продублированы

Есть похожие функции в:

- `entrypoints/popup/App.tsx`;
- `src/services/score-recompute.ts`;
- `src/services/delete-all.ts`.

**Риск**

- Разный payload shape.
- Один путь обновляет badge, другой нет.
- Сложнее чистить/мигрировать.

**Решение**

Вынести в:

```ts
src/services/badge-state.ts
```

Функции:

```ts
badgeStorageKey(sourceVacancyId)
persistBadgeState(job)
removeBadgeState(sourceVacancyId)
removeAllBadgeStates()
```

---

### P1-4. Generated manifest audit soft-skips без build output

**Файл:** `src/release-safety/generated-manifest-safety.test.ts`

Если `.output/chrome-mv3/manifest.json` отсутствует, тест не падает, а делает pass/warn.

**Риск**

`pnpm test` может быть зелёным, даже если generated manifest не проверялся вообще.

**Решение**

Добавить:

```json
"test:release": "pnpm build && RELEASE_AUDIT=true vitest run src/release-safety"
```

И hard-fail, если `RELEASE_AUDIT=true`, а `.output` отсутствует.

---

### P1-5. Generated bundle safety тоже soft-skips

**Файл:** `src/release-safety/content-script-safety.test.ts`

Если `.output/chrome-mv3/content-scripts` отсутствует, bundle-level scan фактически не выполняется.

**Решение**

То же:

- `test:release`;
- env guard;
- hard fail в release mode.

---

### P1-6. `package.json` не содержит `verify` / `test:release`

Сейчас есть:

```json
"build": "wxt build",
"typecheck": "tsc --noEmit",
"lint": "eslint .",
"test": "vitest run"
```

**Рекомендуемые scripts**

```json
"verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm build",
"test:release": "pnpm build && RELEASE_AUDIT=true vitest run src/release-safety"
```

---

### P1-7. Profile delete очищает `coverLetter.profileId` в пустую строку

**Файл:** `src/components/ProfileManager.tsx`

```ts
if (letter.profileId === id) {
  letter.profileId = "";
  await coverLetterRepo.save(letter);
}
```

**Модель:** `CoverLetter.profileId: string`

Пустая строка — это не валидный ID и не явное nullable state.

**Решение**

Лучше изменить contract:

```ts
profileId?: string;
```

Или сохранять historical profile snapshot:

```ts
profileSnapshotName: string
```

Чтобы письмо не теряло контекст.

---

### P1-8. Profile delete удаляет linked resumes

При удалении профиля удаляются все linked resumes. Это логично технически, но потенциально destructive.

**Решение UX**

Перед удалением показать counts:

```text
Будут удалены:
- профиль
- N резюме
- очищены ссылки в M вакансиях
- очищены ссылки в K письмах
```

---

### P1-9. Dashboard auto-refresh слушает только badge/settings keys

Даже после исправления на `chrome.storage.onChanged`, dashboard обновится только когда кто-то пишет `badge_v1_hh_*` или settings. Это работает для Save/Reject/recompute, но не для всех Dexie changes:

- profile delete clears job.selectedProfileId;
- resume delete clears job.selectedResumeId;
- future import JSON;
- future dashboard actions.

**Решение**

- либо Dexie `liveQuery`;
- либо централизованный `jobs_changed_v1` key после любых job mutations;
- либо manual refresh оставить как основной механизм.

---

### P1-10. Passive status regex может давать ложные applied/rejected

Текущий applied regex включает общий `отклик`. Это может сработать на CTA `Откликнуться`, если selector попадёт не на status label.

**Решение**

Добавить fixtures/tests:

- CTA `Откликнуться` → NOT applied;
- `Вы откликнулись` → applied;
- `Отклик отправлен` → applied.

Сузить regex:

```ts
/вы откликнулись|отклик отправлен|response sent|you applied/i
```

---

### P1-11. `experienceMinYears` всё ещё не заполняется

`tracker.dtoToNewJob()` всё ещё не парсит `experienceRaw` в `experienceMinYears`.

**Решение**

Добавить `parseExperienceMinYears()`:

- `1–3 года` → 1
- `3–6 лет` → 3
- `более 6 лет` → 6
- `не требуется` → 0
- `5+ years` → 5
- `no experience` → 0

---

### P1-12. `companyIdFromName()` может давать collisions

Company ID строится из name slug. Это временно, но риск остаётся:

- одинаковые имена компаний;
- agency;
- `unknown`.

**Решение**

Парсить `sourceCompanyId` из employer link `/employer/<id>` и сохранить в DTO/Company.

---

### P1-13. Side panel context зависит от active tab guessing

Side panel использует active tab detection. После открытия side panel / options / dashboard active tab может быть не тем, что ожидается.

**Решение**

Background должен хранить explicit context:

```ts
OPEN_SIDE_PANEL { tabId, vacancyId }
background.activeVacancyContext = { tabId, vacancyId, windowId }
sidepanel reads context
```

Badge/popup должны передавать `vacancyId`.

---

## 6. P2 — улучшения качества

### P2-1. UI всё ещё смешанный English/Russian

Для личного проекта допустимо, но для русскоязычного QA/usage лучше либо:

- полностью русифицировать UI;
- либо зафиксировать English UI и русские docs.

### P2-2. Settings section в dashboard всё ещё placeholder

Для Phase 1 полезны реальные toggles:

- showPageBadge;
- defaultProfileId;
- strictPrivacyMode;
- allowResumeHighlightsToAI;
- allowFullDescriptionToAI;
- debugHtmlMode;
- AI enabled off;
- n8n enabled off.

### P2-3. No import JSON

Export есть, import нет. Для RC не blocker, но для backup/restore нужно позже.

### P2-4. Search parser intentionally empty

`extractSearchList()` возвращает `[]`. Это правильно для Phase 1, но не забыть перед Phase 2.

### P2-5. No production AI provider

AI privacy contracts есть, но production provider ещё не core. Это нормально, если AI остаётся opt-in/deferred.

---

## 7. Safety audit

### Хорошо

- `wxt.config.ts` сохраняет минимальные permissions: `storage`, `sidePanel`, `activeTab`.
- `host_permissions: []`.
- Content script matches только HH vacancy pages.
- `HHAdapter` не делает network requests.
- Content script не пишет в HH forms.
- Не найдено `.dispatchEvent` в runtime code.
- Не найдено `fetch()` к HH в runtime code search.
- Generated manifest audit добавлен.
- Generated bundle safety scan добавлен.
- `deleteAllData()` теперь чистит badge keys.

### Проверить добивочно

- Generated manifest audit реально запускается после build.
- Pre-commit.ci error не связан с safety/lint.
- В live browser DevTools проверить:
  - нет fetch/XHR к HH от extension;
  - нет cookies permission;
  - нет auto-click/auto-fill;
  - Save/Reject не меняют HH DOM.

---

## 8. Тестовое покрытие

### Улучшено

- `tracker.test.ts`: проверяет `saved`, no `hh_unknown`, preserve stronger statuses.
- `ai-input-builders.test.ts`: закрывает privacy gap.
- `score-recompute.test.ts`: новый сервис.
- `database.test.ts`: schema v2 / compound index.
- `ProfileManager.test.ts`: lifecycle cleanup.
- `hh-adapter.test.ts`: много новых cases.
- `fixture-regression.test.ts`: обновлены fixtures.
- `generated-manifest-safety.test.ts`: build manifest audit.
- `content-script-safety.test.ts`: bundle scan.

### Осталось добавить

1. Static test: запретить `chrome.storage.local.onChanged`.
2. Release-mode hard fail, если `.output` отсутствует.
3. Test for passive status false positive: CTA `Откликнуться`.
4. Test for side panel profile selection updating score without manual refresh.
5. Test for explicit side panel context.
6. Browser smoke test harness.

---

## 9. Рекомендуемый добивочный Codex-прогон

```text
Ты работаешь в репозитории VacancyPilot на коммите b9d114c.

Контекст:
Проект — WXT/React/TypeScript MV3 расширение для HH.ru. Safety-first: no auto-submit, no auto-click, no HH fetch, no form writes. Нужно сделать добивочный hardening pass после аудита.

Главные задачи:

1. Исправить Dashboard auto-refresh:
   - В entrypoints/options/App.tsx заменить chrome.storage.local.onChanged на chrome.storage.onChanged.
   - Добавить фильтр areaName === "local".
   - Добавить тест/static guard, который запрещает chrome.storage.local.onChanged.
   - Убедиться, что dashboard не падает при mount.

2. Добавить release scripts:
   - package.json:
     "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm build"
     "test:release": "pnpm build && RELEASE_AUDIT=true vitest run src/release-safety"
   - Generated manifest/bundle tests должны hard-fail при RELEASE_AUDIT=true, если .output отсутствует.

3. Усилить generated manifest safety:
   - Проверить actual .output/chrome-mv3/manifest.json.
   - Проверить permissions, host_permissions, optional_permissions, content_scripts.matches.
   - В release mode не skip.

4. Интегрировать passive HH status parser:
   - Content script EXTRACT_VACANCY должен возвращать dto + passiveStatus.
   - Tracker/UI не должны автоматически менять статус без confirmation.
   - Popup/SidePanel должны показать hint: "HH показывает: Вы откликались / Приглашение / Отказ".
   - Добавить fixtures/tests:
     - "Вы откликнулись" => detectedApplied true.
     - CTA "Откликнуться" => NOT detectedApplied.

5. Recompute score UX:
   - Убедиться, что выбор профиля в SidePanel обновляет current ctx.job без ручного refresh.
   - Если нужно, ProfileTabWrapper должен вызывать onRefresh after recompute.
   - Badge/dashboard должны получать новый score.

6. Убрать дубли badge helpers:
   - Создать src/services/badge-state.ts:
     badgeStorageKey, persistBadgeState, removeBadgeState, removeAllBadgeStates.
   - Использовать его в popup, score-recompute, delete-all.

7. Experience parser:
   - Добавить parseExperienceMinYears().
   - Заполнять job.experienceMinYears.
   - Покрыть RU/EN cases.

8. Profile/resume lifecycle:
   - Не записывать coverLetter.profileId = "".
   - Либо сделать profileId optional в модели, либо сохранять historical deleted profile snapshot.
   - Добавить тесты.

9. Safety:
   - Не добавлять host_permissions.
   - Не добавлять tabs/cookies/webRequest/scripting.
   - Не добавлять fetch к HH.
   - Не добавлять .click/.value/dispatchEvent на HH controls.

После изменений запусти:
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release

Верни краткий changelog, список изменённых файлов и manual QA checklist для Chrome + Edge rerun.
```

---

## 10. Минимальный manual rerun после добивки

### Chrome

1. Load unpacked `.output/chrome-mv3`.
2. Open `https://hh.ru/vacancy/...`.
3. Badge appears.
4. Popup → Vacancy detected.
5. Save → status `saved`.
6. If no profile, score hint is clear.
7. Create profile.
8. Select profile in side panel.
9. Score appears without closing side panel.
10. Badge updates.
11. Dashboard table updates.
12. Reject → status `rejected_by_me`.
13. Dashboard updates.
14. Delete job → badge state gone after reload.
15. Delete all → no stale badge keys.

### Domain coverage

Repeat core Save:

- `https://hh.ru/vacancy/...`
- `https://spb.hh.ru/vacancy/...`

### Edge

Short rerun:

- install;
- badge;
- popup detected;
- Save;
- Side Panel;
- Reject;
- Dashboard.

### Safety smoke

- DevTools Network: no HH fetch/XHR from extension.
- No form auto-fill.
- No auto-click.
- No cookies permission.
- No telemetry.

---

## 11. Release readiness

### До `b9d114c`

`Phase 1 RC: not ready`

### После `b9d114c`

`Phase 1 RC: close, but not ready`

### Blockers before RC

1. Fix `chrome.storage.local.onChanged`.
2. Resolve `pre-commit.ci - push = error`.
3. Run live Chrome/Edge rerun.
4. Confirm generated manifest tests run in release mode after build.
5. Confirm no stale badge after Delete All / Delete Job.
6. Confirm profile selection updates score in side panel without manual workaround.

### If blockers are fixed

Then project can be considered:

```text
Phase 1 private RC candidate
```

Not yet public release.

---

## 12. Final verdict

The latest patches materially improved the project. This is no longer just a spec-first shell: storage, save semantics, score recompute, privacy and parser hardening are now real code.

The main remaining work is **runtime confidence**:

```text
Does the actual installed extension behave correctly in Chrome/Edge?
```

The codebase is now close enough that a focused Codex hardening pass + manual rerun should be enough to move Phase 1 from “close” to “private RC”.

Recommended next action:

```text
Run the dobivочный Codex prompt above.
Then perform Chrome/Edge ITER-021+ rerun.
Do not start Phase 2 search badges until this is green.
```
