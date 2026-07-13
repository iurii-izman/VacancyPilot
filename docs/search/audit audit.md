Вот ваш ответ, отформатированный в Markdown. Вы можете скопировать текст из блока ниже и сохранить его в файл, например, `careersignal_copilot_audit.md`.

```markdown
# CareerSignal HH Copilot: Аудит концепции и стратегия разработки

Вот подробный разбор концепции CareerSignal HH Copilot с позиции Senior Product Manager, архитектора браузерных расширений и эксперта по безопасности.

---

## Executive Summary
Концепция CareerSignal HH Copilot — это отличный, зрелый продукт. Главный козырь — фокус на user-controlled copilot, а не на спам-боте. Изоляция local-first, BYOK и интеграция с n8n закрывают реальные боли продвинутых соискателей. Однако в текущем виде есть критическое противоречие между приоритетом «не получить бан на HH» и желанием автоматизировать «подстановку текста в форму HH». Для MVP необходимо полностью отказаться от программного заполнения форм на HH и заменить его парадигмой "AI Copy & Human Paste". Это снизит риски бана до нуля и ускорит выход MVP без потери ценности.

---

## Что в концепции сильное
1. **Local-first и BYOK:** Идеальный подход для privacy-first инструмента. Отсутствие своего backend снимает 90% инфраструктурных и юридических головных болей.
2. **Гибридный scoring:** Rule-based по умолчанию + AI по кнопке. Это бережет деньги пользователя на API и дает мгновенный результат.
3. **Профили кандидата:** Возможность переключать контексты (AI Engineer vs CRM интегратор) — киллер-фича для мультидисциплинарных специалистов.
4. **Интеграция с n8n/Telegram:** Превращает расширение из "очередной читалки вакансий" в хаб для построения личных пайплайнов поиска работы.

---

## Что в концепции опасно или спорно
1. **Автоматизация ввода (MVP-3: "подстановка текста в форму HH"):** Это прямое нарушение ToS HH и триггер для их антибот-систем. Программное изменение DOM (даже через `textarea.value = ...`) легко детектится (React/Vue не обновляют внутренний стейт). **Риск бана: критический.**
2. **Очередь откликов (MVP-4):** Обработка вакансий по одной с автоматическим переходом по URL может расцениваться как скрейпинг. Если делать это слишком быстро — теневой бан.
3. **Хранение HTML в Debug-режиме:** Если пользователь забудет его выключить, в IndexedDB может скопиться гигабайт мусора, тормозящий браузер.
4. **Хранение API ключей:** `chrome.storage.local` не зашифрован. Любое расширение с доступом к истории или файлам (если их взломают) может украсть ключи OpenAI/DeepSeek.
5. **Rule-based score без парсинга резюме:** Как считать match, если расширение не знает навыки кандидата? Нужен явный механизм ввода скиллов в профиль.

---

## Исправленная стратегия
Мы смещаем фокус с "автоматизации действий" на "автоматизацию аналитики и подготовки".
*   **Вместо Auto-fill форм:** Расширение генерирует идеальное письмо в Side Panel, а пользователь копирует его в один клик (кнопка "Copy & Go to HH Form") и нажимает "Откликнуться" сам.
*   **Вместо Scraping поиска:** Используем Content Scripts только для чтения видимых данных (через DOM) и навешивания бейджей. Никаких фоновых обходов страниц.

---

## MVP Scope
*   **MVP-1 (Core & Analyze):** Парсинг вакансии, локальное сохранение, статусы, rule-based score, AI-анализ по кнопке, генерация письма, экспорт CSV/JSON, n8n webhook.
*   **MVP-2 (Search UX):** Бейджи в поисковой выдаче (новая/просмотрена/откликнута/Blacklist), быстрый статус из выдачи, Score на карточке.
*   **MVP-3 (Pipeline Prep):** Менеджер профилей (скиллы), пресеты для писем, библиотека удачных писем, генерация ответов HR (по paste текста).
*   **MVP-4 (Action Queue):** "Рабочий стол" (Dashboard) в Side Panel: список вакансий со статусом "letter_ready", поочередное открытие вакансий (в ручном режиме), смена статуса на "applied" + webhook.
*   **MVP-5 (Communications - V2):** Работа со страницей откликов HH (чтение ответов HR), классификация ответов, генерация follow-up.

**Что ТОЧНО не делаем в первой версии:**
*   Прямое программное заполнение форм отклика на HH.
*   Фоновую отправку откликов.
*   Свой backend и авторизацию.
*   Парсинг LinkedIn/Indeed (до закрытия HH).

---

## Архитектура (Manifest V3, WXT, Solid.js)

1.  **Background Service Worker (TS):**
    *   Обработка событий (смена статусов, триггеры).
    *   Отправка Webhooks в n8n (очередь Retry).
    *   Проксирование запросов к AI API (чтобы не светить ключи в Content Scripts и обходить CORS).
2.  **Content Scripts (HH.ru):**
    *   `content-vacancy.ts`: Извлечение данных со страницы `hh.ru/vacancy/...`. Внедрение FAB (Floating Action Button) для вызова Side Panel.
    *   `content-search.ts`: Сканирование выдачи, добавление бейджей в карточки `div.vacancy-serp-item`.
3.  **Side Panel (Solid.js + Tailwind):**
    *   Основной UI. Открывается по клику на FAB или иконку расширения.
    *   Табы: Анализ (Score, Risks), Письмо (AI генерация), История.
4.  **Storage Layer (Dexie.js / IndexedDB):**
    *   `chrome.storage.local`: Настройки, пресеты, n8n URL, AI провайдер/ключ (с предупреждением о безопасности).
    *   `IndexedDB`: Вакансии, профили, отклики, события (структурированные данные).

---

## Data Model

```typescript
// tables: jobs, profiles, applications, events

interface Job {
  id: string; // uuid
  hhId: string;
  url: string;
  title: string;
  company: string;
  salary: string | null;
  city: string;
  format: 'remote' | 'hybrid' | 'office';
  experience: string;
  description: string; // cleaned text
  skills: string[];
  createdAt: number;
}

interface Profile {
  id: string;
  name: string; // e.g., "AI Automation / n8n"
  targetTitle: string;
  skills: string[]; // ["n8n", "API", "Make", "Webhooks"]
  yearsExp: number;
  forbiddenWords: string[]; // ["бригадный подряд", "CRM Bitrix24"]
}

interface Application {
  id: string;
  jobId: string;
  profileId: string;
  status: 'new' | 'viewed' | 'saved' | 'rejected_by_me' | 'letter_ready' | 'applied' | 'hr_replied' | 'interview' | 'test_task' | 'rejected_by_company' | 'offer' | 'blacklist';
  ruleScore: number | null;
  aiScore: number | null;
  aiRisks: string[];
  coverLetter: string;
  coverLetterMode: string; // 'short_tg', 'hh_standard', etc.
  appliedAt: number | null;
}

interface Event {
  id: string;
  applicationId: string;
  type: 'job_saved' | 'letter_generated' | 'applied' | 'strong_match';
  payload: any;
  sentToN8n: boolean;
  createdAt: number;
}
```

---

## Scoring Model (Rule-based)

Алгоритм работает на основе пересечения `Profile.skills` и `Job.skills/description`.

1.  **Hard Skills Match (Вес: 0 - 60 баллов):**
    *   Сравниваем массив скиллов профиля с навыками из блока HH (или найденными в тексте).
    *   Формула: `(Matched Skills / Total Profile Skills) * 60`. Если совпадение > 80%, даем 60.
2.  **Experience Match (Вес: 0 - 20 баллов):**
    *   Если запрашиваемый опыт (например, 3 года) <= опыту профиля, даем 20. Если больше на 1 год — 10. Если больше на 2+ — 0.
3.  **Format & Location Match (Вес: 0 - 10 баллов):**
    *   Удаленка совпадает: +10. Город совпадает: +10. (Макс 10).
4.  **Penalties (Снижение score):**
    *   Найдено слово из `forbiddenWords`: -20 баллов.
    *   Зарплата ниже ожидаемой (если указано): -15 баллов.
5.  **Strong Match Trigger:** `RuleScore >= 85` && `!aiRisks.length`.

---

## UX/UI структура

1.  **Search Page (Content Script):**
    *   На каждую карточку вакансии слева навешиваем тонкий цветной бейдж (статус).
    *   Внутри карточки (возле зарплаты) — круглое число `Rule Score` (зеленый/желтый/красный).
    *   При наведении на бейдж — мини-меню (В блеклист, Сохранить, Открыть Copilot).
2.  **Vacancy Page (Content Script):**
    *   Справа сверху (в районе шапки вакансии) — FAB кнопка "CareerSignal" (сворачивает/разворачивает Side Panel). Если Side Panel открыт глобально, FAB просто подсвечивает активную вкладку.
3.  **Side Panel:**
    *   **Header:** Переключатель активного Профиля кандидата.
    *   **Tab 1: Analysis:** Карточка с Rule Score и AI Score (кнопка "Запустить AI анализ"). Список "Fit Reasons" (зеленые) и "Risk Flags" (красные).
    *   **Tab 2: Cover Letter:** Пресеты (кнопки переключения режимов: TG, HH, EN). Текстовое поле (редактируемое). Кнопка "Copy" (с галочкой "Удалить markdown").
    *   **Tab 3: Tracker:** Таблица/Список сохраненных вакансий с быстрым переключением статусов.
4.  **Popup (Browser Action):**
    *   Краткая сводка: "Сегодня откликнуто: X. Сильных матчей: Y. Активный профиль: [Name]". Кнопка "Открыть Dashboard" (открывает новую вкладку с полным UI на React/Solid, если Side Panel не хватает).

---

## AI Prompts (BYOK)

**1. Анализ вакансии (AI Score & Risks):**
```text
System: You are an expert tech recruiter. Analyze the job description against the candidate's profile. Output JSON.
User:
Candidate Profile: {profile.name}, Skills: {profile.skills}, Experience: {profile.yearsExp} years.
Job Description: {job.description}

Tasks:
1. Rate Match Score (0-100).
2. Identify 3 key Fit reasons (why the candidate fits).
3. Identify Risk flags (e.g., unrealistic expectations, stack mismatch, red flags in text).
Return JSON: {"score": int, "fit": [string], "risks": [string]}
```

**2. Генерация Cover Letter:**
```text
System: You are an expert copywriter helping a candidate apply for a job. Write a highly personalized cover letter based on the candidate's profile and job description.
User:
Candidate Profile: {profile.name}, Skills: {profile.skills}
Job Title: {job.title}, Company: {job.company}
Job Requirements: {job.skills}

Tone & Format: {mode} (e.g., "Short, confident, no emojis, under 500 chars, plain text").
Focus on how candidate's skills solve the company's implied problems. Do not use generic phrases like "I am writing to apply".
```

---

## Security / Privacy модель

1.  **Permissions (Manifest V3):**
    *   `"activeTab"` + `"host_permissions": ["*://*.hh.ru/*"]`. (Никаких `"<all_urls>"`).
    *   `"sidePanel"`, `"storage"`, `"clipboardWrite"`.
2.  **Data Minimization для AI:**
    *   В промпт отправляем только: `job.title`, `job.skills`, обрезанный `job.description` (до 2000 токенов) и `profile.skills`. Не отправляем ФИО, контакты, URL.
3.  **n8n Webhook Safety:**
    *   При настройке webhook делаем тестовый пинг. Отправляем только JSON-структуру (статус, ID вакансии, скоринг, профиль). Не отправляем AI-ключи и полные тексты писем.
4.  **API Keys:**
    *   Хранение в `chrome.storage.local`. Предупреждение в UI: "Ключи хранятся локально в браузере. Не используйте на публичных ПК". Ключи используются ТОЛЬКО в Background Service Worker (Content Scripts их не видят).
5.  **Local Data:**
    *   Кнопка "Очистить всю историю" (Wipe IndexedDB).

---

## Risks and Mitigations

1.  **Risk: Бан аккаунта на HH за автоматизацию.**
    *   *Mitigation:* Нулевая автоматизация ввода. Расширение работает в режиме read-only над DOM и пишет в Side Panel. Пользователь сам копирует текст и жмет кнопку "Откликнуться". Скорость откликов остается человеческой.
2.  **Risk: Изменение верстки HH (DOM breaking).**
    *   *Mitigation:* Использовать тестовые фикстуры (сохраненные HTML страницы). Использовать максимально абстрактные селекторы (data-атрибуты, если есть, или несколько fallback-селекторов). Настройка алертов (через n8n) если парсинг падает 3 раза подряд.
3.  **Risk: Превышение лимитов AI API (Rate Limits/Costs).**
    *   *Mitigation:* Rule-based работает всегда. AI вызывается строго по кнопке. Кэширование ответов (повторный AI анализ той же вакансии тем же профилем берем из БД).
4.  **Risk: Утечка API ключей.**
    *   *Mitigation:* Запрет на экспорт настроек вместе с ключами. При экспорте Config файлы очищаются от поля `api_key`.

---

## Roadmap (Для 1 разработчика, ~6-8 недель)

*   **Week 1: Базис.** WXT + Solid + Tailwind. Настройка Dexie. Манифест, проброс Content Script на hh.ru.
*   **Week 2: Парсер и Data Model.** Извлечение данных со страницы вакансии. Сохранение в IndexedDB. Базовый трекер (смена статусов) в Side Panel.
*   **Week 3: Профили и Rule-based Scoring.** Создание UI для профилей. Реализация алгоритма скоринга. Отображение Fit/Risk.
*   **Week 4: AI Интеграция.** Background Worker для API. Настройки BYOK. Промпты для анализа и генерации писем. UI для писем (пресеты, кнопка Copy).
*   **Week 5: MVP-2 (Search UI).** Внедрение в поисковую выдачу. Бейджи статусов. Скоринг на карточках.
*   **Week 6: Интеграции и Экспорт.** Webhooks в n8n. Экспорт в CSV/JSON. Настройки приватности.
*   **Week 7: Полировка и Edge Cases.** Обработка ошибок парсинга. Очередь "Todo" (MVP-4, но без автооткрытия вкладок, просто список "letter_ready").
*   **Week 8: Релиз MVP.** Тестирование на разных браузерах (Chrome, Edge, Brave). Подготовка store listing.

---

## Список конкретных улучшений для ТЗ

1.  **Убрать требование "подстановка текста в форму HH" (MVP-3).** Заменить на: "Кнопка 'Скопировать письмо и перейти к отклику'". Пользователь вставляет текст руками (Ctrl+V). Это сохранит аккаунты.
2.  **Добавить "Менеджер скиллов" в Профили.** Rule-based не заработает, если не дать пользователю возможность ввести теги (чипы) своих навыков для каждого профиля.
3.  **Внедрить кэширование AI-ответов.** Если сменился статус вакансии, но профиль не менялся — не тратить токены на повторный AI анализ.
4.  **Ограничить частоту Webhooks.** Добавить debounce (например, отправлять событие в n8n не чаще 1 раза в 5 секунд) или собирать события батчами, чтобы не спамить n8n при массовой смене статусов.
5.  **Селекторы HH.** В ТЗ явно указать, что парсер должен использовать комбинацию селекторов (например, `h1[data-qa='vacancy-title'], h1.b-Title`), так как HH периодически меняет классы.
6.  **Добавить режим "Strict Privacy".** Настройка, при которой в AI отправляется только список скиллов из вакансии, без описания требований (чтобы сэкономить токены и убрать PII, если описание вакансии содержит контакты).
```
