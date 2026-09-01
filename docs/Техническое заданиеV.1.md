# Техническое задание v1.1 FINAL

# VacancyPilot / CareerSignal HH Copilot

## 0. Статус документа

**Версия:** v1.1 FINAL
**Дата:** 19.06.2026
**Проектное название:** CareerSignal HH Copilot
**Публичное название-кандидат:** VacancyPilot
**Первый целевой сайт:** HH.ru
**Первый целевой браузер:** Chromium-браузеры: Chrome, Edge, Brave, Яндекс Браузер
**Тип продукта:** браузерное расширение
**Формат MVP:** local-first, user-controlled, read-first copilot
**Статус:** финальный baseline для разработки; исходные discovery-аудиты были историческими входными материалами и не являются runtime-зависимостями

Документ сводит исходное ТЗ и аудиты из `docs/search`. Если рекомендации конфликтуют, приоритет имеет более безопасный вариант:

1. read-only Core;
2. ручные действия пользователя на HH;
3. минимальные permissions;
4. локальное хранение;
5. явное согласие перед любым внешним запросом.

---

# 1. Executive Summary

CareerSignal HH Copilot, публичный кандидат названия VacancyPilot, — это браузерное расширение для HH.ru, которое помогает кандидату качественно и безопасно управлять поиском работы.

Проект не является автооткликером, спам-ботом или инструментом обхода ограничений HH. Основная идея — создать личный local-first copilot, который помогает пользователю:

* быстро понять, стоит ли вакансия внимания;
* сохранить вакансию в личный трекер;
* получить быстрый rule-based match score без AI;
* запустить AI-анализ по кнопке;
* выбрать подходящий профиль/резюме;
* подготовить качественное сопроводительное письмо;
* вести историю статусов и действий;
* экспортировать данные в CSV/JSON;
* отправлять минимальные события в n8n/Telegram по явному согласию пользователя.

Ключевой принцип:

> Расширение помогает принимать решения и готовить материалы, но не действует вместо пользователя на HH.

В первой версии запрещены:

* автоматическая отправка откликов;
* автоматические клики;
* авто-заполнение форм HH;
* обход CAPTCHA/антибот-защиты;
* фоновый массовый сбор вакансий;
* обращение к закрытым/неофициальным endpoint’ам HH;
* чтение чатов/переписки без явного действия пользователя;
* телеметрия разработчику по умолчанию.

---

# 2. Главная продуктовая формула

## 2.1. Что строим

**Job Intelligence & Tracker для HH.ru.**

Расширение отвечает на вопросы:

1. Стоит ли открывать эту вакансию?
2. Стоит ли откликаться?
3. Насколько вакансия подходит под мой профиль?
4. Какие риски есть в вакансии?
5. Какой профиль/резюме лучше использовать?
6. Какое сопроводительное письмо написать?
7. Что уже было с этой вакансией/компанией?
8. Какие отклики уже отправлены и какой результат?

## 2.2. Что не строим

Не строим “бота для большого количества откликов”.

Не строим “скрипт, который делает работу на HH вместо пользователя”.

Не строим “обход антибота”.

Не строим “скрытый парсер рынка вакансий”.

## 2.3. Позиционирование

### Основное позиционирование

> Личный local-first ассистент для анализа вакансий, подготовки откликов и ведения истории поиска работы на HH.ru.

### Английский tagline

> Smart job search copilot for HH and beyond.

### Русский tagline

> Умный помощник для отбора вакансий, сопроводительных писем и истории поиска работы.

---

# 3. Product Principles

## 3.1. Decision quality over automation

Главная ценность — не количество откликов, а качество решений.

Расширение должно помогать пользователю отправлять меньше случайных откликов и больше точных.

## 3.2. Read-first

Сначала читаем и анализируем только то, что пользователь сам открыл в браузере.

Никакого фонового обхода сайта.

## 3.3. User in control

Любое действие, влияющее на внешний сайт, делает пользователь.

Расширение может:

* показать анализ;
* сгенерировать письмо;
* скопировать текст;
* сохранить статус локально;
* открыть панель;
* предложить действие.

Расширение не должно:

* нажимать кнопку отправки;
* отправлять отклик;
* обходить защиту;
* делать скрытые запросы к HH;
* менять состояние на HH без явного действия пользователя.

## 3.4. Local-first

Основные данные хранятся локально в браузере пользователя.

По умолчанию данные не уходят разработчику, на сервер или третьей стороне.

## 3.5. Privacy by default

AI и n8n выключены или работают только после настройки и явного действия пользователя.

Перед отправкой данных наружу пользователь должен видеть payload preview.

## 3.6. Works without AI

Расширение должно быть полезно без AI-ключа:

* сохранять вакансии;
* показывать статусы;
* считать rule-based score;
* показывать причины fit/risk;
* экспортировать данные;
* вести трекер.

## 3.7. Core vs Labs

Проект делится на два слоя:

### Core

Безопасное ядро:

* парсинг открытой страницы;
* локальный трекер;
* scoring;
* AI по кнопке;
* письма;
* экспорт;
* n8n opt-in;
* search badges позже.

### Labs

Экспериментальные функции повышенного риска, выключенные по умолчанию:

* guided apply;
* clipboard/copy assist без auto-fill;
* очередь откликов;
* работа с HR-чатами;
* follow-up automation.

Labs не должны блокировать релиз Core.

## 3.8. Compliance-first

Проект не должен пытаться технически обходить ограничения платформы. Если функция может быть реализована двумя способами, выбирается тот, который:

* требует меньше permissions;
* не создаёт скрытых действий на HH;
* не эмулирует пользователя;
* легко объясняется в onboarding и privacy notice;
* может быть отключён без потери ядра продукта.

## 3.9. AI Copy & Human Paste

Все сценарии подготовки отклика строятся вокруг принципа:

```text
AI prepares → user reviews → user copies → user pastes → user submits
```

Расширение может генерировать, редактировать, сохранять и копировать текст. Расширение не пишет текст в поля HH и не инициирует отправку отклика в Core и Phase 1.

---

# 4. Целевая аудитория

## 4.1. Первичный пользователь

Один активный кандидат, который ищет работу на HH.ru и хочет:

* не терять историю откликов;
* быстро отсеивать нерелевантные вакансии;
* адаптировать сопроводительные письма;
* работать с несколькими направлениями профиля;
* иметь локальную базу вакансий;
* автоматизировать уведомления через n8n/Telegram.

## 4.2. Вторичные пользователи в будущем

* technical specialists;
* AI/automation engineers;
* product/project managers;
* системные аналитики;
* рекрутеры для личного sourcing workflow;
* карьерные консультанты;
* power users с n8n/Obsidian/Notion.

---

# 5. Основные сценарии пользователя

## 5.1. Сценарий A — анализ страницы вакансии

1. Пользователь открывает вакансию на HH.ru.
2. Расширение определяет, что это страница вакансии.
3. Извлекает данные вакансии.
4. Показывает компактный badge на странице.
5. Пользователь открывает side panel.
6. Видит:

   * title;
   * company;
   * salary;
   * city;
   * work mode;
   * experience;
   * skills;
   * rule-based score;
   * fit reasons;
   * risk flags;
   * recommended profile.
7. Пользователь сохраняет вакансию или отклоняет её.

## 5.2. Сценарий B — AI-анализ

1. Пользователь нажимает “AI-анализ”.
2. Расширение показывает payload preview:

   * что будет отправлено;
   * что не будет отправлено;
   * какой профиль используется;
   * какой AI-провайдер выбран.
3. Пользователь подтверждает.
4. Расширение отправляет очищенный JSON в AI API.
5. AI возвращает:

   * score;
   * recommendation;
   * fit reasons;
   * risk flags;
   * missing skills;
   * suggested profile/resume.
6. Результат сохраняется локально.

## 5.3. Сценарий C — генерация письма

1. Пользователь выбирает профиль.
2. Выбирает режим письма:

   * короткое TG;
   * HH стандарт;
   * уверенное;
   * очень краткое;
   * EN version.
3. Выбирает ограничения:

   * без emoji;
   * без markdown;
   * без спецсимволов;
   * до 500 символов;
   * до 1000 символов.
4. Нажимает “Сгенерировать”.
5. Расширение показывает draft.
6. Пользователь редактирует.
7. Сохраняет final version.
8. Копирует письмо вручную.

## 5.4. Сценарий D — локальный трекер

1. Пользователь открывает dashboard.
2. Видит таблицу вакансий.
3. Фильтрует по:

   * статусу;
   * score;
   * компании;
   * профилю;
   * дате;
   * наличию письма;
   * применённому резюме.
4. Экспортирует CSV/JSON.
5. При необходимости отправляет событие в n8n.

## 5.5. Сценарий E — search triage, Phase 2

1. Пользователь открывает поисковую выдачу HH.
2. Расширение добавляет компактные бейджи к карточкам.
3. Пользователь видит:

   * score;
   * status;
   * viewed/saved/applied;
   * blacklist;
   * remote/hybrid/office;
   * quick save/reject.
4. Расширение не открывает вакансии в фоне.
5. Scoring в выдаче считается только по данным, уже видимым в карточке.

## 5.6. Сценарий F — guided apply, Labs

Только после отдельного решения и только выключено по умолчанию.

1. Пользователь сам открывает вакансию.
2. Генерирует письмо.
3. Расширение помогает скопировать текст.
4. Пользователь сам открывает форму отклика.
5. Пользователь сам вставляет текст в форму HH.
6. Пользователь сам нажимает нативную кнопку HH “Откликнуться”.
7. Расширение только локально обновляет статус.

В этой версии Labs не включает программную запись в поля HH. Любой будущий сценарий direct form fill требует отдельного ТЗ, отдельного risk review, отдельного тестового аккаунта и не входит в текущий roadmap Core.

---

# 6. Non-goals / Запрещённый scope

## 6.1. Запрещено в MVP-1

* auto-submit откликов;
* auto-click по кнопкам HH;
* auto-fill формы HH;
* программная запись текста в поля формы HH;
* synthetic DOM events для имитации ввода;
* очередь откликов;
* чтение HR-чатов;
* классификация переписки;
* поддержка LinkedIn/Indeed/Workday;
* массовая обработка поисковой выдачи;
* фоновое открытие вакансий;
* фоновый polling HH;
* обращение к api.hh.ru или закрытым endpoint’ам;
* сохранение полного HTML по умолчанию;
* телеметрия разработчику;
* хранение cookies;
* работа с паролями;
* обход CAPTCHA.

## 6.2. Запрещено в целом без отдельного решения

* ротация IP;
* обход антибот-защит;
* эмуляция поведения для скрытого bypass;
* скрытая автоматизация;
* массовая автоотправка;
* работа через украденные/чужие токены;
* эксплуатация приватных API;
* обход лимитов платформы.

---

# 7. Roadmap

## Phase 0 — Silent Observer

### Цель

Проверить, что расширение стабильно распознаёт и извлекает данные со страниц вакансий HH.

### Функции

* WXT project setup;
* Manifest V3;
* TypeScript;
* content script для `hh.ru/vacancy/*`;
* extraction:

  * vacancy id;
  * title;
  * company;
  * salary raw;
  * city;
  * work mode;
  * experience;
  * description clean;
  * skills;
  * URL;
* сохранение в IndexedDB;
* экспорт JSON;
* debug panel;
* DOM fixtures;
* unit tests для парсера.

### Не входит

* AI;
* письма;
* n8n;
* search badges;
* auto-fill;
* dashboard;
* чаты.

### Acceptance Criteria

* Парсер успешно извлекает данные минимум из 50 разных вакансий.
* Если поле не найдено, расширение не падает.
* Для каждой тестовой вакансии создаётся fixture.
* Можно экспортировать сохранённые данные в JSON.
* Нет сетевых запросов к HH кроме тех, которые делает сам сайт.

---

## Phase 1 — Read & Assist MVP

### Цель

Сделать первый реально полезный продукт без риска авто-действий на HH.

### Функции

* side panel;
* popup;
* dashboard;
* local tracker;
* full status lifecycle;
* rule-based scoring;
* fit reasons / risk flags;
* Profile Manager v1;
* Resume references v1;
* Cover Letter Studio;
* AI-анализ по кнопке;
* payload preview;
* Strict Privacy mode;
* AI request cache;
* token/cost preview;
* export CSV/JSON;
* n8n manual/opt-in events;
* onboarding/consent screen;
* privacy settings;
* permission request UX;
* passive status sync with HH visible state.

### Acceptance Criteria

* Пользователь может открыть вакансию, увидеть score и сохранить её.
* Пользователь может выбрать профиль.
* Пользователь может сгенерировать письмо и скопировать его.
* AI не вызывается без явного клика.
* n8n не вызывается без явного включения.
* Полный HTML не сохраняется без debug mode.
* Все данные можно удалить.
* Все данные можно экспортировать.
* AI можно использовать повторно из кэша без нового запроса.
* Strict Privacy не отправляет описание вакансии.

---

## Phase 2 — Search Triage

### Цель

Ускорить первичный отбор вакансий на странице поиска HH.

### Функции

* content script для `hh.ru/search/vacancy*`;
* extraction только из карточек выдачи;
* status badges;
* score badges;
* quick save/reject/blacklist;
* подсветка viewed/saved/applied;
* синхронизация с локальной БД;
* никаких фоновых открытий вакансий.

### Acceptance Criteria

* Бейджи не ломают интерфейс HH.
* Search page работает при динамической подгрузке.
* Расширение не делает fetch полных страниц вакансий.
* Быстрые действия меняют только локальную БД.

---

## Phase 3 — Workflow Queue

### Цель

Организовать сохранённые вакансии как pipeline, не превращая продукт в автооткликер.

### Функции

* queue как task list;
* kanban/status board;
* фильтры:

  * saved;
  * letter_ready;
  * applied;
  * interview;
  * rejected;
* открыть вакансию;
* показать письмо;
* copy;
* manual mark as applied;
* webhook after manual status change.

### Не входит

* автоматическая обработка очереди;
* “отправить все”;
* hidden tabs;
* background apply.

---

## Phase 4 — Guided Apply Labs

### Цель

Исследовать безопасную помощь в отклике без автоотправки и без программного заполнения полей HH.

### Функции

* включается отдельным toggle;
* предупреждение о рисках;
* clipboard-first approach;
* подсветить нужное поле;
* рекомендовать резюме;
* пользователь сам вставляет текст;
* пользователь сам нажимает кнопку HH.

### Acceptance Criteria

* Ни одна операция не происходит без user gesture.
* Нативная кнопка отправки HH не нажимается расширением.
* Расширение не меняет значение полей формы HH через DOM/events.
* Есть выключатель Labs.
* Есть лог действий.
* Есть лимиты и предупреждения.

---

## Phase 5 — HR Communication Hub

### Цель

Помочь обрабатывать ответы HR и follow-up.

### Функции

* анализ только открытой пользователем страницы откликов/чата;
* классификация ответа:

  * invitation;
  * rejection;
  * question;
  * test_task;
  * interview;
  * unknown;
* draft ответа;
* follow-up reminders;
* n8n/Telegram notification;
* сохранение истории в Application.

### Не входит

* автоответ HR;
* скрытое чтение переписки;
* фоновый polling.

---

## Phase 6 — Multi-site

### Цель

Расширить проект за пределы HH.

### Потенциальные сайты

* LinkedIn Jobs;
* Indeed;
* Djinni;
* Rabota.md;
* Greenhouse;
* Lever;
* Workday;
* Wellfound;
* company career pages.

### Условие

Multi-site возможен только после стабилизации `SiteAdapter`.

---

# 8. Архитектура

## 8.1. Финальный стек

Фиксируем:

```text
WXT + Manifest V3 + TypeScript + React + Dexie + IndexedDB + chrome.storage.local
```

## 8.2. Почему React, а не Solid

Solid.js технически хорош и легче, но для MVP фиксируем React, потому что:

* больше примеров для расширений;
* лучше поддерживается AI-coding инструментами;
* проще найти готовые компоненты;
* ниже риск нестандартных edge cases;
* проще онбордить будущих разработчиков.

Solid.js остаётся допустимой альтернативой только при отдельном решении до старта разработки.

## 8.3. Storage decision

* IndexedDB/Dexie — для вакансий, компаний, профилей, резюме, писем, событий.
* chrome.storage.local — для настроек, toggles, feature flags, AI provider settings.
* chrome.storage.sync — только для некритичных небольших настроек, если понадобится.
* API keys — только local, не sync.
* Для публичного продукта позже рассмотреть:

  * session-only key;
  * WebCrypto + master password;
  * backend proxy.

## 8.4. Компоненты

```text
src/
  entrypoints/
    background.ts
    content-hh-vacancy.ts
    content-hh-search.ts
    popup/
    sidepanel/
    dashboard/
    options/

  core/
    model.ts
    scoring.ts
    matching.ts
    letter-rules.ts
    privacy.ts
    status.ts
    dedupe.ts

  adapters/
    hh/
      HHAdapter.ts
      vacancy-parser.ts
      search-parser.ts
      selectors.v1.ts
      selectors.v2.ts
      json-state-extractor.ts
      fallback-dom-parser.ts
      status-sync.ts
      fixtures/

  services/
    db.ts
    migrations.ts
    ai/
      provider.ts
      openai.ts
      deepseek.ts
      openrouter.ts
      prompt-builder.ts
      prompt-templates.ts
    n8n.ts
    export.ts
    redaction.ts
    clipboard.ts

  ui/
    components/
    sidepanel/
    popup/
    dashboard/
    options/
    theme/

  tests/
    unit/
    fixtures/
    e2e/
```

## 8.5. SiteAdapter interface

```ts
type SourceSite =
  | 'hh'
  | 'linkedin'
  | 'indeed'
  | 'djinni'
  | 'rabota_md'
  | 'greenhouse'
  | 'lever'
  | 'workday';

type PageKind = 'vacancy' | 'search' | 'applications' | 'messages' | null;

interface SiteAdapter {
  siteId: SourceSite;
  matchUrl(url: string): PageKind;
  extractVacancy(doc: Document): RawVacancyDTO | null;
  extractSearchList(doc: Document): RawSearchItemDTO[];
  extractVisibleApplicationStatus?(doc: Document): Partial<ApplicationStatusSync> | null;
}
```

В MVP реализуется только `HHAdapter`.

Методы для заполнения форм не входят в Core-интерфейс. Если когда-либо появятся, они должны быть отдельным Labs-интерфейсом.

## 8.6. Data flow

```text
HH page
  ↓
Content Script
  ↓ extracts RawVacancyDTO
Background Service Worker
  ↓ validates + normalizes
Dexie / IndexedDB
  ↓
Rule-based Scoring
  ↓
Side Panel / Popup / Dashboard
  ↓ user action
AI Provider / n8n / Export
```

## 8.7. Content script rules

Content script может:

* читать DOM;
* извлекать данные;
* добавлять минимальный badge;
* открывать side panel по user click;
* отправлять сообщения background.

Content script не должен:

* кликать по кнопкам HH;
* программно отправлять формы;
* делать fetch к HH;
* обращаться к закрытым endpoint’ам;
* изменять бизнес-состояние HH.

## 8.8. UI isolation

Для UI поверх страницы использовать:

* Shadow DOM для badge/мини-панели;
* минимальные CSS-классы;
* отсутствие глобальных стилей;
* отсутствие вмешательства в React/Vue state HH.

Основной UI — в side panel и dashboard, а не в DOM HH.

## 8.9. Network boundaries

Правила сетевых запросов:

* content scripts не делают `fetch` к HH, AI или n8n;
* AI/n8n запросы выполняются через background/service layer;
* любые внешние запросы требуют явного user action или включённой пользователем настройки;
* HH network traffic не перехватывается;
* `webRequest` и `declarativeNetRequest` не используются в MVP;
* каждый внешний запрос создаёт локальный `EventLog`;
* payload preview должен формироваться до отправки, а не после.

## 8.10. WXT manifest ownership

WXT генерирует итоговый manifest. Поэтому:

* permissions фиксируются в `wxt.config.ts` и entrypoint config;
* итоговый `.output/*/manifest.json` проверяется CI;
* релизный артефакт не должен содержать permissions, которых нет в разделе 9;
* изменение manifest требует review как security-sensitive изменение.

---

# 9. Permissions

## 9.1. MVP permissions

```json
{
  "manifest_version": 3,
  "permissions": [
    "storage",
    "activeTab",
    "sidePanel"
  ],
  "optional_permissions": [
    "clipboardWrite",
    "alarms"
  ],
  "optional_host_permissions": [
    "https://api.openai.com/*",
    "https://api.deepseek.com/*",
    "https://openrouter.ai/*",
    "https://*/*"
  ],
  "host_permissions": [
    "https://hh.ru/*",
    "https://*.hh.ru/*"
  ]
}
```

`https://*/*` в `optional_host_permissions` не должен запрашиваться при установке. Он нужен только как runtime-запрос под конкретный пользовательский n8n webhook host, если браузерная модель permissions требует явного доступа для cross-origin `fetch`.

## 9.2. Запрещённые permissions в MVP

* `<all_urls>`;
* `cookies`;
* `webRequest`;
* `webRequestBlocking`;
* `nativeMessaging`;
* broad `tabs`, если можно обойтись `activeTab`.

## 9.3. Принцип permissions

Каждое permission должно иметь объяснение в onboarding.

## 9.4. Permission request UX

Правила:

* базовая установка не должна запрашивать доступ ко всем сайтам;
* доступ к HH нужен только для чтения открытых пользователем страниц HH;
* доступ к AI endpoint запрашивается только после выбора провайдера;
* доступ к n8n webhook host запрашивается только после ввода URL и нажатия test/save;
* отказ в optional permission не ломает Core, а только отключает соответствующую интеграцию;
* в настройках должен быть экран “Permissions & Data Access” с текущими выданными разрешениями и объяснением, зачем они нужны.

## 9.5. External references for implementation

Перед публичной публикацией сверить актуальные требования:

* Chrome Extensions permissions and host permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
* Chrome extension cross-origin network requests: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
* Chrome Side Panel API: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
* Chrome Web Store Limited Use policy: https://developer.chrome.com/docs/webstore/program-policies/limited-use
* WXT manifest generation: https://wxt.dev/guide/essentials/config/manifest
* HH.ru terms and public usage pages: https://hh.ru/article/23630

---

# 10. Модель данных

## 10.1. JobStatus

```ts
type JobStatus =
  | 'new'
  | 'viewed'
  | 'saved'
  | 'rejected_by_me'
  | 'letter_ready'
  | 'applied'
  | 'hr_replied'
  | 'interview'
  | 'test_task'
  | 'rejected_by_company'
  | 'offer'
  | 'blacklist';
```

## 10.2. Job

```ts
interface Job {
  id: string; // "hh_123456"
  source: 'hh';
  sourceVacancyId: string;
  sourceUrl: string;
  canonicalUrl?: string;

  title: string;
  companyId: string;
  companyName: string;

  salaryRaw?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryGross?: boolean;

  city?: string;
  workMode: 'remote' | 'hybrid' | 'office' | 'unknown';
  experienceRaw?: string;
  experienceMinYears?: number;
  employmentType?: string;
  schedule?: string;

  descriptionClean: string;
  descriptionHash: string;
  skills: string[];

  status: JobStatus;
  statusHistory: StatusChange[];

  ruleScore?: ScoreResult;
  aiAnalysis?: AIAnalysis;

  recommendedProfileIds?: string[];
  selectedProfileId?: string;
  selectedResumeId?: string;
  coverLetterId?: string;

  passiveHHStatus?: PassiveHHStatus;

  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;

  debugHtmlRedacted?: string;
}
```

## 10.3. Company

```ts
interface Company {
  id: string;
  source: 'hh';
  sourceCompanyId?: string;
  name: string;
  url?: string;
  notes?: string;
  status: 'normal' | 'greylist' | 'blacklist';
  blacklistReason?: string;
  createdAt: string;
  updatedAt: string;
}
```

## 10.4. Profile

```ts
interface Profile {
  id: string;
  name: string;
  summary: string;

  targetTitles: string[];
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  avoidKeywords: string[];

  preferredWorkModes: ('remote' | 'hybrid' | 'office')[];
  preferredCities?: string[];

  salaryExpectationMin?: number;
  salaryCurrency?: string;

  defaultResumeId?: string;
  letterPrefs: LetterPrefs;

  scoringWeights?: Partial<ScoringWeights>;

  createdAt: string;
  updatedAt: string;
}
```

## 10.5. Resume

```ts
interface Resume {
  id: string;
  profileId: string;

  title: string;
  hhResumeId?: string;
  hhResumeUrl?: string;

  highlightsText: string;
  skills: string[];
  language: 'ru' | 'en' | 'ro';

  isDefault?: boolean;

  createdAt: string;
  updatedAt: string;
}
```

## 10.6. CoverLetter

```ts
type CoverLetterMode =
  | 'tg_short'
  | 'hh_standard'
  | 'confident'
  | 'very_short'
  | 'en';

interface CoverLetter {
  id: string;
  jobId: string;
  profileId: string;
  resumeId?: string;

  mode: CoverLetterMode;

  constraints: {
    noEmoji: boolean;
    noMarkdown: boolean;
    noSpecialChars: boolean;
    maxChars?: 500 | 1000;
  };

  bodyText: string;
  isFinal: boolean;

  source: 'template' | 'ai' | 'manual_edit';
  aiProvider?: string;
  aiModel?: string;
  promptVersion?: string;

  versions: CoverLetterVersion[];

  createdAt: string;
  updatedAt: string;
}
```

## 10.7. Application

```ts
interface Application {
  id: string;
  jobId: string;
  profileId?: string;
  resumeId?: string;
  coverLetterId?: string;

  channel: 'manual' | 'guided';
  appliedAt?: string;

  status: JobStatus;
  statusHistory: StatusChange[];

  followUpAt?: string;
  notes?: string;

  createdAt: string;
  updatedAt: string;
}
```

## 10.8. EventLog

```ts
interface EventLog {
  id: string;

  type:
    | 'job_saved'
    | 'status_changed'
    | 'letter_generated'
    | 'ai_analysis_requested'
    | 'ai_analysis_completed'
    | 'application_status_saved'
    | 'strong_job_found'
    | 'daily_summary'
    | 'hr_replied';

  jobId?: string;
  applicationId?: string;

  payloadPreview: Record<string, unknown>;

  sentToN8n: boolean;
  n8nStatus?: 'pending' | 'sent' | 'failed';
  n8nError?: string;

  createdAt: string;
}
```

## 10.9. StatusChange

```ts
interface StatusChange {
  from?: JobStatus;
  to: JobStatus;
  at: string;
  source: 'user' | 'passive_hh_sync' | 'import' | 'system';
  note?: string;
}
```

## 10.10. PassiveHHStatus

```ts
interface PassiveHHStatus {
  detectedApplied?: boolean;
  detectedViewedByEmployer?: boolean;
  detectedInvitation?: boolean;
  detectedRejected?: boolean;
  rawLabel?: string;
  detectedAt: string;
}
```

## 10.11. RiskFlag

```ts
type RiskSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

interface RiskFlag {
  code:
    | 'salary_unknown'
    | 'salary_below_minimum'
    | 'work_mode_mismatch'
    | 'missing_core_skill'
    | 'agency_without_employer'
    | 'unpaid_test_task_risk'
    | 'vague_description'
    | 'low_signal'
    | 'company_blacklist'
    | 'duplicate_vacancy'
    | 'suspicious_wording'
    | 'relocation_required'
    | 'schedule_mismatch';
  severity: RiskSeverity;
  message: string;
  evidence?: string;
}
```

## 10.12. AIAnalysis

```ts
interface AIAnalysis {
  id: string;
  jobId: string;
  profileId: string;
  resumeId?: string;

  provider: 'openai' | 'deepseek' | 'openrouter';
  model: string;
  promptVersion: string;
  inputHash: string;

  fitScore: number;
  recommendation: 'apply' | 'consider' | 'skip';
  confidence: 'low' | 'medium' | 'high';

  fitReasons: string[];
  riskFlags: RiskFlag[];
  missingSkills: string[];
  questionsForHR: string[];
  suggestedProfileId?: string;
  suggestedResumeId?: string;

  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
  };

  createdAt: string;
}
```

## 10.13. Settings

```ts
interface AppSettings {
  schemaVersion: number;

  general: {
    defaultProfileId?: string;
    language: 'ru' | 'en';
    theme: 'system' | 'light' | 'dark';
    showPageBadge: boolean;
    searchHighlightsEnabled: boolean;
    searchHighlightsShowViewed: boolean;
    searchHighlightsShowSavedRejected: boolean;
    searchHighlightsShowScore: boolean;
    searchHighlightsShowViewCount: boolean;
    rejectedSearchCardBehavior: 'dim' | 'hide' | 'none';
    autosaveViewedJobs: boolean;
  };

  privacy: {
    aiEnabled: boolean;
    n8nEnabled: boolean;
    strictPrivacyMode: boolean;
    showPayloadPreviewAlways: boolean;
    allowResumeHighlightsToAI: boolean;
    allowFullDescriptionToAI: boolean;
    redactContacts: boolean;
    debugHtmlMode: boolean;
    dataRetentionDays?: number;
  };

  ai: {
    provider?: 'openai' | 'deepseek' | 'openrouter';
    model?: string;
    dailyRequestLimit: number;
    maxInputChars: number;
    enableStreaming: boolean;
    enableCache: boolean;
  };

  n8n: {
    enabled: boolean;
    webhookUrl?: string;
    hmacSecretSet: boolean;
    enabledEvents: string[];
    dailyEventLimit: number;
  };

  labs: {
    enabled: boolean;
    guidedApplyEnabled: boolean;
    killSwitchEnabled: boolean;
    dailyActionLimit: number;
  };
}
```

## 10.14. AIRequestCache

```ts
interface AIRequestCache {
  id: string;
  kind: 'vacancy_analysis' | 'cover_letter';
  inputHash: string;
  provider: string;
  model: string;
  promptVersion: string;
  resultRefId: string;
  createdAt: string;
  expiresAt?: string;
}
```

Кэш используется только если не изменились:

* вакансия: `sourceVacancyId`, `descriptionHash`, skills;
* профиль: `profileId`, `updatedAt`;
* резюме: `resumeId`, `updatedAt`;
* prompt version;
* provider/model;
* privacy mode.

## 10.15. Dexie schema and migrations

Схема IndexedDB должна версионироваться с первого дня.

Минимальные таблицы:

```ts
db.version(1).stores({
  jobs: '&id, source, sourceVacancyId, companyId, status, selectedProfileId, firstSeenAt, updatedAt, descriptionHash',
  companies: '&id, sourceCompanyId, name, status, updatedAt',
  profiles: '&id, name, updatedAt',
  resumes: '&id, profileId, hhResumeId, updatedAt',
  coverLetters: '&id, jobId, profileId, resumeId, isFinal, updatedAt',
  applications: '&id, jobId, status, appliedAt, updatedAt',
  events: '&id, type, jobId, createdAt, sentToN8n, n8nStatus',
  aiCache: '&id, inputHash, kind, provider, model, promptVersion, createdAt',
  meta: '&key'
});
```

Правила миграций:

* каждое изменение модели данных требует `db.version(n).upgrade(...)`;
* миграция не должна удалять пользовательские данные без явного backup/export;
* перед destructive migration показывать предупреждение и предлагать JSON export;
* schema version хранится в `meta`;
* тесты миграций обязательны для переходов `v1 -> latest`.

---

# 11. Scoring model

## 11.1. Общий принцип

Rule-based score должен быть:

* быстрым;
* объяснимым;
* локальным;
* работающим без AI;
* настраиваемым по профилям;
* устойчивым к отсутствующим данным.

## 11.2. Веса по умолчанию

```ts
interface ScoringWeights {
  titleMatch: number;        // 20
  mustHaveSkills: number;    // 25
  niceToHaveSkills: number;  // 10
  experienceFit: number;     // 15
  workModeLocation: number;  // 10
  salaryFit: number;         // 10
  companyPreference: number; // 5
  languageScheduleMisc: number; // 5
}
```

Сумма: 100.

## 11.3. Компоненты

### Title / role match — 20

Оценивает совпадение названия вакансии с target titles профиля.

Примеры:

* AI Engineer;
* LLM Engineer;
* AI Automation Engineer;
* CRM Manager;
* Systems Analyst;
* Technical Project Manager;
* Integration Engineer.

### Must-have skills — 25

Оценивает пересечение mustHaveSkills профиля с skills и descriptionClean вакансии.

### Nice-to-have skills — 10

Оценивает дополнительные совпадения.

### Experience fit — 15

Сравнивает experienceMinYears вакансии и опыт профиля.

Если опыт не распарсен, даёт нейтральное значение.

### Work mode / location — 10

Оценивает:

* remote;
* hybrid;
* office;
* city;
* country;
* timezone.

### Salary / conditions — 10

Оценивает зарплату, если указана.

Если зарплата не указана, не наказывает сильно, но добавляет risk flag `salary_unknown`.

### Company preference — 5

Оценивает:

* blacklist;
* greylist;
* previous interactions;
* notes.

### Language / schedule / misc — 5

Оценивает:

* язык вакансии;
* schedule;
* relocation;
* business hours;
* timezone;
* employment type.

## 11.4. Penalties и caps

```ts
interface ScoreCap {
  reason: string;
  maxScore: number;
}
```

Правила:

* company blacklist → recommendation `skip`, maxScore 40;
* critical work mode mismatch → maxScore 65;
* missing core must-have skill → maxScore 70;
* salary below hard minimum → penalty 10–25;
* suspicious wording → penalty 10–30;
* unpaid test work risk → risk flag;
* duplicate vacancy → risk flag;
* agency without employer name → risk flag;
* vague description → penalty 5–15.

## 11.5. Buckets

```text
85–100: strong, если нет critical risks
70–84: good / consider
50–69: weak / consider only if interesting
0–49: skip
critical risk: skip regardless of score
```

## 11.6. Strong vacancy threshold

Default: 85.

Но:

* threshold должен быть настраиваемым;
* первые 30–50 вакансий — calibration mode;
* n8n strong vacancy alerts не включаются автоматически до калибровки;
* пользователь может менять веса per profile.

## 11.7. ScoreResult

```ts
interface ScoreResult {
  total: number;
  recommendation: 'apply' | 'consider' | 'skip';

  breakdown: {
    titleMatch: number;
    mustHaveSkills: number;
    niceToHaveSkills: number;
    experienceFit: number;
    workModeLocation: number;
    salaryFit: number;
    companyPreference: number;
    languageScheduleMisc: number;
  };

  fitReasons: string[];
  riskFlags: RiskFlag[];
  capsApplied?: ScoreCap[];
}
```

---

# 12. AI module

## 12.1. AI providers

MVP provider strategy:

* сделать интерфейс `LLMProvider`;
* реализовать 1 основной провайдер первым;
* затем добавить OpenAI / DeepSeek / OpenRouter.

```ts
interface LLMProvider {
  id: 'openai' | 'deepseek' | 'openrouter';
  analyzeVacancy(input: VacancyAnalysisInput): Promise<AIAnalysis>;
  generateCoverLetter(input: CoverLetterInput): Promise<string>;
}
```

## 12.2. BYOK

Пользователь сам вводит API key.

В onboarding/settings нужно явно указать:

* ключ хранится локально;
* это не secure vault;
* не рекомендуется использовать ключ с большим лимитом;
* можно удалить ключ;
* можно работать без AI;
* для публичной версии позже возможен backend proxy.

## 12.3. AI data minimization

AI получает только:

* cleaned vacancy text;
* structured job fields;
* selected profile summary;
* selected resume highlights, если пользователь разрешил;
* letter constraints.

AI не получает по умолчанию:

* полный HTML;
* cookies;
* личные заметки;
* всю историю откликов;
* весь текст всех резюме;
* переписку;
* данные других вакансий.

## 12.4. Payload preview

Перед AI-запросом показывать:

```text
Будет отправлено:
- title
- company
- salaryRaw
- city
- workMode
- skills
- descriptionClean truncated
- selectedProfile.summary
- selectedProfile.mustHaveSkills
- selectedResume.highlightsText, если включено

Не будет отправлено:
- полный HTML
- cookies
- личные заметки
- вся база вакансий
- история переписки
```

## 12.5. Prompt: Vacancy Analysis

```text
System:
Ты карьерный аналитик и job matching assistant.
Используй только предоставленные данные.
Не выдумывай факты.
Верни строго валидный JSON без markdown.

User:
Проанализируй вакансию относительно профиля кандидата.

Candidate profile:
{{profile_json}}

Resume highlights:
{{resume_highlights_optional}}

Vacancy:
{
  "title": "{{title}}",
  "company": "{{company}}",
  "salary": "{{salaryRaw}}",
  "city": "{{city}}",
  "workMode": "{{workMode}}",
  "experience": "{{experienceRaw}}",
  "skills": {{skills}},
  "description": "{{descriptionClean_truncated}}"
}

Return JSON:
{
  "fitScore": 0,
  "recommendation": "apply|consider|skip",
  "fitReasons": ["..."],
  "riskFlags": ["..."],
  "missingSkills": ["..."],
  "suggestedProfileId": "...",
  "suggestedResumeId": "...",
  "questionsForHR": ["..."]
}
```

## 12.6. Prompt: Cover Letter

```text
System:
Ты пишешь сопроводительные письма для HH.ru.
Пиши от лица кандидата.
Не выдумывай факты.
Не используй markdown, если включено noMarkdown.
Не используй emoji, если включено noEmoji.
Избегай нестандартных символов, если включено noSpecialChars.
Соблюдай лимит символов.
Верни только текст письма.

User:
Вакансия:
- Title: {{title}}
- Company: {{company}}
- Requirements: {{topRequirements}}
- Skills: {{skills}}

Профиль кандидата:
{{profile.summary}}

Релевантные достижения:
{{resume.highlightsText}}

Режим письма:
{{mode}}

Ограничения:
{{constraints}}

Язык:
{{language}}

Напиши сопроводительное письмо.
```

## 12.7. AI output validation

Для AI analysis:

* JSON parse;
* schema validation;
* fallback при ошибке;
* сохранение raw response только debug;
* retry вручную, не автоматически бесконечно.

Для письма:

* длина;
* запрещённые символы;
* no markdown;
* no emoji;
* no unsupported formatting;
* warning, если AI выдумал facts.

## 12.8. AI cache

AI-запросы не должны повторяться без необходимости.

Правила:

* перед анализом вакансии считать `inputHash`;
* если найден валидный cache hit, показать пользователю сохранённый результат и кнопку “Перегенерировать”;
* изменение локального статуса вакансии не инвалидирует AI-анализ;
* изменение описания вакансии, профиля, резюме, prompt version, provider/model или privacy mode инвалидирует кэш;
* кэш должен быть отключаемым в настройках;
* raw AI response хранить только в debug mode.

## 12.9. Token and cost preview

Перед AI-вызовом показывать:

* провайдер;
* модель;
* примерный размер input;
* приблизительную стоимость, если известны тарифы модели;
* дневной лимит запросов;
* что будет отправлено;
* что не будет отправлено.

Если стоимость неизвестна, UI должен честно показывать “стоимость не рассчитана”, а не скрывать этот факт.

## 12.10. Privacy modes

Поддержать два режима:

### Standard Privacy

Отправляет в AI очищенное описание вакансии, структурированные поля, summary профиля и разрешённые highlights резюме.

### Strict Privacy

Отправляет только:

* title;
* company, опционально;
* salaryRaw;
* city/workMode;
* skills;
* краткое summary профиля;
* mustHave/niceToHave skills.

В Strict Privacy не отправлять полный `descriptionClean` и highlights резюме, если пользователь не включил это точечно для конкретного запроса.

## 12.11. Streaming

Для генерации сопроводительного письма желательно поддержать streaming response, если выбранный провайдер это позволяет.

Требования:

* UI показывает частичный текст по мере генерации;
* пользователь может остановить генерацию;
* незавершённый текст не помечается как final;
* fallback на non-streaming обязателен.

---

# 13. Cover Letter Studio

## 13.1. Роль модуля

Cover Letter Studio — одна из главных hero features продукта.

## 13.2. Режимы

* `tg_short` — короткий Telegram-style;
* `hh_standard` — стандартное письмо для HH;
* `confident` — уверенный стиль;
* `very_short` — очень кратко;
* `en` — английская версия.

## 13.3. Ограничения

* no emoji;
* no markdown;
* no special chars;
* max 500 chars;
* max 1000 chars;
* plain text only.

## 13.4. Библиотека писем

Хранить:

* draft;
* final;
* used;
* mode;
* profile;
* job;
* response outcome later.

## 13.5. Future quality checks

Backlog:

* similarity check;
* “слишком шаблонно”;
* “слишком длинно”;
* “мало конкретики”;
* A/B test;
* response rate по письмам;
* best letter suggestions.

---

# 14. n8n / Telegram integration

## 14.1. Принцип

n8n — opt-in.

По умолчанию выключено.

Пользователь сам вводит webhook URL.

## 14.2. MVP events

В Phase 1 разрешены:

* `job_saved`;
* `status_changed`;
* `application_status_saved`;
* `strong_job_found`, только после включения и настройки threshold.

Не включать автоматически:

* `hr_replied`;
* chat messages;
* full vacancy text;
* full cover letter;
* resume text.

## 14.3. Payload preview

Перед включением webhook пользователь видит пример JSON.

## 14.4. Webhook security

* только HTTPS URL;
* test button;
* optional HMAC secret;
* подпись payload в header `X-VacancyPilot-Signature`;
* redaction;
* local rate limit;
* retry queue с exponential backoff;
* event log;
* возможность отключить.

## 14.5. Retry policy

Если n8n временно недоступен:

* событие сохраняется как `pending`;
* первая повторная попытка не раньше чем через 1 минуту;
* затем backoff: 5 минут, 15 минут, 1 час, 6 часов;
* после лимита попыток событие получает `failed`;
* пользователь видит ошибку в Events/Settings;
* повторная отправка доступна вручную;
* события не должны отправляться бесконечным циклом.

## 14.6. Example payload

```json
{
  "event": "strong_job_found",
  "source": "hh",
  "jobId": "hh_123456",
  "title": "AI Automation Engineer",
  "company": "Example Company",
  "score": 88,
  "status": "saved",
  "url": "https://hh.ru/vacancy/123456",
  "createdAt": "2026-06-19T12:00:00Z"
}
```

---

# 15. Passive status sync

## 15.1. Зачем нужно

Пользователь может вручную откликнуться на HH без участия расширения.

Локальный статус может устареть.

## 15.2. Что делаем

При открытии вакансии расширение читает видимые элементы страницы:

* “Вы откликались”;
* “Резюме просмотрено”;
* “Приглашение”;
* “Отказ”;
* другие видимые статусы.

## 15.3. Что не делаем

* не лезем в закрытые API;
* не читаем фоновые страницы;
* не делаем polling;
* не открываем “Мои отклики” без пользователя.

## 15.4. UX

Если статус на HH отличается от локального:

```text
HH показывает: Вы откликались.
Локально статус: saved.

Обновить локальный статус на applied?
[Обновить] [Оставить как есть]
```

---

# 16. Parser resilience

## 16.1. Главный риск

HH может менять DOM, A/B тесты, классы, структуру страниц.

## 16.2. Требования

* parser layer отдельно от UI;
* чистые функции;
* versioned selectors;
* fallback selectors;
* JSON state extraction как предпочтительный источник, если на странице есть безопасный structured state;
* DOM extraction как fallback;
* DOM fixtures;
* unit tests;
* graceful degradation.

Порядок извлечения:

1. Безопасный structured state страницы, если доступен без закрытых endpoint’ов.
2. Семантические DOM-атрибуты и стабильные data-атрибуты.
3. Fallback selectors.
4. Ручное редактирование пользователем, если поле не распознано.

## 16.3. Fallback behavior

Если парсер не смог извлечь поле:

* UI показывает warning;
* остальные поля сохраняются;
* пользователь может вручную отредактировать;
* парсер не падает;
* ошибка пишется в debug log.

## 16.4. Fixtures

Собирать HTML/DOM snippets для:

* обычная вакансия;
* вакансия без зарплаты;
* удалённая вакансия;
* офисная вакансия;
* вакансия с навыками;
* вакансия без навыков;
* архивная вакансия;
* вакансия с “Вы откликались”;
* вакансия с приглашением;
* поисковая карточка;
* поисковая карточка с зарплатой;
* поисковая карточка без зарплаты.

## 16.5. Fixture maintenance

Правила поддержки:

* фикстуры должны быть анонимизированы;
* обновление фикстур не должно сохранять cookies, токены, имя пользователя, email, телефон;
* каждое изменение парсера прогоняется на всех fixtures;
* при падении 3+ свежих разборов подряд показывать debug warning;
* перед релизом Phase 1 собрать минимум 50 vacancy fixtures;
* перед релизом Phase 2 собрать минимум 20 search card fixtures;
* раз в 2–4 недели делать ручной re-snapshot актуальной HH-разметки.

---

# 17. UI / UX

## 17.1. Content badge

На странице вакансии:

```text
[VP 86] [saved]
```

Клик открывает side panel.

Правила:

* маленький;
* не мешает HH;
* не перекрывает кнопки;
* без тяжёлого UI;
* Shadow DOM.

## 17.2. Side panel

Главный workspace.

Вкладки:

1. Overview
   Вакансия, компания, зарплата, формат, статус.

2. Score
   Score breakdown, fit reasons, risks.

3. Letter
   Генерация, редактирование, copy, save final.

4. Profile
   Selected profile, recommended profile, resume.

5. History
   Status history, events, notes.

## 17.3. Popup

Минимальный быстрый доступ:

* page detected / not detected;
* current score;
* current status;
* save;
* reject;
* open side panel;
* open dashboard.

## 17.4. Dashboard

Разделы:

* Vacancies;
* Applications;
* Companies;
* Profiles;
* Resumes;
* Letters;
* Events;
* Export;
* Settings;
* Privacy;
* Debug.

## 17.5. Dashboard table columns

* date;
* status;
* score;
* company;
* title;
* salary;
* work mode;
* profile;
* resume;
* letter;
* appliedAt;
* lastUpdated;
* sourceUrl;
* notes.

## 17.6. Search badges, Phase 2

На карточке поиска:

```text
[86] [remote] [new] [save] [reject]
```

Не должно быть:

* тяжёлых React-компонентов в каждой карточке;
* фонового fetch;
* массового анализа полного текста.

## 17.7. UI states

Каждый ключевой экран должен иметь состояния:

* loading;
* empty;
* parsed with warnings;
* offline/no network для AI/n8n;
* AI provider error;
* permission denied;
* parser failed gracefully;
* export success/error;
* delete confirmation.

## 17.8. Accessibility and keyboard

Минимальные требования:

* все интерактивные элементы доступны с клавиатуры;
* видимый focus state;
* кнопки имеют понятные labels/tooltips;
* цвет score/risk не является единственным способом передачи смысла;
* side panel не требует hover-only действий;
* таблицы dashboard имеют сортировку и понятные заголовки;
* текст в badge не перекрывает элементы HH и не ломается на узкой ширине.

## 17.9. Error boundaries

React UI должен иметь error boundary для side panel, popup и dashboard.

Если UI падает:

* не ломать страницу HH;
* показать компактную ошибку;
* предложить reload UI;
* сохранить технический error log локально;
* не отправлять ошибку разработчику без opt-in telemetry.

---

# 18. Onboarding

## 18.1. Первый запуск

Показать:

1. Что делает расширение.
2. Что не делает расширение.
3. Какие permissions нужны.
4. Где хранятся данные.
5. Как работает AI.
6. Как работает n8n.
7. Как удалить данные.
8. Что API keys хранятся локально и не являются secure vault.
9. Что Core не отправляет отклики и не заполняет формы HH.
10. Что Labs выключены и не нужны для MVP.

## 18.2. Setup steps

* создать первый профиль;
* добавить ключевые навыки;
* добавить краткое summary;
* добавить предпочтения:

  * remote/hybrid/office;
  * города;
  * зарплата;
  * роли;
* выбрать AI provider, опционально;
* настроить n8n, опционально.

---

# 19. Settings

## 19.1. General

* default profile;
* theme;
* language;
* autosave viewed jobs;
* show page badge;
* open side panel automatically.

## 19.2. Scoring

* weights;
* strong threshold;
* calibration mode;
* stop words;
* risk words;
* blacklist companies.

## 19.3. AI

* provider;
* API key;
* model;
* max tokens;
* daily request limit;
* show payload preview;
* prompt templates.

## 19.4. n8n

* webhook URL;
* HMAC secret;
* enabled events;
* payload fields;
* test webhook;
* retry settings.

## 19.5. Privacy

* AI enabled;
* n8n enabled;
* send resume highlights;
* send full description;
* strict privacy mode;
* payload preview always;
* redact contacts;
* debug HTML mode;
* data retention;
* delete all data;
* export all data.

## 19.6. Permissions

* список активных permissions;
* объяснение каждого permission;
* запрос optional AI provider host;
* запрос optional n8n host;
* статус granted/denied;
* инструкция, как отозвать доступ через browser extension settings.

## 19.7. Labs and kill switch

* Labs master toggle;
* guided apply toggle;
* daily action limit;
* предупреждение о рисках;
* kill switch “disable all Labs features”;
* local Labs action log;
* Labs по умолчанию выключены после установки и после major update.

---

# 20. Security & Privacy

## 20.1. Data storage

Local-first.

Данные пользователя находятся в браузере.

## 20.2. API keys

* хранить только локально;
* не sync;
* показывать предупреждение;
* allow delete;
* later: WebCrypto/master password.

Запрещено:

* хранить API keys в IndexedDB вместе с бизнес-данными;
* отправлять API keys в n8n;
* логировать API keys;
* показывать ключ целиком после сохранения;
* обещать “полное шифрование”, если используется только `chrome.storage.local`.

## 20.3. Redaction

Перед AI/n8n:

* убрать email;
* убрать телефон;
* убрать лишние URL;
* убрать cookies/tokens;
* убрать hidden metadata;
* убрать полный HTML.

## 20.4. Debug mode

Debug mode:

* выключен по умолчанию;
* требует подтверждения;
* сохраняет только redacted HTML;
* можно очистить debug storage.

## 20.5. No telemetry

По умолчанию расширение не отправляет данные разработчику.

Если позже добавляется telemetry:

* opt-in;
* ясно описать;
* минимальные технические события;
* без вакансий/резюме/писем.

## 20.6. Data retention

По умолчанию данные хранятся локально бессрочно, пока пользователь сам не удалит их.

Пользователь должен иметь:

* delete one job;
* delete company history;
* delete AI cache;
* delete debug logs;
* delete n8n event log;
* delete all data;
* export before delete.

Если будет добавлен auto-retention:

* он выключен по умолчанию;
* срок хранения настраивается;
* удаление не затрагивает final cover letters без отдельного согласия.

## 20.7. User data policy for public release

Для публичного релиза нужны:

* privacy policy;
* понятное описание user-facing features;
* раскрытие, какие данные читаются со страниц HH;
* раскрытие, какие данные отправляются AI/n8n;
* объяснение BYOK;
* описание delete/export;
* отсутствие передачи browsing/job data для рекламы, перепродажи или скрытой аналитики.

## 20.8. CSP and remote code

Запрещено:

* remote code execution;
* загрузка JS с CDN в runtime;
* `eval`;
* inline script, если его можно избежать;
* remote UI bundles.

Все UI bundles должны поставляться внутри расширения.

---

# 21. Экспорт и импорт

## 21.1. Export CSV

Поля:

* id;
* source;
* sourceVacancyId;
* title;
* company;
* salaryRaw;
* salaryMin;
* salaryMax;
* currency;
* city;
* workMode;
* status;
* score;
* recommendation;
* selectedProfile;
* selectedResume;
* hasCoverLetter;
* appliedAt;
* firstSeenAt;
* lastUpdated;
* sourceUrl;
* notes.

## 21.2. Export JSON

Полный структурированный export:

* jobs;
* companies;
* profiles;
* resumes;
* coverLetters;
* applications;
* events;
* settings without secrets.

## 21.3. Import

Backlog.

---

# 22. Testing Plan

## 22.1. Unit tests

* parser;
* salary parser;
* experience parser;
* skill extraction;
* scoring;
* redaction;
* prompt builder;
* n8n payload builder;
* CSV export.
* AI cache key/inputHash;
* settings migration;
* permission decision helpers.

## 22.2. Fixture tests

* 50+ vacancy fixtures;
* 20+ search card fixtures;
* passive status fixtures;
* archived vacancy fixture;
* no salary fixture.

## 22.3. E2E tests

Playwright with mocked HH pages.

Scenarios:

* open vacancy;
* extract data;
* save job;
* change status;
* generate score;
* open side panel;
* export CSV;
* AI mock response;
* n8n mock response.
* optional permission denied;
* parser warning fallback;
* delete all data.

## 22.4. Manual tests

* Chrome;
* Edge;
* Brave;
* Яндекс Браузер;
* logged-in HH;
* logged-out HH;
* вакансии с зарплатой;
* без зарплаты;
* remote;
* office;
* archived;
* already applied.

## 22.5. Regression tests

Каждое изменение парсера должно прогоняться на fixtures.

## 22.6. Privacy and safety tests

Обязательные проверки перед Phase 1 release:

* AI payload не содержит cookies/tokens;
* AI payload не содержит debugHtml;
* Strict Privacy не отправляет `descriptionClean`;
* n8n payload не содержит full cover letter и resume text в MVP;
* API key не попадает в IndexedDB export;
* delete all очищает jobs/profiles/resumes/letters/events/cache/settings, кроме явно оставленных browser permissions;
* content script не вызывает `fetch` к HH;
* расширение не вызывает `.click()` по элементам HH;
* расширение не меняет `.value` у полей HH;
* permission denied показывает понятное состояние.

## 22.7. CI release gate

Минимальный CI:

```text
typecheck
lint
unit tests
fixture parser tests
build extension
package artifact
```

Релиз запрещён, если:

* падает typecheck;
* падают parser fixtures;
* есть незакрытый P0/P1 security bug;
* нет актуального export/delete smoke test;
* manifest содержит запрещённые permissions.

---

# 23. Acceptance Criteria v1.1 FINAL

## 23.1. Functional

* Расширение распознаёт страницу вакансии HH.
* Извлекает основные поля.
* Сохраняет вакансию локально.
* Показывает score.
* Показывает fit/risk.
* Позволяет выбрать профиль.
* Позволяет запустить AI-анализ по кнопке.
* Позволяет сгенерировать и сохранить письмо.
* Позволяет экспортировать CSV/JSON.
* Позволяет удалить все данные.
* n8n работает только при включении.

## 23.2. Safety

* Нет автоотправки.
* Нет автокликов.
* Нет auto-fill.
* Нет hidden fetch HH.
* Нет synthetic DOM events для полей HH.
* Labs выключены по умолчанию.
* Kill switch отключает все Labs-функции.
* Нет сохранения HTML по умолчанию.
* Нет телеметрии разработчику.

## 23.3. Privacy

* Есть onboarding.
* Есть payload preview.
* Есть redaction.
* Есть Strict Privacy.
* Есть AI cache controls.
* Есть token/cost preview, если провайдер позволяет оценить стоимость.
* Есть delete all.
* Есть export all.
* API key не sync.
* API key не попадает в export.

## 23.4. Technical

* WXT + MV3 + TS;
* React UI;
* Dexie schema;
* Dexie migrations;
* typed models;
* tests;
* parser fixtures;
* CI test command.
* minimal permissions;
* optional host permissions для AI/n8n;
* error boundaries.

## 23.5. Release readiness

Phase 1 считается готовой, если:

* 50+ vacancy fixtures проходят parser tests;
* manual QA пройден в Chrome и минимум одном дополнительном Chromium-браузере;
* AI можно полностью отключить;
* n8n можно полностью отключить;
* экспорт CSV/JSON работает;
* delete all работает;
* onboarding объясняет permissions, storage, AI, n8n и non-goals;
* README/install guide описывает local/private установку;
* для public release подготовлены privacy policy и store permission justification.

## 23.6. Definition of done for any feature

Фича считается завершённой только если:

* есть UI для success/error/empty/loading;
* данные типизированы;
* ошибки не ломают страницу HH;
* нет незадокументированного внешнего запроса;
* есть тесты на основной happy path и минимум один failure path;
* privacy impact понятен и отражён в payload preview/settings, если данные уходят наружу.

---

# 24. Backlog Ledger

## 24.1. Принять в Core

* vacancy page parser;
* local tracker;
* rule-based score;
* profile manager v1;
* cover letter studio;
* AI by button;
* payload preview;
* n8n opt-in;
* CSV/JSON export;
* passive status sync;
* parser fixtures;
* redaction;
* AI cache;
* Strict Privacy;
* Dexie migrations;
* permission request UX;
* error boundaries;
* non-goals;
* Core/Labs split.

## 24.2. Phase 2

* search badges;
* search quick actions;
* local queue as task list;
* stronger dashboard;
* company greylist;
* duplicate detection.

## 24.3. Phase 3+

* clipboard-only guided apply;
* field highlighting without DOM value mutation;
* resume recommendation with hhResumeId;
* kanban queue;
* daily summaries;
* follow-up reminders;
* HR communication hub.

## 24.4. Later

* multi-site;
* backend sync;
* encrypted key storage;
* team mode;
* monetization;
* public Chrome Web Store release;
* Firefox/Edge store packaging;
* mobile browser support;
* employer reviews intelligence.

## 24.5. Reject / Do not implement

* full auto-apply;
* stealth automation;
* CAPTCHA bypass;
* IP rotation;
* closed HH API usage;
* hidden scraping;
* auto-submit;
* auto-click;
* programmatic form fill in Core;
* synthetic DOM events for HH forms;
* full telemetry;
* unredacted HTML capture.

---

# 25. Development roadmap for one developer

## Sprint 0 — Setup

Duration: 3–5 days.

Tasks:

* WXT scaffold;
* TypeScript config;
* React;
* Dexie;
* Dexie version(1) schema;
* basic manifest;
* permissions;
* model.ts;
* db.ts;
* migrations.ts;
* simple popup.

Deliverable: installable extension skeleton.

## Sprint 1 — HH vacancy parser

Duration: 1 week.

Tasks:

* HHAdapter;
* vacancy parser;
* selectors;
* JSON state extractor;
* fallback DOM parser;
* fixture collector;
* unit tests.

Deliverable: stable extraction from 50 vacancies.

## Sprint 2 — Local tracker + statuses

Duration: 1 week.

Tasks:

* save job;
* update status;
* status history;
* company entity;
* basic dashboard table;
* export JSON.

Deliverable: local job tracker.

## Sprint 3 — Scoring

Duration: 1 week.

Tasks:

* Profile v1;
* scoring engine;
* score breakdown;
* fit/risk reasons;
* settings for threshold;
* side panel score UI.

Deliverable: decision assistant without AI.

## Sprint 4 — AI + payload preview

Duration: 1 week.

Tasks:

* AI provider interface;
* one provider implementation;
* settings for key;
* payload preview;
* token/cost preview;
* Strict Privacy;
* AI cache;
* redaction;
* AI analysis prompt;
* validation.

Deliverable: AI-analysis by button.

## Sprint 5 — Cover Letter Studio

Duration: 1 week.

Tasks:

* templates;
* modes;
* constraints;
* AI generation;
* edit/save/copy;
* letter library v1.

Deliverable: usable cover letter workflow.

## Sprint 6 — Export + n8n + release hardening

Duration: 1 week.

Tasks:

* CSV export;
* n8n webhook;
* HMAC optional;
* retry/backoff;
* test button;
* delete all;
* onboarding;
* permission request UX;
* privacy checklist;
* manual QA.

Deliverable: Phase 1 release.

---

# 26. Open decisions before implementation

## 26.1. Product name

Current:

* internal: CareerSignal HH Copilot;
* public candidate: VacancyPilot.

Before public release check:

* Chrome Web Store;
* domain;
* GitHub;
* trademarks;
* existing job-tech products.

## 26.2. First AI provider

Options:

* OpenAI;
* DeepSeek;
* OpenRouter.

Recommendation:

* implement provider interface first;
* start with OpenRouter or OpenAI for flexibility;
* add DeepSeek next.

## 26.3. React vs Solid

This ТЗ fixes React.

If developer strongly prefers Solid, decision must be changed before coding starts, not mid-project.

## 26.4. Public vs personal release

MVP can be personal/private.

Public release requires:

* privacy policy;
* store description;
* permissions justification;
* logo/name check;
* support page;
* no misleading claims.

## 26.5. n8n permission model

Перед реализацией n8n нужно проверить фактическое поведение целевых Chromium-браузеров:

* нужен ли runtime-запрос `optional_host_permissions` для пользовательского webhook host;
* достаточно ли CORS на стороне webhook;
* как это повлияет на Chrome Web Store review;
* нужен ли ограниченный список доверенных webhook domains для публичного релиза.

Решение должно быть принято до Sprint 6.

## 26.6. API key protection level

Для личного MVP допустимо `chrome.storage.local` с явным предупреждением.

Для публичного релиза выбрать один из вариантов:

* оставить BYOK local с предупреждением и лимитами;
* session-only key без сохранения;
* WebCrypto + master password;
* backend proxy с отдельной privacy/security моделью.

---

# 27. Final Recommendation

The strongest version of the project is not an auto-apply extension.

The strongest version is:

> a local-first job intelligence layer over HH.ru that helps the candidate make better decisions, write better letters, and track every step without risking the account.

First release should be:

```text
Read & Assist MVP:
open vacancy → extract → score → save → AI if needed → letter → copy → track → export
```

Everything else is later.

The project should win by:

* safety;
* clarity;
* privacy;
* quality of replies;
* local ownership of data;
* explainable scoring;
* strong letter generation;
* disciplined roadmap.

If Phase 1 is polished, the product is already valuable. Search badges, queue, HR hub and multi-site support can be added later without compromising the foundation.
