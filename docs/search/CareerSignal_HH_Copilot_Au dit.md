## Executive summary

Концепция сильная по философии (user-controlled copilot вместо спам-бота), но **содержит критические риски** в области ToS HH.ru и архитектурной сложности MVP. Главный факт: **HH.ru закрыл соискательский API 15 декабря 2025 года**. Все расширения, работающие через API, перестали функционировать. Теперь работает **только браузерная автоматизация через реальный браузер** с имитацией человеческого поведения. [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026)

**Ключевые исправления:**
1. Полная автоотправка и очередь откликов **не должны быть в MVP** — это зона высокого риска бана
2. Упростить stack: убрать Solid.js (выбрать только React), убрать IndexedDB на старте (только chrome.storage)
3. MVP-1 должен быть **строго read-only**: анализ, scoring, письмо, экспорт — без отправки
4. Полуавто/очередь (MVP-3/4) добавлять только после ручного тестирования на HH без банов

***

### Что в концепции сильное

| Категория | Сильные аспекты |
|-----------|---------------|
| **Философия** | User-controlled copilot вместо спам-бота — это правильное позиционирование для безопасности  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) |
| **Privacy** | Local-first, BYOK AI, минимум данных наружу — соответствует современным best practices  [github](https://github.com/dipankar/chrome-extension-best-practices) |
| **Scoring** | Гибридный подход: rule-based быстро + AI по кнопке — экономит API расходы  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) |
| **Профили** | Редактируемый менеджер профилей (AI Engineer, Backend, etc.) — критично для персонализации писем |
| **n8n интеграция** | Webhook-based события без жесткого backend — гибко для automation-ориентированных пользователей |
| **MVP-финанирование** | Работа без AI возможна — статусы, трекер, rule-based score — good fallback |

***

### Что в концепции опасно или спорно

| Риск | Описание | Статус |
|------|----------|--------|
| **Закрытие API HH** | HH.ru закрыл соискательский API 15.12.2025. Автоотклики через API не работают  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) | **Критично** |
| **Браузерная автоматизация** | Только Playwright/Puppeteer с реальной сессией + имитация поведения (кривая Безье, паузы 2–8с) безопасна  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) | Высокий риск |
| **Lимит 200 откликов/сутки** | HH ограничивает 200 откликов в день. Всплески активности детектируются  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) | Высокий риск |
| **Слишком сложный MVP-1** | 14 функций в MVP-1 для одного разработчика — нереалистично | Средний риск |
| **Solid.js + React параллельно** | Выбор между фреймворками должен быть один — Solid.js имеет меньшую экосистему | Средний риск |
| **IndexedDB для MVP** | chrome.storage проще для MVP, IndexedDB добавляет сложность без необходимости | Низкий риск |
| **Полуавто в MVP-3** | Полуавтоматический отклик через DOM-инъекцию может триггерить антибот HH без правильной имитации | Высокий риск |
| **MVP-4 очередь** | Очередь откликов = массовая автоматизация = зона bans без серверной автоматизации с Russia IP  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) | Критично |

***

### Исправленная стратегия

```
Фаза 0 (2 недели): Read-only MVP
├─ Только анализ страниц HH
├─ Rule-based scoring
├─ Сохранение в chrome.storage
├─ Export CSV/JSON
└─ n8n webhook (только события "сильная вакансия")

Фаза 1 (3 недели): AI-enhanced Copilot
├─ AI-анализ по кнопке (BYOK)
├─ Генерация сопроводительного
├─ Библиотека писем
├─ Recommendation engine
└─ Side panel UI

Фаза 2 (4 недели): Manual Apply Assistant
├─ Подсветка вакансий в поиске (MVP-2)
├─ Badges в поисковой выдаче
├─ Quick actions из popup
├─ DOM helpers для ручного отклика (подстановка текста)
└─ ТОЛЬКО пользователь кликает "Отправить"

Фаза 3 (опционально, после тестов): Semi-auto
├─ Полуавто с подтверждением (MVP-3)
├─ Имитация поведения человека (кривая Безье, паузы)
├─ Лимит 50–80 откликов/день
└─ TREE acquisition на Russia IP [web:1]
```

**Ключевое изменение:** MVP-1 становится **read-only**. Отклик (even semi-auto) переходит в Phase 2/3 после тестирования.

***

### MVP scope (исправленный)

#### MVP-1 (Read-only, 2–3 недели)
| Функция | Описание | Приоритет |
|---------|----------|-----------|
| Анализ страницы вакансии | Извлечение title, company, salary, city, remote/hybrid, experience, description, skills, HH id | P0 |
| Local storage | chrome.storage для вакансий + applications | P0 |
| Статусы | new, viewed, saved, rejected, letter_ready, applied, hr_replied, interview, offer, blacklist | P0 |
| Rule-based scoring | Гибридный match score на основе skills/experience/salary | P0 |
| AI-анализ по кнопке | BYOK DeepSeek/OpenAI/OpenRouter | P1 |
| Recommendations | Откликаться / подумать / пропустить + причины | P1 |
| Генерация письма | Шаблоны + AI-адаптация + переключатели (emoji, markdown, length) | P1 |
| Export CSV/JSON | Локальный экспорт всей истории | P1 |
| n8n webhook | Событие "strong vacancy" (Match ≥85, no risks) | P2 |

#### MVP-2 (Visual enhancements, 2 недели)
| Функция | Описание |
|---------|----------|
| Badges в поиске | Match score + статус на карточке вакансии |
| Подсветка вакансий | new/viewed/saved/applied/rejected/blacklist colors |
| Quick actions | Save, Reject, Open Side Panel из popup |

#### MVP-3 (DOM helpers, 3 недели)
| Функция | Описание | **Важно** |
|---------|----------|----------|
| Подстановка письма | Auto-fill текста в форму HH | **Только после ручного клика пользователя** |
| Recommendation резюме | Выбор профиля/resume под вакансию | Без автоотправки |
| Packet preparation | Кнопка "Подготовить отклик" → открывает модалку HH | Пользователь отправляет |

#### MVP-4 (Queue — опционально, 4 недели)
⚠️ **Только после тестирования на HH без банов**
| Функция | Требование безопасности |
|---------|------------------------|
| Очередь откликов | Лимит 50–80/день, паузы 3–5 мин  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) |
| Полуавто с подтверждением | Имитация поведения (кривая Безье, случайные клики)  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) |
| Webhook после действия | Обновление статуса + отправка события |

#### MVP-5 (HR interaction, 4 недели)
| Функция | Описание |
|---------|----------|
| Чаты HR | Классификация ответов, генерация ответа |
| Follow-up reminders | Telegram/n8n уведомления |

***

### Архитектура расширения

```
CareerSignal HH Copilot Architecture

┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension (MV3)                    │
├──────────────┬──────────────────┬───────────────────────────┤
│   Popup      │   Side Panel     │    Content Script         │
│ (quick ops)  │ (main UI)        │    (DOM injection)        │
├──────────────┼──────────────────┼───────────────────────────┤
│ chrome.storage                    │ IndexedDB (optional)      │
│ (settings, short data)           │ (large job data)          │
└──────────────┴──────────────────┴───────────────────────────┘
         │              │              │
         ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                    WXT Framework                             │
│  - TypeScript                                               │
│  - React (выбрать один, убрать Solid.js)                    │
│  - Dexie.js (если IndexedDB)                                │
│  - Manifest V3 service worker                               │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services (optional)              │
│  - AI: DeepSeek / OpenAI / OpenRouter (BYOK)                │
│  - n8n: Webhook for events                                  │
│  - Telegram: Notifications (via n8n)                        │
└─────────────────────────────────────────────────────────────┘
```

**Ключевые решения:**
- **WXT + React + TypeScript** — убрать Solid.js для упрощения
- **chrome.storage.local** как primary storage для MVP (IndexedDB — опционально для V2)
- **Content scripts** для DOM парсинга HH.ru.pages
- **Side panel** для main UI (не отдельная страница — меньше overhead)
- **Service worker** для background logic (MV3 requirement) [developer.chrome](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)

***

### Data model

```typescript
// Job — структурированные данные вакансии
interface Job {
  id: string;              // HH vacancy id
  sourceUrl: string;       // Полная URL
  title: string;           // Должность
  company: CompanyId;      // Ссылка на Company
  salary: {
    min: number;
    max: number;
    currency: string;
    displayed: string;     // "от 150 000 ₽"
  } | null;
  city: string;
  workMode: 'office' | 'hybrid' | 'remote';
  experience: string;      // "от 1 года", "от 3 лет", "без опыта"
  description: string;     // Очищенный текст (без HTML)
  skills: string[];        // Извлечённые навыки
  postedAt: string;        // ISO date
  hhRaw: {                 // Опционально: полный HTML (debug only)
    html: string;
    extractedAt: string;
  } | null;
  savedAt: string | null;
}

// Company
interface Company {
  id: string;
  name: string;
  hhUrl: string;
  blacklist: boolean;
}

// Profile —candidate profiles
interface Profile {
  id: string;
  name: string;            // "Universal", "AI Engineer", "Backend"
  resumeId: ResumeId;
  skills: string[];
  experienceYears: number;
  bio: string;             // Short bio для писем
  isActive: boolean;
}

// Resume
interface Resume {
  id: string;
  profileId: ProfileId;
  title: string;
  content: string;         // Полный текст резюме
  skills: string[];
  experience: Array<{
    company: string;
    role: string;
    start: string;
    end: string;
    description: string;
  }>;
}

// Application —отклик на вакансию
interface Application {
  id: string;
  jobId: JobId;
  profileId: ProfileId;
  status: ApplicationStatus;
  coverLetterId: CoverLetterId | null;
  appliedAt: string | null;
  hrRepliedAt: string | null;
  hrReplyText: string | null;
  interviewDate: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
  offerAt: string | null;
  notes: string;
}

type ApplicationStatus =
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

// CoverLetter
interface CoverLetter {
  id: string;
  applicationId: ApplicationId;
  jobId: JobId;
  profileId: ProfileId;
  text: string;            // Финальный текст
  templateUsed: string;    // "short_tg", "hh_standard", "confident", ...
  aiGenerated: boolean;
  aiModel: string;         // "deepseek", "openai", ...
  createdAt: string;
  modifiedAt: string;
  settings: {
    noEmoji: boolean;
    noMarkdown: boolean;
    noSpecialChars: boolean;
    maxChars: 500 | 1000 | null;
    language: 'ru' | 'en';
  };
}

// Event —для n8n webhook
interface Event {
  id: string;
  type: EventType;
  timestamp: string;
  data: {
    applicationId?: ApplicationId;
    jobId?: JobId;
    vacancyTitle?: string;
    matchScore?: number;
    hrReply?: string;
    summary?: string;      // Для daily_summary
  };
}

type EventType =
  | 'application_sent'
  | 'hr_replied'
  | 'strong_vacancy_found'
  | 'daily_summary';
```

**Storage layout (chrome.storage.local):**
```
{
  settings: { ... },
  jobs: { [jobId]: Job },
  companies: { [companyId]: Company },
  profiles: { [profileId]: Profile },
  resumes: { [resumeId]: Resume },
  applications: { [appId]: Application },
  coverLetters: { [letterId]: CoverLetter },
  events: { [eventId]: Event }
}
```

***

### Scoring model (rule-based для HH)

```typescript
interface MatchScore {
  total: number;           // 0–100
  breakdown: {
    skills: number;        // 0–40
    experience: number;    // 0–25
    salary: number;        // 0–15
    workMode: number;      // 0–10
    location: number;      // 0–10
  };
  risks: RiskFlag[];
  recommendation: 'apply' | 'think' | 'skip';
}

interface RiskFlag {
  type: 'critical' | 'warning';
  category: 'experience' | 'skills' | 'salary' | 'workMode' | 'location' | 'company';
  message: string;
}

function calculateMatchScore(job: Job, profile: Profile): MatchScore {
  // Skills: 40 баллов
  // - Каждый matching skill = 5 баллов (макс 8 skills = 40)
  const skillMatches = job.skills.filter(s => profile.skills.includes(s));
  const skillsScore = Math.min(skillMatches.length * 5, 40);

  // Experience: 25 баллов
  // - job требует "от X лет", profile имеет Y лет
  // - Y >= X: 25 баллов, Y = X-1: 15 баллов, Y < X-1: 5 баллов
  const jobMinYears = parseExperienceRequirement(job.experience);
  const experienceScore = calculateExperienceScore(jobMinYears, profile.experienceYears);

  // Salary: 15 баллов
  // - job.salary.min >= profile.expectedSalary: 15 баллов
  // - job.salary.min >= profile.expectedSalary * 0.8: 10 баллов
  // - иначе: 5 баллов
  const salaryScore = calculateSalaryScore(job.salary, profile.expectedSalary);

  // WorkMode: 10 баллов
  // - job.workMode == profile.preferredWorkMode: 10 баллов
  // - иначе: 0 баллов
  const workModeScore = job.workMode === profile.preferredWorkMode ? 10 : 0;

  // Location: 10 баллов
  // - remote: всегда 10 баллов
  // - city match: 10 баллов, иначе 0
  const locationScore = job.workMode === 'remote' || job.city === profile.city ? 10 : 0;

  const total = skillsScore + experienceScore + salaryScore + workModeScore + locationScore;

  // Risk flags
  const risks: RiskFlag[] = [];
  if (profile.experienceYears < jobMinYears - 2) {
    risks.push({ type: 'critical', category: 'experience', message: 'Опыт значительно ниже требования' });
  }
  if (skillMatches.length < 3) {
    risks.push({ type: 'warning', category: 'skills', message: 'Мало совпадений по навыкам' });
  }
  if (job.salary && job.salary.min < profile.expectedSalary * 0.7) {
    risks.push({ type: 'critical', category: 'salary', message: 'Зарплата ниже ожидаемой' });
  }

  // Recommendation
  const recommendation = total >= 85 && risks.length === 0 ? 'apply'
                       : total >= 70 ? 'think'
                       : 'skip';

  return { total, breakdown: { skills: skillsScore, experience: experienceScore, salary: salaryScore, workMode: workModeScore, location: locationScore }, risks, recommendation };
}
```

**Правила для HH-specific:**
- Skills извлекаются из block "Ключевые навыки" + из description через regex
- Experience нормализуется: "от 1 года" → 1, "от 3 лет" → 3, "без опыта" → 0
- Salary парсится из "от XXX ₽" / "YYY – ZZZ ₽"
- WorkMode из block "Условия работы" (remote/hybrid/office)

***

### AI prompt templates

#### Prompt 1: Vacancy Analysis

```text
Ты — опытный карьерный консультант. Проанализируй вакансию и профиль кандидата.

Вакансия:
{
  "title": "{{job.title}}",
  "company": "{{job.company}}",
  "salary": "{{job.salary?.displayed}}",
  "city": "{{job.city}}",
  "workMode": "{{job.workMode}}",
  "experience": "{{job.experience}}",
  "skills": {{JSON.stringify(job.skills)}},
  "description": "{{job.description}}"
}

Профиль кандидата:
{
  "name": "{{profile.name}}",
  "skills": {{JSON.stringify(profile.skills)}},
  "experienceYears": {{profile.experienceYears}},
  "bio": "{{profile.bio}}",
  "resume": "{{resume.content}}"
}

Задание:
1. Выяви 3-5 ключевых требований вакансии (обязанности/навыки)
2. Найди 2-3 точки совпадения между опытом кандидата и требованиями
3. Опрежи критические риски (experience gap, missing skills, salary mismatch)
4. Оцените match score (0–100)
5. Дайте рекомендацию: откликаться / подумать / пропустить

Вывод в формате JSON:
{
  "keyRequirements": ["...", "..."],
  "matches": ["...", "..."],
  "risks": [{ "type": "critical|warning", "message": "..." }],
  "matchScore": 0-100,
  "recommendation": "apply|think|skip",
  "reasoning": "Краткое объяснение (2-3 строки)"
}
```

#### Prompt 2: Cover Letter Generation

```text
Ты — профессиональный карьерный консультант. Создай сопроводительное письмо для вакансии.

Вакансия:
{
  "title": "{{job.title}}",
  "company": "{{job.company}}",
  "skills": {{JSON.stringify(job.skills)}},
  "description": "{{job.description}}"
}

Кандидат:
{
  "name": "{{profile.name}}",
  "bio": "{{profile.bio}}",
  "experience": {{JSON.stringify(resume.experience)}},
  "topAchievements": ["...", "..."]
}

Настройки письма:
- Режим: {{letterTemplate}}  // short_tg, hh_standard, confident, very_short, en_version
- Без emoji: {{noEmoji}}
- Без markdown: {{noMarkdown}}
- Максимум символов: {{maxChars}}
- Язык: {{language}}

Задание:
1. Приветствие (если hh_standard/confident: "Здравствуйте", если short_tg: "Добрый день")
2. Связка: 2-3 конкретных совпадения между опытом кандидата и требованиями вакансии
3. Конкретный кейс с цифрой (достижение)
4. предложение обсудить

Ограничения:
- Длина: {{maxChars}} символов (если указано)
- Без emoji: {{noEmoji}}
- Без markdown: {{noMarkdown}}
- Язык: {{language}}

Вывод: только текст письма, без пояснений.
```

***

### UX/UI структура

```
┌─────────────────────────────────────────────────────────────┐
│                    HH.ru Vacancy Page                        │
├─────────────────────────────────────────────────────────────┤
│  [Job Title]  [Company]  [Salary]                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Description...                                       │  │
│  │  Skills: Python, React, SQL...                        │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  [CareerSignal Side Panel - открыт]             │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │ Match: 87% │ recommend: APPLY             │  │  │  │
│  │  │  ├───────────────────────────────────────────┤  │  │  │
│  │  │  │ Key Requirements:                         │  │  │  │
│  │  │  │ - Python 3+                               │  │  │  │
│  │  │  │ - React experience                        │  │  │  │
│  │  │  │                                           │  │  │  │
│  │  │  │ Matches:                                  │  │  │  │
│  │  │  │ - 3 года Python                           │  │  │  │
│  │  │  │ - React в проектах                        │  │  │  │
│  │  │  │                                           │  │  │  │
│  │  │  │ Risks:                                    │  │  │  │
│  │  │  │ - ⚠️ Мало SQL опыта                        │  │  │  │
│  │  │  │                                           │  │  │  │
│  │  │  │ [AI Analyze] [Generate Letter] [Save]    │  │  │  │
│  │  │  │                                           │  │  │  │
│  │  │  │ ┌─────────────────────────────────────┐  │  │  │  │
│  │  │  │ │ Сопроводительное:                   │  │  │  │
│  │  │  │ │ Здравствуйте,                       │  │  │  │
│  │  │  │ │ Меня заинтересировала ваша вакансия..│  │  │  │
│  │  │  │ │                                     │  │  │  │
│  │  │  │ │ [Edit] [Save] [Copy]                │  │  │  │
│  │  │  │ └─────────────────────────────────────┘  │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│  [Откликнуться] — нативная кнопка HH                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    HH.ru Search Results                      │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [badge: 87%] Python Developer — Company — 150k ₽     │  │
│  │ ─────────────────────────────────────────────────── │  │
│  │ [new] [remote] ──────────────── [Save] [Reject]      │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [badge: 72%] Frontend — Company2 — 120k ₽            │  │
│  │ ─────────────────────────────────────────────────── │  │
│  │ [viewed] [hybrid] ─────────────── [Save] [Reject]    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Popup (quick actions)                     │
├─────────────────────────────────────────────────────────────┤
│  CareerSignal HH Copilot                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Current Profile: [AI Engineer ▼]                      │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ Quick Actions:                                        │  │
│  │ [Save Job] [Reject] [Open Side Panel] [Export]       │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ Recent Applications:                                  │  │
│  │ • Python Dev — applied — [View]                       │  │
│  │ • Frontend — letter_ready — [View]                    │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ [Settings] [Dashboard]                                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Dashboard / Settings                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┬─────────────────────────────────────────┐  │
│  │ Profiles    │ [Add Profile]                           │  │
│  ├─────────────┼─────────────────────────────────────────┤  │
│  │ Applications│ Table: Job | Status | Score | Applied  │  │
│  ├─────────────┼─────────────────────────────────────────┤  │
│  │ Letters     │ Library of successful letters          │  │
│  ├─────────────┼─────────────────────────────────────────┤  │
│  │ Settings    │ AI Provider: [DeepSeek ▼]              │  │
│  │             │ n8n Webhook: [URL input]               │  │
│  │             │ Export: [CSV] [JSON]                   │  │
│  └─────────────┴─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Компоненты:**
- **Content badges**: Inline badges в поисковой выдаче (score + статус)
- **Side panel**: Main UI для анализа вакансии + письмо
- **Popup**: Quick actions + recent applications
- **Dashboard**: Full settings + history + export

***

### Security/privacy модель

```typescript
// Manifest V3 permissions (минимальные)
{
  "permissions": [
    "storage",           // chrome.storage.local
    "activeTab",         // Доступ к текущей вкладке (для content script)
    "scripting"          // Для inject content scripts
  ],
  "host_permissions": [
    "https://hh.ru/*"    // Только HH.ru (не все сайты)
  ]
}

// Data minimization для AI
interface AIPayload {
  // В AI отправляется ТОЛЬКО:
  jobTitle: string;
  jobSkills: string[];
  jobDescription: string;  // Очищенный текст, без HTML
  profileSkills: string[];
  profileBio: string;
  resumeExperiences: Array<{role: string, company: string, description: string}>;

  // НЕ отправляется:
  // - job.id (HH vacancy id)
  // - job.sourceUrl
  // - company.name (можно опционально)
  // - пользовательские notes
  // - история applications
}

// n8n webhook safety
interface WebhookConfig {
  url: string;
  enabled: boolean;
  events: EventType[];
  // Security:
  requireHttps: true;
  maxRetries: 3;
  timeoutMs: 5000;
  // Data filter:
  excludeFields: ['hhRaw', 'notes', 'hrReplyText'];
}
```

**Permissions rationale:**
- `storage` — только local settings + краткие данные [github](https://github.com/dipankar/chrome-extension-best-practices)
- `activeTab` — content script работает только на активной вкладке HH [github](https://github.com/dipankar/chrome-extension-best-practices)
- `host_permissions` — только `hh.ru/*`, не все сайты [github](https://github.com/dipankar/chrome-extension-best-practices)
- **No `clipboardWrite`** — пользователь копирует вручную
- **No `notifications`** — уведомления через n8n/Telegram

**Local storage policy:**
- Все данные хранятся в `chrome.storage.local` (не передаются без явного действия)
- Full HTML сохраняется только в debug-режиме (отключено по дефолту)
- Export CSV/JSON — пользовательский action, не автоматический

**AI data minimization:**
- BYOK: пользователь вставляет свой API key, расширение не хранит его
- Только очищенный текст вакансий (без HTML, без ID)
- Пользователь управляет тем, что отправляется (чекбоксы в UI)

***

### Risks and mitigations

| Риск | Вероятность |Impact | Mitigation |
|------|-------------|-------|------------|
| **Бан HH за автоотклик** | Высокая | Критичный | MVP-1 read-only; полуавто только после тестов с имитацией поведения  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) |
| **Закрытие API (already done)** | 100% | Критичный | Использовать только browser automation (Playwright/Puppeteer)  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) |
| **Лимит 200 откликов/день** | 100% | Высокий | Лимит 50–80/день в semi-auto, паузы 3–5 мин  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) |
| **Антибот-детекция (капча)** | Высокая | Высокий | Имитация: кривая Безье, случайные клики, паузы 2–8с  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) |
| **IP из-за рубежа = триггер** | Высокая | Высокий | Серверы в России для semi-auto (если нужен backend)  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) |
| **Сложность MVP для 1 разработчика** | Высокая | Средний | Упростить MVP-1: read-only, убрать IndexedDB, выбрать React only |
| **API расходы AI** | Средняя | Средний | Rule-based по дефолту, AI по кнопке; лимит запросов в settings |
| **Пользовательская ошибка (wrong AI key)** | Средняя | Низкий | Валидация key, clear error messages, fallback to rule-based |
| **ToS violation (DOM injection)** | Средняя | Высокий | Только read DOM парсинг; write (автоподстановка) только после ручного клика |
| **Privacy leak (n8n webhook)** | Низкая | Высокий | excludeFields в config, requireHttps, пользователь управляет events |

**ToS/бан-specific guidelines:**
1. **Не обходить антибот** — расширение должно работать в рамках нативного UI HH
2. **Read-only парсинг** — content script читает DOM, но не изменяет без явного действия пользователя
3. **Полуавто с подтверждением** — пользователь всегда кликает "Отправить" в модалке HH
4. **Лимиты в UI** — показывать count откликов/день, предупреждать при 70+
5. **No background automation** — расширение не работает без открытой вкладки HH

***

### Roadmap (для одного разработчика)

```
Week 1–2: Foundation (MVP-1 core)
├─ WXT + React + TypeScript setup
├─ Manifest V3 manifest.json
├─ Content script для HH.ru DOM парсинга
├─ chrome.storage.local schema
├─ Job extraction (title, company, salary, skills, etc.)
└─ Unit tests: job parser fixtures

Week 3: Scoring + Statuses (MVP-1)
├─ Rule-based match score implementation
├─ Status management (new, viewed, saved, ...)
├─ Side panel UI (basic)
├─ Export CSV/JSON
└─ E2E tests: complete flow на локальном HH

Week 4: AI Integration (MVP-1)
├─ BYOK AI provider (DeepSeek/OpenAI/OpenRouter)
├─ Vacancy analysis prompt
├─ Cover letter generation prompt
├─ AI button in side panel
└─ Manual test: 10 вакансий с AI

Week 5: Polish + n8n (MVP-1 finish)
├─ n8n webhook integration
├─ "Strong vacancy" event
├─ Settings UI (AI provider, webhook URL)
├─ Documentation + README
└─ Beta test: 5 пользователей

Week 6–7: MVP-2 (Visual enhancements)
├─ Badges в поисковой выдаче
├─ Подсветка вакансий (colors по статусу)
├─ Quick actions в popup
├─ DOM fixtures для search results
└─ E2E: search page flow

Week 8–10: MVP-3 (DOM helpers)
├─ Auto-fill письма в форму HH (только после ручного open модалки)
├─ Resume recommendation UI
├─ "Prepare apply" button → открывает нативную модалку HH
├─ Manual test: 20 откликов (пользователь отправляет)
└─ Risk assessment: обновить mitigations

Week 11–14: MVP-4 (Semi-auto — OPTIONAL)
├─ Queue system (лимит 50–80/день)
├─ Имитация поведения (кривая Безье, паузы)
├─ Confirmation flow перед отправкой
├─ Rigid testing: 100 откликов без банов
└─ Decision: release или rollback to MVP-3

Week 15–18: MVP-5 (HR interaction)
├─ Чаты HR detection
├─ HR reply classification
├─ Follow-up reminders
├─ Telegram/n8n notifications
└─ Full documentation
```

**Критические точки проверки:**
- **Week 5**: Beta test MVP-1 (read-only) — если нет проблем, продолжать
- **Week 10**: Manual test MVP-3 (20 откликов) — если HH не триггерит, продолжать
- **Week 14**: Rigid test MVP-4 (100 откликов) — если баны, rollback to MVP-3

***

### Конкретные улучшения для ТЗ

| № | Improvement | Приоритет |
|---|-------------|-----------|
| 1 | **MVP-1 сделать read-only** — убрать отправку откликов из MVP-1 | P0 |
| 2 | **Убрать Solid.js** — выбрать только React для упрощения | P0 |
| 3 | **Убрать IndexedDB на старте** — только chrome.storage.local для MVP | P0 |
| 4 | **Добавить лимит откликов в UI** — count + предупреждение при 70+ | P0 |
| 5 | **Добавить имитацию поведения для semi-auto** — кривая Безье, паузы 2–8с  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) | P0 |
| 6 | **Добавить Russia IP requirement для semi-auto** — если нужен backend  [jobturbo](https://jobturbo.ru/blog/avtootklik-na-hh-ru-2026) | P1 |
| 7 | **Добавить debug mode для full HTML** — отключено по дефолту | P1 |
| 8 | **Добавить AI data minimization** — excludeFields в webhook config | P1 |
| 9 | **Добавить unit tests для job parser** — DOM fixtures для разных HH страниц | P1 |
| 10 | **Добавить E2E tests** — complete flow на локальном HH (mocked) | P1 |
| 11 | **Добавить manual test plan** — 10/20/100 откликов с risk assessment | P1 |
| 12 | **Добавить fallback to rule-based** — если AI key invalid или API error | P2 |
| 13 | **Упростить MVP-4** — оставить только queue + confirmation, убрать auto-send | P2 |
| 14 | **Добавить "strong vacancy" threshold в settings** — пользователь меняет 85% | P2 |
| 15 | **Добавить blacklist by company** — автоматический reject компаний из blacklist | P2 |

***

### Финальная рекоменд

**Лучший первый MVP без лишнего усложнения:**

```
CareerSignal HH Copilot MVP-1 (Read-only, 3 недели)

Цель: Максимально полезный read-only copilot, который НЕ рискует баном.

Функции:
✓ Анализ вакансии HH (title, company, salary, skills, etc.)
✓ Rule-based match score (0–100)
✓ Статусы (new, viewed, saved, rejected, ...)
✓ AI-анализ по кнопке (BYOK)
✓ Генерация сопроводительного (шаблоны + AI)
✓ Export CSV/JSON
✓ n8n webhook ("strong vacancy" event)
✓ Side panel UI + Popup quick actions

НЕ включать:
✗ Отправка откликов (even semi-auto)
✗ Очередь откликов
✗ Auto-fill в форму HH
✗ IndexedDB (только chrome.storage)
✗ Solid.js (только React)
✗ Full HTML save (debug only)

Почему это лучше:
1. 0 риск бана — read-only парсинг DOM
2. 3 недели вместо 6–8 для full MVP
3. Пользователь получает value сразу (scoring, письма, экспорт)
4. Semi-auto добавляется позже ПОСЛЕ тестов без банов
5. Один разработчик реально делает за 3 недели

Next step:
Фаза 2 (MVP-2 + MVP-3) — визуальные улучшения + DOM helpers для ручного отклика.
Фаза 3 (MVP-4) — только если test 100 откликов без банов.
```

**Ключевое правило:** "Не получить бан на HH" — приоритет №1, как указано в твоих priorities. Read-only MVP-1 обеспечивает это полностью.
