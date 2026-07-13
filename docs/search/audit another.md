**Executive summary.**
CareerSignal HH Copilot — сильная концепция user-controlled Job Search Copilot, которая избегает типичных ошибок спам-ботов. Она фокусируется на ценности для кандидата (релевантность, качество писем, трекинг), privacy-first подходе и local-first хранении. Главные риски: ToS HH.ru (запрет на автоматизацию, парсинг, симуляцию действий), антибот-защита, Manifest V3 ограничения и потенциальный бан аккаунта. MVP-1 можно сделать безопасно и быстро (2–4 недели для одного dev), если строго придерживаться read-only + ручных действий пользователя. Улучшенная стратегия — начинать ещё консервативнее, с максимальной пользой без любых авто-действий на HH.

**Что в концепции сильное.**
- User-controlled + полуавто вместо full-auto: снижает риски банов и повышает качество откликов.
- Local-first (IndexedDB/Dexie + chrome.storage) + экспорт + n8n webhook: отличная privacy и гибкость.
- BYOK AI + rule-based fallback: минимизирует costs и работает offline.
- Много профилей кандидата + шаблоны писем с адаптацией: реальная ценность.
- Гибридный scoring + badges в выдаче (MVP-2): мощный UX для быстрого скрининга.
- WXT + MV3 + TS + Solid.js/React: современный, удобный стек.
- Фокус на HH.ru сначала: правильный приоритет.

**Что в концепции опасно или спорно.**
- Полуавтоматический отклик и подстановка текста в форму (MVP-3): HH.ru ToS явно запрещает парсинг, автоматизацию, плагины, симуляцию пользователя. Даже content script injection + fill может быть расценен как нарушение.
- Очередь + обработка по одной (MVP-4): риск rate-limiting и паттернов поведения.
- Сохранение полного HTML: только debug, иначе storage бloat и privacy issues.
- Отправка событий в n8n без rate-limit/user consent per event.
- Нет explicit fallback на "без AI" во всех flows.
- Слишком много MVP-этапов сразу — размывает фокус.
- Отсутствие explicit "Do Not Track / Read-only mode".

**Исправленная стратегия.**
Сделать **"Smart Assistant, не Bot"**. Всё, что касается взаимодействия с HH (отклик, fill формы) — только manual или copy-paste по кнопке. Расширение даёт insights, готовит контент, трекает, но пользователь копирует/вставляет сам. Это максимально безопасно и юридически чисто. В V2 добавить optional "safe automation" только после user consent и с предупреждениями. Приоритет: качество > скорость > automation. Монетизация позже (premium profiles, advanced AI, sync).

**MVP scope (исправленный).**

**MVP-1 (Core Value — 2–3 недели):**
- Анализ страницы вакансии (title, company, salary, location, experience, description, skills, url, vacancy_id).
- Локальное сохранение (Job entity).
- Статусы (new, viewed, saved, rejected_by_me, letter_ready, applied, etc.).
- Rule-based score + AI-анализ по кнопке (рекомендация + fit/risks).
- Рекомендация профиля.
- Генерация/редактирование cover letter (шаблоны + AI).
- Сохранение письма, экспорт CSV/JSON всей базы.
- Webhook в n8n (только по explicit кнопке).
- Side panel + content badge на vacancy page.

**MVP-2 (Search enhancement):**
- Бейджи и подсветка в поисковой выдаче.
- Быстрые действия (save, reject, etc.) из списка.
- Score на карточках.

**MVP-3 (Preparation):**
- Полуавто: генерация письма + кнопка "Copy optimized letter + resume recommendation".
- Нет авто-fill формы.

**MVP-4 (Queue & Workflow):**
- Очередь откликов (local).
- Кнопки действий с обновлением статуса + webhook.
- Пользователь сам переходит и откликается.

**MVP-5 (Post-application):**
- Работа с откликами/приглашениями/чатами (анализ, генерация ответов, reminders).

**Что точно не стоит делать в первой версии:**
- Любая авто-отправка, fill формы, клики по кнопкам HH.
- Полный HTML сохранение.
- Поддержка других сайтов.
- Backend (кроме optional webhook).
- Сложные reminders/push (только browser notifications + webhook).
- Трекинг HR-ответов автоматически (только manual import).

**Архитектура.**
- **Stack:** WXT (отлично для MV3, HMR, multi-framework), TypeScript, Solid.js (лёгкий, reactive, подходит для panels), Dexie.js (IndexedDB).
- Content Scripts: inject на hh.ru/vacancy/* и search pages (read-only parsing).
- Background/Service Worker: storage sync, webhook sender, AI calls (chrome.runtime).
- Side Panel (chrome.sidePanel API) или Popup + Dashboard (new tab page).
- Options page для settings/profiles/AI keys/webhooks.
- MV3: declarativeNetRequest если нужно, offscreen documents для heavy AI если потребуется.
- Модульная структура: parsers/, stores/, ai/, ui/, models/.

**Data model (IndexedDB / Dexie).**
- **Job**: id (hh_vacancy_id), url, title, company_id, salary_from/to, currency, location, remote_type, experience_req, description_clean, skills[], raw_text, score, status, profile_id, applied_date, etc.
- **Company**: id, name, url, rating, notes.
- **Profile**: id, name (e.g. "AI Engineer"), resume_text/full_json, preferences (salary, locations, keywords_must, keywords_nice), templates[].
- **Resume**: versioned per profile.
- **Application/CoverLetter**: job_id, profile_id, letter_text, version, sent_date.
- **Event**: timestamp, type (applied, hr_reply, strong_match), job_id, payload (для n8n).
- Relations: Job → Company, Job → Profile, Application → Job.

**Scoring model (rule-based).**
Быстрый, детерминистичный, объяснимый:
- Skills match: % intersection required/optional (weights 40%).
- Experience: exact range match or +/- (20%).
- Salary: if in range or above min (15%).
- Location/Remote: exact or acceptable (10%).
- Keywords (must-have from profile): +bonus / -penalty.
- Red flags: "urgent", "junior" mismatch, spam words, etc.
- Total: 0–100. Thresholds: >=85 strong, 60-84 consider, <60 skip.
AI уточняет с объяснениями (fit reasons, risks: salary low, company issues, overqualified и т.д.).

**UX/UI структура.**
- **Content badges**: на vacancy page — score badge, status icon, quick buttons (Save, Analyze, Generate Letter).
- **Side Panel**: основной workspace — job details, score breakdown, letter editor, profile switcher, AI chat.
- **Popup**: quick search status, daily summary, queue.
- **Dashboard** (options/new tab): full list jobs с фильтрами, exports, settings (profiles, AI, webhook, export/import).
- Dark mode, keyboard shortcuts, progress indicators.

**AI prompt templates.**
1. **Vacancy Analysis:**
"Ты senior recruiter. Профиль кандидата: [profile JSON]. Вакансия: [clean text + structured]. Дай score 0-100, top-5 fit reasons, top-3 risks, рекомендацию (отклик/подумать/пропустить), suggested profile."

2. **Cover Letter:**
"Напиши сопроводительное письмо для [profile] на вакансию [title]. Стиль: [режим]. Длина: до X символов. Используй информацию из резюме: [resume]. Вакансия: [text]. Ключевые навыки подчеркнуть: [skills]. Требования: без emoji/markdown если toggled."

**Security/privacy.**
- Permissions: minimal — "activeTab", "storage", "sidePanel", optional "scripting" только для read.
- Local-first: ничего не уходит наружу без explicit user action.
- AI: отправлять только выбранный job text + profile summary (user preview перед send).
- Webhook: user настраивает URL, payload template, test button; optional HMAC secret.
- No tracking, no telemetry по умолчанию.
- Data export/delete all.
- Review permissions перед публикацией в Chrome Web Store.

**Risks and mitigations.**
- **ToS/Ban:** Read-only parsing + manual actions. User warning при установке. Rate-limit свои действия. Separate "stealth" mode (меньше injection).
- **Anti-bot:** Не менять DOM агрессивно, использовать mutation observers осторожно.
- **MV3 limits:** Service worker lifecycle — использовать alarms/chromium.storage.
- **AI costs:** Rule-based default, AI optional + token preview.
- **Data loss:** Auto-export reminders, import.
Mitigation: четкий onboarding с "это не бот, используй responsibly".

**Roadmap (для одного dev).**
- Week 1–2: Setup WXT, parsers для vacancy/search, basic storage + statuses (MVP-1 core).
- Week 3: Scoring + UI side panel + letter generator.
- Week 4: AI integration (OpenRouter), export/webhook, polish.
- Week 5–6: MVP-2 badges + search.
- Затем MVP-3/4 с осторожностью.
- Testing parallel, publish alpha.
Общее на полный MVP-1 + 2: 6–8 недель.

**Список конкретных улучшений, которые стоит добавить в ТЗ:**
- Explicit Read-Only mode + warnings.
- Token usage preview и cost estimator перед AI call.
- Versioning для profiles/resumes/letters.
- Import вакансий из CSV/JSON (для bulk).
- Keyboard shortcuts и accessibility.
- Error boundary + offline messages.
- Analytics только opt-in (local).
- i18n (RU/EN).
- E2E тесты с Playwright + fixtures реальных HH страниц.
- Clear data retention policy в privacy notice.
- Feedback button внутри расширения.

Эта стратегия позволит быстро выпустить ценный, безопасный продукт, который реально помогает кандидатам и минимизирует все риски. Готов углубить любой раздел или помочь с initial code structure.
