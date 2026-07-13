# VacancyPilot — глубокий аудит репозитория и runtime-готовности

**Дата аудита:** 2026-06-20
**Репозиторий:** `iurii-izman/VacancyPilot`
**Контекст:** Phase 1 / ITER-021 Runtime QA Rerun
**Последний явно обсуждаемый build:** `c547273` + ITER-021 fixes
**Предыдущий проблемный build:** `a602b81`
**Формат аудита:** статический code review + анализ документации + анализ ручного QA-отчёта + проверка GitHub metadata/status через GitHub connector.
**Ограничение:** живой запуск расширения в Chrome/Edge из этой среды невозможен, поэтому все runtime-выводы, не подтверждённые кодом, помечены как `требует ручной проверки`.

---

## 1. Executive Summary

Проект заметно продвинулся после предыдущего аудита: `popup`, `badge`, `side panel`, `dashboard`, `profile/resume manager` и runtime-связка `EXTRACT_VACANCY → tracker → scoring → badge/UI` уже частично собраны.

Однако проект **ещё нельзя считать готовым Phase 1 release candidate**, потому что остаются важные P0/P1 проблемы:

1. `Save` фактически создаёт статус `viewed`, а не `saved`, что противоречит UX кнопки `Save`.
2. `deleteAllData()` и `deleteJobData()` не чистят `badge_v1_hh_*` в `chrome.storage.local`, поэтому после удаления данных возможны ghost badges и stale state.
3. `jobRepo.findBySourceVacancy()` использует object query `{ source, sourceVacancyId }`, но schema не содержит compound index `[source+sourceVacancyId]`; это риск нестабильного upsert в Dexie.
4. `tracker` всё ещё допускает fallback `sourceVacancyId = "unknown"`, что может привести к коллизии `hh_unknown`.
5. `buildCoverLetterInput()` отправляет `resume.highlightsText` без тех же privacy gate, которые есть в `buildVacancyAnalysisInput()`.
6. `HHAdapter.matchUrl()` использует `hostname.includes("hh.ru")`, что теоретически пропускает не-HH домены с `hh.ru` в hostname.
7. Выбор профиля в Side Panel сохраняет `selectedProfileId`, но не пересчитывает `ruleScore` и не обновляет badge/dashboard.
8. Generated manifest не проверяется автоматическим тестом; текущий manifest safety test читает `wxt.config.ts`, а не итоговый `.output/.../manifest.json`.
9. Парсер HH остаётся хрупким: мало fixtures, слабое определение work mode, нет passive status sync, `descriptionHtml` фактически содержит textContent.
10. Manual QA на реальном браузере после ITER-021 всё ещё нужен: пункты `LIKELY FIXED` нельзя считать закрытыми только по code review.

### Общая оценка текущего состояния

| Направление | Оценка |
|---|---:|
| Продуктовая стратегия | 92/100 |
| Safety philosophy / non-goals | 88/100 |
| Архитектура | 80/100 |
| Runtime wiring | 68/100 |
| Парсер HH | 60/100 |
| Tracker/storage | 70/100 |
| Scoring | 76/100 |
| Privacy/AI layer | 72/100 |
| UI/UX | 62/100 |
| Тесты | 72/100 |
| Release readiness | 48/100 |

**Итоговая оценка:** `71/100`.

После исправления P0 и ручного rerun в Chrome/Edge проект может подняться до `80–84/100`.

---

## 2. Что проверено

### 2.1. Основные файлы

Проверены ключевые зоны:

- `package.json`
- `wxt.config.ts`
- `entrypoints/vacancy.content.ts`
- `entrypoints/background.ts`
- `entrypoints/popup/App.tsx`
- `entrypoints/sidepanel/App.tsx`
- `entrypoints/options/App.tsx`
- `src/components/PageStatus.tsx`
- `src/components/ProfileTab.tsx`
- `src/components/ProfileManager.tsx`
- `src/components/ResumeManager.tsx`
- `src/adapters/hh/hh-adapter.ts`
- `src/adapters/hh/selectors-v1.ts`
- `src/db/schema.ts`
- `src/db/repositories.ts`
- `src/services/tracker.ts`
- `src/services/scoring.ts`
- `src/services/ai-input-builders.ts`
- `src/services/redaction.ts`
- `src/services/export-data.ts`
- `src/services/delete-all.ts`
- `src/release-safety/manifest-safety.test.ts`
- `src/release-safety/content-script-safety.test.ts`
- manual QA report `2026-06-20`
- ITER-021 rerun notes

### 2.2. Что не удалось проверить напрямую

Не удалось из этой среды:

- загрузить `.output/chrome-mv3` в Chrome/Edge;
- кликнуть реальный badge;
- проверить `chrome.sidePanel.open()` в живом браузере;
- проверить `chrome.storage.onChanged` auto-refresh в реальном side panel;
- открыть реальные HH pages;
- выполнить `pnpm test/build/typecheck` локально.

Поэтому runtime-выводы разделены на:

- **подтверждено кодом**;
- **вероятный баг**;
- **требует живого браузерного rerun**.

---

## 3. Позитивные изменения после прошлой проверки

### 3.1. Content script match pattern исправлен

`entrypoints/vacancy.content.ts` теперь покрывает оба варианта:

```ts
matches: ["https://hh.ru/vacancy/*", "https://*.hh.ru/vacancy/*"]
```

Это закрывает прежний gap, когда bare domain `hh.ru/vacancy/*` мог не получать content script.

### 3.2. Popup теперь содержит реальный Save/Reject flow

В `popup/App.tsx` появились:

- `handleSave()`;
- `handleReject()`;
- `EXTRACT_VACANCY` message;
- `tracker.saveFromDTO()`;
- `computeAndStoreScore()`;
- `updateBadge()`;
- `persistBadgeState()`.

Это значит, что core runtime flow уже не просто TODO.

### 3.3. Badge теперь восстанавливает состояние

Content script читает `badge_v1_hh_<vacancyId>` из `chrome.storage.local` и восстанавливает score/status при загрузке страницы.

### 3.4. Side panel уже показывает данные вакансии

Side panel больше не только shell: появились вкладки Overview, Score, Profile, History, refresh-кнопка и auto-refresh через `chrome.storage.onChanged`.

### 3.5. Dashboard получил таблицу вакансий

`VacancySection` теперь загружает jobs из `jobRepo.list()` и показывает таблицу `Title / Company / Score / Status / Updated`.

### 3.6. Появились ProfileManager и ResumeManager

Это сильное улучшение для Phase 1, потому что score теперь можно реально включить через создание профиля.

---

# 4. P0 — критичные проблемы перед Phase 1 RC

## P0-1. `Save` создаёт статус `viewed`, а не `saved`

### Где

`src/services/tracker.ts`

```ts
status: "viewed",
statusHistory: [createStatusChange(undefined, "viewed", "system")]
```

### Почему это проблема

Пользователь нажимает кнопку `Save`, но в базе появляется статус `viewed`. Это UX-несоответствие:

- в popup пользователь ожидает `saved`;
- в dashboard ожидает сохранённую вакансию;
- badge должен показать meaningful state;
- manual QA проверяет именно save flow.

### Риск

Высокий. Даже если технически вакансия сохраняется, QA может снова отметить `core-save` как частично нерабочий, потому что статус не соответствует действию.

### Рекомендация

Разделить:

```ts
tracker.trackViewedFromDTO(dto)
tracker.saveFromDTO(dto)
```

Или добавить параметр:

```ts
tracker.saveFromDTO(dto, { initialStatus: "saved" })
```

Для popup `Save` использовать `saved`.

### Acceptance criteria

- После нажатия `Save` статус вакансии = `saved`.
- `statusHistory` содержит переход `undefined → saved` или `viewed → saved`.
- Badge показывает `saved`.
- Dashboard показывает `Saved`.

---

## P0-2. `deleteAllData()` не удаляет `badge_v1_hh_*`

### Где

`src/services/delete-all.ts`

```ts
const PRODUCT_STORAGE_KEYS = [
  "app_settings_v1",
];
```

При этом `popup/App.tsx` сохраняет badge state:

```ts
badge_v1_hh_<vacancyId>
```

### Почему это проблема

После `Delete All Data`:

- Dexie jobs удаляются;
- настройки удаляются;
- но `badge_v1_hh_123456` остаётся в `chrome.storage.local`;
- content script на той же вакансии восстановит старый score/status;
- пользователь увидит ghost state после удаления данных.

Это прямое нарушение privacy/data controls.

### Риск

Критичный для privacy и QA. Пункт `Delete all data` должен гарантированно очищать все продуктовые данные.

### Рекомендация

Добавить функцию:

```ts
async function removeBadgeKeys(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter(k => k.startsWith("badge_v1_hh_"));
  if (keys.length) await chrome.storage.local.remove(keys);
}
```

Вызвать в:

- `deleteAllData()`;
- `deleteJobData(jobId)`;
- возможно при статусе blacklist/delete.

### Acceptance criteria

- После Delete All Data в `chrome.storage.local` нет `badge_v1_hh_*`.
- После удаления одной вакансии удаляется её badge key.
- Повторное открытие вакансии не показывает старый score/status.

---

## P0-3. Риск Dexie query без compound index

### Где

`src/db/repositories.ts`

```ts
findBySourceVacancy: (source: string, sourceVacancyId: string) =>
  db.jobs.where({ source, sourceVacancyId }).first(),
```

`src/db/schema.ts`

```ts
jobs: '&id, source, sourceVacancyId, companyId, status, ...'
```

### Почему это проблема

Schema не содержит compound index:

```ts
[source+sourceVacancyId]
```

Object query по нескольким полям в Dexie может требовать compound index или вести себя не так, как ожидается. Даже если сейчас тесты проходят, это хрупкая зона.

### Риск

Высокий: upsert существующей вакансии может не находить текущую запись или падать в runtime.

### Рекомендация

Добавить schema v2:

```ts
db.version(2).stores({
  jobs: '&id, source, sourceVacancyId, [source+sourceVacancyId], companyId, status, selectedProfileId, firstSeenAt, updatedAt, descriptionHash',
  ...
});
```

И заменить repository:

```ts
findBySourceVacancy: (source, sourceVacancyId) =>
  db.jobs.where("[source+sourceVacancyId]").equals([source, sourceVacancyId]).first()
```

### Acceptance criteria

- Есть тест: два job с разными `sourceVacancyId` находятся корректно.
- Повторный Save одной и той же вакансии обновляет existing job, а не создаёт дубль.
- Existing users мигрируются с schema v1 на v2.

---

## P0-4. `sourceVacancyId = "unknown"` создаёт риск коллизий

### Где

`src/services/tracker.ts`

```ts
const sourceVacancyId = dto.sourceVacancyId ?? "unknown";
id: buildJobId(sourceVacancyId)
```

### Почему это проблема

Если parser не извлечёт ID, все такие вакансии получат:

```text
hh_unknown
```

И начнут перетирать друг друга.

### Риск

Высокий для устойчивости данных.

### Рекомендация

В `saveFromDTO()`:

```ts
if (!dto.sourceVacancyId) {
  throw new Error("Cannot save HH vacancy without sourceVacancyId");
}
```

Для rare fallback можно использовать hash от URL, но для HH лучше требовать ID из URL.

### Acceptance criteria

- Вакансия без `sourceVacancyId` не сохраняется как `hh_unknown`.
- UI показывает понятную ошибку: `Не удалось определить ID вакансии. Обновите страницу.`
- Есть unit test.

---

## P0-5. Cover Letter payload нарушает strict privacy expectation

### Где

`src/services/ai-input-builders.ts`

`buildVacancyAnalysisInput()` корректно учитывает:

- `strictPrivacyMode`;
- `allowFullDescriptionToAI`;
- `allowResumeHighlightsToAI`;
- force overrides.

Но `buildCoverLetterInput()` делает:

```ts
resumeHighlights: resume?.highlightsText
  ? applyPrivacy(resume.highlightsText)
  : '',
```

### Почему это проблема

Если пользователь включил Strict Privacy или запретил resume highlights, Cover Letter flow всё равно отправит `resume.highlightsText`, если `resume` передан.

### Риск

Критичный privacy gap.

### Рекомендация

Добавить для cover letter те же правила:

```ts
const isStrict = settings.privacy.strictPrivacyMode;
const includeResumeHighlights =
  settings.privacy.allowResumeHighlightsToAI === true &&
  (!isStrict || options?.forceResumeHighlights === true) &&
  resume?.highlightsText;
```

И вернуть `''`, если нельзя отправлять.

### Acceptance criteria

- В Strict Privacy `CoverLetterInput.resumeHighlights === ""`.
- Если `allowResumeHighlightsToAI === false`, highlights не отправляются.
- Payload preview показывает, что highlights excluded.
- Есть release-safety test.

---

## P0-6. Выбор профиля не пересчитывает score

### Где

`src/components/ProfileTab.tsx`

`handleSelectProfile()` сохраняет:

```ts
selectedProfileId: profileId
selectedResumeId: undefined
```

Но не вызывает `scoreJob()` и не обновляет `ruleScore`.

### Почему это проблема

Сценарий:

1. Пользователь сохранил вакансию без профиля.
2. Score = `—`.
3. Пользователь создал профиль и выбрал его в Side Panel.
4. Score всё ещё `—`, пока не нажать Save снова или не выполнить другую операцию.

Это ломает UX, особенно учитывая residual risk из ITER-021: scoring requires at least one profile.

### Рекомендация

После выбора профиля:

```ts
const scoreResult = scoreJob(updated, profile);
await jobRepo.save({ ...updated, ruleScore: scoreResult });
```

И обновить badge storage:

```ts
badge_v1_hh_<id> = { score, status }
```

Но лучше вынести общий `recomputeJobScore(jobId, profileId)` service, чтобы popup/sidepanel/dashboard использовали одну логику.

### Acceptance criteria

- После выбора профиля score появляется без повторного Save.
- Badge обновляется.
- Dashboard показывает новый score.
- History/event log фиксирует `score_recomputed` или status не меняется.

---

## P0-7. Нет живого rerun подтверждения после ITER-021

### Где

Manual QA report показывает, что на build `a602b81` были runtime blockers:

- badge empty/non-interactive;
- Save/Reject/Side Panel не работают;
- Score/Status placeholders;
- core save/status flow unusable.

ITER-021 analysis помечает их как `LIKELY FIXED`, но без live browser rerun.

### Почему это проблема

Code review + automated validation не заменяют ручной runtime check для Chrome extension, особенно когда проблема была именно в browser runtime.

### Рекомендация

Не объявлять Phase 1 RC до прогонки:

- Chrome on `hh.ru/vacancy/*`;
- Chrome on `*.hh.ru/vacancy/*`;
- Edge short rerun;
- Save/Reject/SidePanel/Dashboard;
- profile/no-profile score behavior.

---

# 5. P1 — важные проблемы после P0

## P1-1. `HHAdapter.matchUrl()` слишком широкий

### Где

`src/adapters/hh/hh-adapter.ts`

```ts
if (!parsed.hostname.includes("hh.ru")) return null;
```

### Проблема

`evil-hh.ru` или `hh.ru.example.com` теоретически пройдут проверку.

### Fix

```ts
const host = parsed.hostname.toLowerCase();
const isHH = host === "hh.ru" || host.endsWith(".hh.ru");
if (!isHH) return null;
```

---

## P1-2. Parser не умеет passive status sync

### Где

`extractVisibleApplicationStatus()` возвращает `null`.

### Почему важно

ТЗ требует читать видимые статусы HH:

- `Вы откликались`;
- `Резюме просмотрено`;
- `Приглашение`;
- `Отказ`.

Без этого локальный tracker быстро расходится с реальностью.

### Fix

Реализовать parser по видимым labels/buttons, без API/fetch.

---

## P1-3. Work mode определяется слишком слабо

### Где

`normalizeWorkMode()` использует только `workModeRaw`, который извлекается по `SELECTORS_V1.workMode`.

### Проблема

На HH формат работы часто может быть в description/schedule/location, а не в отдельном work-mode selector.

### Fix

Передавать combined text:

```ts
const workModeRaw = [
  this.tryExtract(doc, "workMode"),
  schedule,
  city,
  descriptionText.slice(0, 1000)
].filter(Boolean).join(" ");
```

---

## P1-4. `descriptionHtml` фактически содержит plain text

### Где

`tryExtract()` всегда возвращает `textContent.trim()`, но поле называется `descriptionHtml`.

### Проблема

Это вводит в заблуждение:

- privacy logic;
- debug mode;
- export;
- future HTML redaction.

### Fix

Разделить:

```ts
descriptionText = element.textContent?.trim()
descriptionHtml = debugMode ? element.innerHTML : null
```

Для Core хранить только text.

---

## P1-5. Мало parser fixtures

Текущие fixture tests ранее показывали 3 кейса:

- normal;
- no salary;
- archived.

Для HH этого недостаточно.

### Нужно минимум 20–50 fixtures

Приоритетные:

1. salary range;
2. salary от;
3. salary до;
4. no salary;
5. remote;
6. office;
7. hybrid;
8. no skills;
9. many skills;
10. archived;
11. already applied;
12. logged-out;
13. company hidden/agency;
14. Cyrillic-only;
15. English vacancy;
16. long description;
17. short vague description;
18. regional subdomain;
19. bare hh.ru;
20. different layout/A-B test.

---

## P1-6. Dashboard не автообновляется

`VacancySection` грузит jobs on mount. Если dashboard уже открыт и пользователь сохраняет vacancy из popup, таблица может остаться старой.

### Fix options

- refresh button in Vacancies;
- `chrome.storage.onChanged` listener;
- Dexie liveQuery;
- polling не нужен.

---

## P1-7. Settings section пока пустой

Dashboard содержит Settings section, но он EmptyState.

Для Phase 1 нужно хотя бы:

- defaultProfileId;
- showPageBadge;
- strictPrivacyMode;
- AI enabled false;
- n8n enabled false;
- debugHtmlMode false.

---

## P1-8. UI частично на английском

Большая часть interface labels:

- Save;
- Reject;
- Dashboard;
- Side Panel;
- Score breakdown;
- Profiles;
- Resumes;
- Export Your Data.

Если целевой пользователь русскоязычный, нужно либо:

- полностью русифицировать MVP;
- либо явно выбрать English UI.

Сейчас смешанный язык снижает UX.

---

## P1-9. Удаление профиля/резюме оставляет orphan references

### Где

`ProfileManager.handleDelete()` удаляет profile, но не чистит:

- `jobs.selectedProfileId`;
- `coverLetters.profileId`;
- `resumes.profileId`;
- `settings.general.defaultProfileId`;
- possibly applications.

`ResumeManager.handleDelete()` удаляет resume, но не чистит:

- `jobs.selectedResumeId`;
- `coverLetters.resumeId`;
- `applications.resumeId`.

### Fix

Добавить safe cascade или warn before delete.

---

## P1-10. Profile form допускает `NaN` salary

`salaryExpectationMin` превращается через:

```ts
Number(form.salaryExpectationMin)
```

Если пользователь введёт `abc`, в profile может попасть `NaN`.

### Fix

- input type number;
- validation;
- parse positive integer;
- reject NaN;
- show error.

---

## P1-11. Scoring не пересчитывается при изменении profile/resume

Если пользователь меняет профиль в dashboard, старые jobs остаются со старым score.

### Fix

- `profile.updatedAt` invalidates score;
- `ruleScore.profileVersion` or `profileUpdatedAt`;
- button `Recalculate all scores`;
- per-job recompute.

---

## P1-12. Scoring lacks aliases/synonyms

Пример:

- `JS` vs `JavaScript`;
- `amoCRM` vs `Kommo`;
- `Bitrix24` vs `Битрикс24`;
- `LLM` vs `Large Language Models`;
- `n8n` vs `workflow automation`.

Без synonym dictionary score будет нестабилен.

---

## P1-13. Generated manifest не проверяется

Текущий manifest safety test читает `wxt.config.ts`, но не `.output/.../manifest.json`.

### Fix

Добавить post-build test:

```bash
pnpm build
node scripts/audit-generated-manifest.mjs
```

Проверять:

- actual `manifest_version`;
- permissions;
- host_permissions;
- optional_permissions;
- content_scripts.matches;
- side_panel path.

---

## P1-14. Content safety tests regex-based и неполные

Они полезны, но:

- не сканируют generated bundle;
- не строят AST;
- не проверяют indirect DOM mutation через helper functions;
- не проверяют `element.dispatchEvent`.

### Fix

- добавить AST-lite scanner;
- сканировать `entrypoints` + `src/services` + generated chunks;
- запретить dangerous API в `content.*`.

---

## P1-15. Badge state storage может расти бесконечно

Каждая сохранённая vacancy может создать:

```text
badge_v1_hh_<id>
```

Нет cleanup/TTL.

### Fix

- хранить badge state в Dexie/derived from jobs, если content script может запросить background;
- или cleanup keys when job deleted;
- или expiry/lastUpdated.

---

## P1-16. Side panel current tab detection может быть хрупким

Side panel использует:

```ts
chrome.tabs.query({ active: true, lastFocusedWindow: true })
```

Если пользователь переключился на dashboard/options или sidepanel focus ведёт себя иначе в Edge, контекст вакансии может потеряться.

### Fix

- при клике badge/popup передавать `tabId`/`vacancyId` в background;
- background хранит `activeVacancyContext`;
- sidepanel читает этот context, а не угадывает active tab.

---

# 6. P2 — улучшения качества и будущие задачи

## P2-1. AI production provider отсутствует

Есть mock provider, но OpenAI/DeepSeek/OpenRouter production client пока не виден в рабочем UI.

## P2-2. Cover Letter Studio пока больше editor, чем generator

Есть режимы, ограничения, save/copy, но нужна кнопка:

```text
Generate with AI
Show payload preview
Use cached result / regenerate
```

## P2-3. n8n остаётся deferred

Это нормально, но Settings/Labs UX должен явно говорить: `n8n deferred / disabled`.

## P2-4. Search badges Phase 2 не начинать до стабилизации Phase 1

Сейчас нельзя идти в search triage, пока core vacancy flow не закрыт.

## P2-5. Импорт JSON отсутствует

Export есть. Import можно отложить, но для backup/restore позже нужен.

## P2-6. Нет performance testing

Проверить dashboard на:

- 100 jobs;
- 500 jobs;
- 1000 jobs;
- large descriptions.

## P2-7. Нет accessibility pass

Проверить:

- keyboard navigation;
- aria labels;
- focus states;
- contrast;
- screen reader basics.

---

# 7. Security / Privacy Audit

## 7.1. Хорошо

- Manifest permissions минимальны: `storage`, `sidePanel`, `activeTab`.
- `host_permissions` пустые в config.
- Content script scoped to vacancy pages.
- No obvious `fetch()` to HH found in code search.
- No obvious `.click()` automation found in code search, except download helper in export, which is user-initiated file download, not HH control.
- Redaction service exists.
- Strict Privacy default exists.
- Export redacts n8n webhook URL.

## 7.2. Проблемы

### Badge state is product data

`badge_v1_hh_*` содержит как минимум:

- vacancy ID;
- score;
- status.

Это local user data. Нужно:

- удалять при Delete All;
- удалять при Delete Job;
- возможно включать в export или явно исключать и объяснять.

### Cover Letter privacy gap

`buildCoverLetterInput()` может отправлять resume highlights в обход strict privacy expectations.

### API key / n8n storage UI не завершены

Пока production AI/n8n нет, но при добавлении нужно не забыть:

- never sync;
- redact export;
- delete all;
- warning;
- optional host permissions.

---

# 8. Runtime QA Plan после исправления P0

## 8.1. Минимальный Chrome rerun

1. Установить fresh `.output/chrome-mv3`.
2. Открыть `https://hh.ru/vacancy/...`.
3. Проверить badge.
4. Открыть popup.
5. Нажать Save.
6. Проверить status = `saved`, score или понятный no-profile hint.
7. Создать profile.
8. Пересчитать score.
9. Открыть side panel.
10. Проверить Overview/Score/History.
11. Нажать Reject.
12. Проверить badge/popup/sidepanel/dashboard.
13. Delete one job.
14. Перезагрузить HH page: badge не должен показывать stale status.
15. Delete all data.
16. Перезагрузить HH page: ghost state отсутствует.

## 8.2. Domain rerun

Проверить оба:

- `https://hh.ru/vacancy/...`
- `https://spb.hh.ru/vacancy/...`

## 8.3. Edge short rerun

Повторить:

- badge;
- popup vacancy detected;
- Save;
- Side Panel;
- Reject;
- Dashboard.

---

# 9. Рекомендуемый план исправлений

## ITER-022 — Storage & Data Integrity Hardening

Цель: закрыть P0 storage/data bugs.

Tasks:

1. Add schema v2 with `[source+sourceVacancyId]`.
2. Change `findBySourceVacancy()` to compound index.
3. Reject `sourceVacancyId` missing.
4. Remove `hh_unknown`.
5. Add badge key cleanup:
   - `deleteAllData()`;
   - `deleteJobData()`.
6. Add tests for all above.

Commit:

```text
fix: harden vacancy storage and badge cleanup
```

---

## ITER-023 — Save/Status Semantics

Цель: закрыть UX mismatch Save=viewed.

Tasks:

1. Make popup Save create/update status `saved`.
2. Preserve existing stronger statuses: do not downgrade `applied/interview/offer`.
3. Add status transition tests.
4. Update dashboard labels.
5. Update manual QA checklist.

Commit:

```text
fix: align save action with saved status
```

---

## ITER-024 — Profile Score Recompute

Цель: score появляется после выбора профиля.

Tasks:

1. Create `recomputeJobScore(jobId, profileId)` service.
2. Use it in:
   - popup;
   - ProfileTab;
   - dashboard future actions.
3. Update badge storage after recompute.
4. Add no-profile hint.
5. Add tests.

Commit:

```text
feat: recompute score on profile selection
```

---

## ITER-025 — Privacy Gap Fix

Цель: close Cover Letter privacy issue.

Tasks:

1. Add cover letter privacy include rules.
2. Add payload preview for cover letters.
3. Add tests:
   - strict mode excludes resumeHighlights;
   - allowResumeHighlights false excludes highlights;
   - force override works only with explicit option.

Commit:

```text
fix: apply strict privacy to cover letter payloads
```

---

## ITER-026 — Parser Hardening

Цель: improve HH parsing reliability.

Tasks:

1. Fix `matchUrl()` host check.
2. Rename/clarify `descriptionHtml`.
3. Improve work mode detection.
4. Add passive status skeleton.
5. Add 10–20 new fixtures.

Commit:

```text
fix: harden hh adapter parsing
```

---

## ITER-027 — Generated Manifest & Runtime Safety

Цель: improve release safety.

Tasks:

1. Add generated manifest audit script.
2. Scan generated bundle for forbidden HH automation patterns.
3. Add CI workflow if absent.
4. Document exact local commands.

Commit:

```text
test: audit generated extension manifest
```

---

# 10. Suggested bugs/issues to create

## Issue 1 — P0: Delete all leaves stale badge state

**Title:** `deleteAllData should remove badge_v1_hh_* chrome.storage keys`

**Acceptance:**

- Delete All removes badge keys.
- Delete Job removes its badge key.
- No ghost badge after reload.

---

## Issue 2 — P0: Save button stores viewed status

**Title:** `Popup Save should set job status to saved, not viewed`

**Acceptance:**

- New Save → `saved`.
- Existing `applied/interview/offer` not downgraded.
- Badge and dashboard show Saved.

---

## Issue 3 — P0: Add compound index for source+sourceVacancyId

**Title:** `Add Dexie v2 compound index [source+sourceVacancyId]`

**Acceptance:**

- Upsert finds existing job.
- Repeat Save creates no duplicate.
- Migration from v1 works.

---

## Issue 4 — P0: Remove hh_unknown fallback

**Title:** `Reject save when HH vacancy id cannot be extracted`

**Acceptance:**

- No `hh_unknown` jobs.
- UI shows actionable extraction error.

---

## Issue 5 — P0: Apply strict privacy to CoverLetterInput

**Title:** `Cover letter builder must respect allowResumeHighlightsToAI and Strict Privacy`

**Acceptance:**

- Strict Privacy excludes resume highlights.
- Tests added.

---

## Issue 6 — P1: Recompute score on profile selection

**Title:** `Profile selection should recompute rule score and update badge`

**Acceptance:**

- Select profile → score updates immediately.
- Badge/dashboard updated.

---

## Issue 7 — P1: Fix HH host matching

**Title:** `HHAdapter.matchUrl should use exact/suffix hostname check`

**Acceptance:**

- `hh.ru` and `*.hh.ru` pass.
- `evil-hh.ru` and `hh.ru.example.com` fail.

---

## Issue 8 — P1: Add generated manifest audit

**Title:** `Safety tests should validate generated MV3 manifest`

**Acceptance:**

- Build output manifest audited.
- content_scripts.matches audited.

---

# 11. Release readiness decision

## Current decision

```text
Phase 1 RC: NOT READY
```

## Why

Because P0 issues can create:

- wrong user-visible status;
- stale badge state after data deletion;
- potential upsert/index instability;
- privacy leak in cover letter flow;
- unclear score behavior after profile selection;
- lack of live browser confirmation after ITER-021.

## Required before RC

Minimum:

1. Fix P0-1 through P0-6.
2. Run Chrome + Edge rerun.
3. Add generated manifest audit or explicitly mark as known release risk.
4. Confirm Delete All removes all product local state.
5. Confirm Save/Reject flow in real HH pages.

---

# 12. Final assessment

The project is in a healthy direction. The strongest sign is that it did not drift into unsafe auto-apply behavior. The architecture remains read-first/local-first and the runtime surfaces are now much closer to a usable MVP.

The next best move is **not** adding AI/n8n/search badges. The best move is hardening the current runtime loop:

```text
HH vacancy → content extraction → local save → saved status → score → badge/popup/sidepanel/dashboard sync → delete/export safety
```

If this loop is made reliable, VacancyPilot becomes a real personal tool rather than a collection of good modules.

Recommended next iteration:

```text
ITER-022: Storage & Data Integrity Hardening
```

Then:

```text
ITER-023: Save/Status Semantics
ITER-024: Profile Score Recompute
ITER-025: Cover Letter Privacy Fix
ITER-026: HH Parser Hardening
```

After that, run a full manual QA and only then reconsider n8n/AI production provider/search badges.
