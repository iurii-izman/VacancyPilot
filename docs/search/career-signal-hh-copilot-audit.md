## Executive summary

CareerSignal HH Copilot имеет правильный фокус: не бот для массовых откликов, а ассистент для кандидата с локальным трекингом, профилями, адаптацией писем и безопасной интеграцией AI/n8n. Для первого MVP важно сузить границы до HH.ru, Chromium, Manifest V3, local-first и ручного управления пользователем. Это уменьшит риск блокировок, ускорит запуск и даст основу для будущего расширения.

---

## Что в концепции сильное

- Фокус на HH.ru и Chromium-first снижает объем начальной работы.
- Ясное разделение на MVP-этапы, от базового трекинга до полуавто откликов.
- Правильный приоритет: не спам, а качество откликов, приватность, local-first.
- Гибридный scoring: rule-based + AI по кнопке.
- Хранение локально и экспорт в CSV/JSON + webhook.
- Пользователь контролирует, что отправляется в AI/n8n.
- Поддержка BYOK и нескольких AI-поставщиков.

---

## Что в концепции опасно или спорно

- Формулировка «отправить важные события в n8n/Telegram» может подтолкнуть к избыточной телеметрии.
- Автоматизация откликов даже в полуавто-режиме сильно рискует попасть под антибот-системы HH.
- Функции «генерация письма» и «подстановка в форму» легко становятся инструментом массовых откликов.
- «Сохранение вакансии» + «история откликов» без четкой GDPR/политики приватности может вызвать претензии.
- Слишком много профилей/шаблонов с первого релиза усложняет MVP.
- Структура данных должна быть проще: не нужно сразу делать полноценный CRM.

---

## Исправленная стратегия

- MVP-1: ядро трекинга вакансии + rule-based анализ + профиль + cover letter draft + local storage + экспорт/webhook.
- Исключить из MVP-1 любые действия, которые могут выглядеть как автоматический отклик: авто-подстановка, массовое submit, форсированные queue flows.
- Оставить AI как опциональную кнопку: пользователь сам инициирует анализ/письмо.
- Не хранить полные HTML-страницы без debug-флага.
- Позиционирование: "Job Search Copilot" как инструмент принятия решения, а не "автоотклик".

---

## MVP scope

### MVP-1
- Парсинг страницы вакансии HH
- Извлечение: title, компания, зарплата, город, remote/hybrid/office, опыт, описание, навыки, URL, HH id
- Локальное сохранение вакансии
- Статусы: new, viewed, saved, rejected_by_me, letter_ready, applied, hr_replied, interview, test_task, rejected_by_company, offer, blacklist
- Rule-based score + рекомендации respond/think/skip
- Причины fit и risk flags
- Рекомендация профиля
- Генерация чернового сопроводительного письма
- Сохранение final письма
- Экспорт CSV/JSON
- Отправка event в n8n webhook

### MVP-2
- Badges в поисковой выдаче HH
- Подсветка вакансий по статусам
- Score на карточке поиска
- Быстрые действия из списка
- Добавление вакансии в очередь (queue как лист задач, без автоотправки)

### MVP-3
- Полуавтоматический отклик: подготавливает письмо/рекомендации, в интерфейсе кандидат подтверждает
- Рекомендация резюме
- Подставка текста в форму HH с явным подтверждением
- Снятие ручного контроля после каждого шага

### MVP-4
- Очередь откликов + обработка вакансий по одной
- Кнопки: отправить, пропустить, отложить, blacklist
- После действия обновляется статус и отправляется webhook

### MVP-5
- Работа с откликами, приглашениями, чатами HH
- Классификация ответов HR
- Генерация ответов HR
- Follow-up reminders
- Telegram/n8n уведомления

---

## Архитектура

- Chromium extension, Manifest V3
- Стек: TypeScript + React (или Solid.js, но React проще MVP)
- Storage:
  - `chrome.storage.local` для настроек
  - IndexedDB/Dexie для данных вакансий/приложений/профилей
- Background service worker
- Content scripts:
  - Vacancy page parser
  - Search results badge renderer
- UI:
  - Popup для быстрого доступа и настроек
  - Side panel / overlay на HH для вакансий
  - Dashboard/settings page расширения
- AI/HTTP:
  - Вызовы к BYOK/OpenAI/OpenRouter из background с user consent
- Webhook:
  - без backend, напрямую из extension через fetch
- Export:
  - CSV/JSON генерация в клиенте

---

## Data model

### Job
- id
- hhId
- title
- companyId
- companyName
- salary
- city
- locationType (`remote` | `hybrid` | `office`)
- experience
- descriptionText
- skills
- sourceUrl
- parsedAt
- savedAt
- status
- score
- fitReasons[]
- riskFlags[]
- recommendedProfileId
- lastUpdated

### Company
- id
- name
- hhCompanyId?
- industry?
- location?
- savedAt

### Profile
- id
- name
- roleTag
- summary
- keySkills[]
- preferredIndustries[]
- resumeId?
- coverLetterTemplateId?
- customNotes

### Resume
- id
- profileId
- name
- type (`universal` | `technical` | `product` | ...)
- contentText
- lastUpdated
- tags[]

### Application
- id
- jobId
- profileId
- resumeId
- coverLetterId
- status
- appliedAt
- responseAt
- notes

### CoverLetter
- id
- applicationId?
- profileId
- jobId?
- templateType
- text
- generatedAt
- finalisedAt

### Event
- id
- type (`saved_job` | `applied` | `hr_replied` | `interview` | `offer` | `daily_summary` | ...)
- jobId?
- applicationId?
- payload
- createdAt
- webhookSentAt?

---

## Scoring model

### Rule-based scoring для HH
- +20 за ключевой навык в описании/requirements, совпадающий с профилем
- +15 за совпадение профессии/роли
- +10 за remote/hybrid, если пользователь готов к удаленной работе
- +10 за зарплату >= целевой
- +10 за минимальный опыт <= опыт профиля
- +15 за совпадение города/регионов
- -30 за явно «не подходит» (Junior/Intern при Senior-профиле)
- -25 за mismatch по ключевым soft skills или stack
- -20 за токсичные risk flags: «не учитываются отклики», «только по рекомендациям», «исключительно с релокацией»
- -15 если salary скрыта и профессия высококонкурентная
- risk flags:
  - `remote_mismatch`
  - `experience_mismatch`
  - `seniority_mismatch`
  - `location_mismatch`
  - `salary_unknown`
  - `requires_relocation`
  - `internal_only`
- Fit reasons:
  - `skill_match`
  - `role_match`
  - `salary_fit`
  - `location_fit`
  - `experience_fit`
- Score bucket:
  - `>=85` strong
  - `70-85` good
  - `50-70` consider
  - `<50` skip

---

## UX/UI структура

### Content badges
- Значок score + статус
- Цвета: green/amber/red/gray
- Счетчик «strong vacancy» на карточке поиска

### Side panel
- На странице вакансии HH: боковая панель с анализом
- Разделы:
  - Job summary
  - Score & recommendation
  - Reasons / risk flags
  - Recommended profile
  - Cover letter draft
  - Quick actions (`Save`, `Generate letter`, `Add to queue`, `Send event`)

### Popup
- Быстрый доступ к последним сохраненным вакансиям
- Кнопка `Open dashboard`
- Статус webhook/AИ
- Быстрая настройка профиля

### Dashboard/settings
- Список вакансий
- Фильтры по статусам
- Профили и резюме
- Настройки webhook
- Настройки AI and privacy
- Экспорт данных
- Логи событий / debug-mode toggle

---

## AI prompts

### Анализ вакансии
Prompt:
```
You are a Job Search Copilot for a candidate. Analyze the following HH.ru vacancy text and produce:
1) Overall match score 0-100.
2) Top 3 fit reasons.
3) Top 3 risks or mismatch points.
4) Recommended candidate profile type from available profiles.
5) Short recommendation: respond / consider / skip.

Vacancy:
{job_title}
{company}
{location}
{salary}
{employment_type}
{experience}
{description}

Candidate profile:
{profile_summary}
{profile_skills}
{profile_experience}

Output JSON:
{
  "score": ...,
  "fit_reasons": [...],
  "risk_flags": [...],
  "recommended_profile": "...",
  "recommendation": "respond|consider|skip"
}
```

### Генерация письма
Prompt:
```
You are an assistant generating a cover letter for a candidate applying to an HH.ru vacancy. Use this format:
- keep length under {max_chars} characters
- no emoji, no markdown, no special symbols if requested
- use tone: {tone}
- reference company and role
- mention 2 relevant skills or achievements
- explain why this candidate is a good fit

Vacancy:
{job_title}
{company}
{location}
{summary}

Profile:
{profile_name}
{profile_summary}
{key_skills}
{experience_text}

Template options:
{template_mode} // e.g. "short", "standard", "confident", "EN"

Generate final letter only.
```

---

## Security/privacy

- Permissions:
  - `activeTab`, `scripting`, `storage`, `notifications`
  - минимум `host_permissions` для `https://hh.ru/*`
- Local storage:
  - Настройки и профили в `chrome.storage.local`
  - Вакансии, приложения, письма в IndexedDB
- AI data minimization:
  - Отправлять только структурированные поля и очищенный текст
  - Исключить личные данные пользователя по умолчанию
  - Явное согласие перед отправкой в AI
- n8n webhook safety:
  - Пользователь вводит url, extension не хранит его в открытом виде? Хранит только в локальном хранилище.
  - Не отправлять webhook без явного события/согласия
  - Для важных событий — возможность отключить webhook
- Debug mode:
  - Full HTML сохраняется только в debug mode
  - По умолчанию debug off
- Безопасный default:
  - Off для всех внешних интеграций
  - On только для local analysis и rule-based score

---

## Risks and mitigations

### ToS / бан
- Risk: автоматические формы и массовые отклики.
- Mitigation:
  - MVP-1 не включает автоматизированную отправку.
  - Любая вставка текста в форму должна происходить после явного подтверждения.
  - Нельзя эмулировать submit или тайминги, нельзя обходить защиту.
  - Не использовать прокси/скрейпинг HH API.
  - Использовать extension как UI layer, не как бот.

### Антибот-защиты
- Risk: активный скрипт на страницах HH.
- Mitigation:
  - Минимальные content scripts.
  - Не изменять страницу без необходимости.
  - Не собирать cookies/headers.
  - Не использовать background polling.
  - Ограничить actions до пользовательских кликов.

### Privacy
- Risk: утечка данных вакансий, резюме, писем.
- Mitigation:
  - Local-first.
  - Минимум данных наружу.
  - Никакие данные не отправляются автоматически.
  - Пользователь управляет webhook/AI.
  - Не сохранять email/SNILS и не экспортировать личные данные без явного разрешения.

---

## Roadmap

### Фаза 1 (2-3 недели)
- MVP-1: parser HH.job page, local save, statuses, rule scoring, side panel, cover letter draft, export, webhook event.
- UI: vacancy side panel + popup + dashboard basic.
- Storage: IndexedDB + chrome.storage.

### Фаза 2 (2 недели)
- MVP-2: search page badges, highlight statuses, quick actions, queue add.
- Улучшения UX для списка вакансий.

### Фаза 3 (2-3 недели)
- MVP-3: полуавто workflow, профиль/резюме recommendation, форма подстановки текста с подтверждением.
- Добавить UI queue review.

### Фаза 4 (2 недели)
- MVP-4: очередь откликов, отправка/skip/blacklist действия, webhook при действии.

### Фаза 5 (2-3 недели)
- MVP-5: работа с откликами и чатами, классификация HR reply, follow-up reminders, Telegram/n8n уведомления.
- Поддержка новых сайтов.

---

## Список конкретных улучшений, которые стоит добавить в ТЗ

1. Сразу указать: MVP-1 не включает автоматическое отправление откликов.
2. Добавить явное требование safe default для всех внешних интеграций.
3. Уточнить, что full HTML сохраняется только в debug-флаге.
4. Добавить политику «only HH.ru first» и оставить LinkedIn/Indeed/Glassdoor на Roadmap.
5. Уточнить, что AI-запросы делаются только по кнопке и только после подтверждения.
6. Включить режимы письма: короткое, стандарт, уверенное, EN, без emoji/markdown.
7. Добавить webhook event schema и user-controlled toggle.
8. Уточнить, что в MVP-1 достаточно одного редактируемого профиля и 2-3 шаблонов.
9. Уточнить, что score выводится и в search results, и на vacancy page.
10. Внедрить обязательный privacy notice в UI: «Данные остаются в браузере, внешние интеграции по вашему выбору».
