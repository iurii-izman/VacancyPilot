# CareerSignal HH Copilot — Критический аудит концепции и стратегия разработки

## Executive Summary

CareerSignal HH Copilot — это браузерное расширение для job search automation на HH.ru. Концепция сильна в видении user-controlled подхода, но содержит критические риски: возможное нарушение ToS HH.ru, избыточная сложность MVP, непроработанная модель монетизации и недостаточный фокус на анти-бот защите. Основная рекомендация: резко сузить MVP до "Job Tracker + AI Scoring Assistant", отложить все формы автоматизации откликов до подтверждения безопасности с HH.ru.

---

## Что в концепции сильное

1. **User-controlled philosophy** — отказ от спам-бота в пользу копилота. Это правильный продуктовый выбор и защита от репутационных рисков.
2. **Local-first architecture** — данные хранятся локально, минимум утечек. Соответствует трендам privacy-first приложений.
3. **BYOK AI модель** — пользователь несёт расходы на API, снижает барьер для разработчика и даёт контроль пользователю.
4. **Гибридный scoring** — rule-based + AI по кнопке. Оптимально для баланса скорости и качества.
5. **Менеджер профилей** — распознаёт реальность, где у кандидата несколько специализаций.
6. **n8n интеграция** — правильный выбор для power users, не требует backend.
7. **Многоэтапная автоматизация** — ручной → полуавто → очередь. Показывает понимание рисков.
8. **Минимизация данных в AI** — принцип data minimization для AI-запросов.
9. **Фокус на качестве, не количестве** — правильный positioning.

---

## Что в концепции опасно или спорно

### Критические риски

1. **Нарушение ToS HH.ru**
   - HH.ru прямо запрещает автоматизированный сбор данных (парсинг) в своих ToS.
   - Автоматическая отправка откликов может быть расценена как бот-активность.
   - Массовый scraping вакансий — основание для блокировки IP/аккаунта.
   - **Риск**: бан пользователя на HH.ru, юридические претензии к разработчику.

2. **Анти-бот защита HH.ru**
   - HH.ru использует Cloudflare, капчи, rate limiting, behavioral analysis.
   - Любое расширение, взаимодействующее с DOM откликов, будет детектировано.
   - Даже "полуавтоматический" ввод текста в форму отклика — подозрительная активность.

3. **Избыточный scope MVP-1**
   - 11 функций в MVP-1 — это не MVP, это полноценный продукт.
   - AI-анализ, генерация писем, rule-based scoring, n8n webhook — слишком много для первой версии.
   - Риск: 3-4 месяца разработки вместо 4-6 недель.

4. **Непроработанная бизнес-модель**
   - BYOK AI = нет recurring revenue от AI.
   - Бесплатное расширение = как монетизировать?
   - n8n webhook — только для power users, не массовая фича.

5. **Технические противоречия**
   - "Работает без AI" но "AI-анализ по кнопке" — нужно ли AI в MVP?
   - "Local-first" но "n8n webhook" — данные всё равно уходят наружу.
   - "Без backend" но нужна синхронизация между устройствами?

6. **Скрытые сложности**
   - DOM HH.ru меняется часто — maintenance hell.
   - Разные версии HH.ru (мобильная, десктоп, логин/не логин).
   - Обработка динамического контента (React/Vue на HH.ru).

7. **Privacy paradox**
   - "Минимум данных наружу" но отправляем вакансии в OpenAI/DeepSeek.
   - Нет механизма аудита, что именно уходит в AI.
   - Нет offline mode для AI (локальные модели).

8. **Scoring модель непроработана**
   - Rule-based scoring на основе чего? Ключевых слов?
   - Как обрабатывать синонимы? "Python" vs "Python3" vs "Питон"?
   - Как взвешивать разные факторы?

9. **Письма: риск шаблонности**
   - AI-генерация писем без персонализации = спам.
   - HR видит шаблонные письма — негатив к продукту.
   - Нет механизма A/B тестирования писем.

10. **Расширение vs Web App**
    - Браузерное расширение ограничено в возможностях.
    - Нельзя делать background scraping без открытой вкладки (MV3 restrictions).
    - Content script injection — detectable by HH.ru.

---

## Исправленная стратегия

### Продуктовая позиция

**Не**: "Job Search Copilot с AI-автоматизацией"
**А**: "Smart Job Tracker — ваш персональный дневник поиска работы с AI-ассистентом"

### Ключевые изменения

1. **MVP = Tracker + Scorer + AI Assistant**
   - Никакой автоматизации откликов в MVP.
   - Никакого взаимодействия с формами HH.ru.
   - Только чтение + анализ + рекомендации.

2. **Фокус на value для пользователя**
   - "Я вижу 50 вакансий в день, какие из них стоят моего времени?"
   - "Я откликнулся на 20 вакансий, кто мне ответил?"
   - "Как написать хорошее письмо быстро?"

3. **Безопасный подход к данным HH.ru**
   - Только content script для чтения открытой страницы.
   - Никакого background scraping.
   - Никакого массового сбора.
   - Пользователь явно сохраняет каждую вакансию.

4. **Монетизация сразу**
   - Freemium: базовый tracker бесплатно, AI-фичи — подписка.
   - Или: фиксированная цена, AI — BYOK (как в концепции).
   - n8n webhook — pro фича.

5. **Прозрачность AI**
   - Показывать пользователю точный prompt перед отправкой в AI.
   - Возможность редактирования prompt.
   - Локальное логирование всех AI-запросов.

---

## MVP Scope (Исправленный)

### MVP-1: Smart Job Tracker (4-6 недель)

**Core:**
- [ ] Content script для страницы вакансии HH.ru
- [ ] Извлечение: title, company, salary, city, remote/hybrid/office, experience, description, skills, URL, HH vacancy id
- [ ] Side panel с информацией о вакансии
- [ ] Сохранение вакансии в IndexedDB
- [ ] Статусы: new, viewed, saved, applied, rejected, blacklist
- [ ] Basic rule-based match score (keywords + weights)
- [ ] AI-анализ по кнопке (BYOK: DeepSeek/OpenAI/OpenRouter)
- [ ] Генерация сопроводительного письма по кнопке
- [ ] История писем (сохранение финального варианта)
- [ ] Экспорт CSV/JSON

**Out of MVP-1:**
- ❌ Автоматизация откликов (любая форма)
- ❌ Интеграция с поисковой выдачей (бейджи)
- ❌ n8n webhook
- ❌ Очередь откликов
- ❌ Работа с откликами/приглашениями
- ❌ Менеджер профилей (только один профиль)
- ❌ Множественные резюме

### MVP-2: Search Enhancement (2-3 недели)

- [ ] Бейджи в поисковой выдаче HH.ru
- [ ] Подсветка вакансий по статусу
- [ ] Score на карточке вакансии
- [ ] Быстрое сохранение из списка
- [ ] Фильтрация по статусу в поиске

### MVP-3: AI & Profiles (3-4 недели)

- [ ] Менеджер профилей (до 5 профилей)
- [ ] AI-рекомендация профиля для вакансии
- [ ] Улучшенная генерация писем с учётом профиля
- [ ] Шаблоны писем (короткое, стандартное, уверенное, EN)
- [ ] Настройки писем (emoji, markdown, length)

### MVP-4: n8n Integration (2 недели)

- [ ] Настройка webhook URL
- [ ] События: vacancy_saved, status_changed, ai_analysis_complete
- [ ] Тест webhook кнопка
- [ ] Формат JSON для n8n

### MVP-5: Response Tracking (4-6 недель)

- [ ] Мониторинг страницы "Мои отклики" на HH.ru
- [ ] Классификация ответов HR (автоматическая + ручная)
- [ ] Follow-up reminders
- [ ] Telegram уведомления через n8n

### V2: Semi-Automation (только после юридической проверки)

- [ ] Полуавтоматический отклик (подготовка, но отправка вручную)
- [ ] Подстановка текста в форму HH.ru
- [ ] Очередь откликов с подтверждением

---

## Архитектура

### Стек

| Компонент | Технология | Обоснование |
|-----------|-----------|-------------|
| Manifest | V3 | Требование Chrome Web Store |
| Framework | WXT | Лучший DX для MV3, HMR, авто-релизы |
| Frontend | Solid.js | Меньше bundle size, быстрее React, реактивность |
| Storage | IndexedDB (Dexie) | Структурированные данные, поиск, индексы |
| Settings | chrome.storage.sync | Синхронизация настроек между устройствами |
| AI Client | Fetch API | Прямые запросы к OpenAI/DeepSeek/OpenRouter |
| State | Solid Stores | Встроенная реактивность, нет Redux needed |
| CSS | Tailwind CSS | Быстрая стилизация, консистентность |

### Структура расширения

```
career-signal-hh-copilot/
├── src/
│   ├── entrypoints/
│   │   ├── content/              # Content scripts
│   │   │   ├── vacancy-page.ts   # Анализ страницы вакансии
│   │   │   └── search-page.ts    # Бейджи в поисковой выдаче
│   │   ├── background/         # Service worker (MV3)
│   │   │   └── index.ts          # Message routing, alarms
│   │   ├── popup/              # Popup окно
│   │   │   └── App.tsx
│   │   ├── sidepanel/          # Side panel (Chrome 114+)
│   │   │   └── App.tsx
│   │   └── options/            # Страница настроек
│   │       └── App.tsx
│   ├── components/             # Shared UI components
│   ├── stores/                   # Solid stores (state management)
│   ├── db/                       # IndexedDB/Dexie layer
│   ├── services/
│   │   ├── hh-parser.ts          # Парсинг DOM HH.ru
│   │   ├── ai-client.ts          # Клиент для AI API
│   │   ├── scoring-engine.ts     # Rule-based scoring
│   │   ├── n8n-webhook.ts        # Webhook client
│   │   └── cover-letter-gen.ts   # Генерация писем
│   ├── types/                    # TypeScript interfaces
│   ├── utils/                    # Helpers
│   └── constants/                # Константы, селекторы DOM
├── public/
│   └── _locales/                 # Локализации
├── tests/
│   ├── unit/
│   ├── fixtures/                 # HTML snapshots HH.ru
│   └── e2e/
└── wxt.config.ts
```

### Communication Flow

```
Content Script (vacancy-page.ts)
  ↓ (read DOM)
HH.ru Page
  ↓ (extract data)
Parser Service
  ↓ (structured data)
IndexedDB (Dexie)
  ↓ (sync)
Side Panel / Popup
  ↓ (user action)
AI Client (fetch)
  ↓ (API response)
UI Update
  ↓ (optional)
n8n Webhook
```

### Key Architectural Decisions

1. **No Background Scraping**
   - Content script активен только на открытой вкладке HH.ru
   - Никаких периодических задач на сбор данных
   - Service worker только для message routing

2. **Parser Abstraction**
   - Интерфейс `HHParser` с методами `parseVacancy()`, `parseSearchResult()`
   - Версионирование селекторов (v1, v2, etc.)
   - Graceful degradation при изменении DOM

3. **AI Isolation**
   - AI client работает только из popup/sidepanel
   - Никакого AI в content script (security)
   - Пользователь явно инициирует каждый AI-запрос

4. **Storage Strategy**
   - Вакансии: IndexedDB (большие данные, поиск)
   - Настройки: chrome.storage.sync (малый объём, синхронизация)
   - Кэш AI-ответов: IndexedDB с TTL

---

## Data Model

### Job (Vacancy)

```typescript
interface Job {
  id: string;                    // UUID (локальный)
  hhId: string;                  // ID вакансии на HH.ru
  source: 'hh.ru';
  sourceUrl: string;

  // Основные данные
  title: string;
  company: Company;
  salary?: {
    from?: number;
    to?: number;
    currency: string;
    gross?: boolean;
  };
  location: {
    city: string;
    remote: boolean;
    hybrid: boolean;
    office: boolean;
  };
  experience: 'no_experience' | 'between_1_and_3' | 'between_3_and_6' | 'more_than_6';
  employmentType: string[];      // full, part, project, volunteer, probation
  schedule: string[];            // fullDay, shift, flexible, remote, flyInFlyOut

  // Описание
  description: string;           // Очищенный текст
  descriptionHtml?: string;      // Только в debug mode
  skills: string[];
  requirements: string[];
  responsibilities: string[];

  // Метаданные
  publishedAt: string;           // ISO date
  archived: boolean;

  // Статус
  status: JobStatus;
  statusHistory: StatusChange[];

  // Scoring
  ruleScore: number;             // 0-100
  aiScore?: number;              // 0-100
  aiAnalysis?: AIAnalysis;

  // Письмо
  coverLetter?: CoverLetter;

  // Технические
  createdAt: string;
  updatedAt: string;
  scrapedAt: string;
}

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

interface StatusChange {
  status: JobStatus;
  timestamp: string;
  note?: string;
}
```

### Company

```typescript
interface Company {
  id: string;                    // UUID
  hhId?: string;
  name: string;
  logoUrl?: string;
  industry?: string;
  size?: string;
  description?: string;
  website?: string;

  // Пользовательские метки
  userRating?: number;           // 1-5
  userNotes?: string;
  isBlacklisted: boolean;

  createdAt: string;
  updatedAt: string;
}
```

### Profile

```typescript
interface Profile {
  id: string;                    // UUID
  name: string;                  // "Universal", "AI Engineer", etc.
  isDefault: boolean;

  // Профессиональные данные
  title: string;                 // Желаемая должность
  summary: string;               // Краткое описание
  skills: Skill[];               // Навыки с уровнями
  experience: WorkExperience[];
  education: Education[];

  // Предпочтения
  desiredSalary?: {
    from: number;
    to: number;
    currency: string;
  };
  preferredLocations: string[];
  remotePreference: 'remote' | 'hybrid' | 'office' | 'any';

  // Для scoring
  keywords: string[];            // Ключевые слова для matching
  antiKeywords: string[];        // Стоп-слова (чего не хотим)

  createdAt: string;
  updatedAt: string;
}

interface Skill {
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  category: 'technical' | 'soft' | 'language' | 'domain';
  yearsOfExperience?: number;
}
```

### Resume

```typescript
interface Resume {
  id: string;
  profileId: string;
  hhResumeId?: string;           // Если загружено с HH.ru
  name: string;                  // Название резюме
  content: string;               // Текст резюме
  isDefault: boolean;

  // Метаданные
  fileName?: string;
  fileType?: string;
  uploadedAt: string;
  updatedAt: string;
}
```

### CoverLetter

```typescript
interface CoverLetter {
  id: string;
  jobId: string;
  profileId: string;

  // Контент
  content: string;
  tone: 'short_tg' | 'hh_standard' | 'confident' | 'brief' | 'english';

  // Настройки
  settings: {
    noEmoji: boolean;
    noMarkdown: boolean;
    noSpecialChars: boolean;
    maxLength?: number;          // 500 или 1000
  };

  // AI metadata
  aiModel?: string;
  aiPrompt?: string;
  aiResponse?: string;

  // История
  versions: CoverLetterVersion[];

  createdAt: string;
  updatedAt: string;
}

interface CoverLetterVersion {
  content: string;
  timestamp: string;
  note?: string;
}
```

### Application (Response/Interaction)

```typescript
interface Application {
  id: string;
  jobId: string;

  // Отклик
  appliedAt?: string;
  appliedVia: 'hh.ru' | 'email' | 'other';
  coverLetterId?: string;
  resumeId?: string;

  // Ответ HR
  hrResponse?: {
    type: 'invitation' | 'rejection' | 'question' | 'no_response' | 'other';
    receivedAt: string;
    content?: string;
    aiClassification?: string;
  };

  // Этапы
  stages: ApplicationStage[];

  // Follow-up
  followUpReminder?: string;

  createdAt: string;
  updatedAt: string;
}

interface ApplicationStage {
  name: string;                  // "Screening", "Technical", "Offer"
  status: 'scheduled' | 'completed' | 'cancelled';
  scheduledAt?: string;
  completedAt?: string;
  notes?: string;
}
```

### Event (for n8n)

```typescript
interface Event {
  id: string;
  type: EventType;
  timestamp: string;

  // Связанные сущности
  jobId?: string;
  profileId?: string;

  // Данные события
  payload: Record<string, any>;

  // Доставка
  webhookDelivered: boolean;
  webhookDeliveredAt?: string;
  webhookError?: string;

  createdAt: string;
}

type EventType =
  | 'vacancy_saved'
  | 'vacancy_viewed'
  | 'status_changed'
  | 'ai_analysis_requested'
  | 'ai_analysis_completed'
  | 'cover_letter_generated'
  | 'cover_letter_edited'
  | 'application_sent'
  | 'hr_replied'
  | 'daily_digest'
  | 'strong_vacancy_found';
```

---

## Rule-Based Scoring Model

### Архитектура скоринга

```typescript
interface ScoringRule {
  id: string;
  name: string;
  category: 'skills' | 'location' | 'salary' | 'experience' | 'company' | 'title' | 'schedule';
  weight: number;                // Вес категории (сумма = 100)
  conditions: ScoringCondition[];
  score: number;                 // Баллы при выполнении
}

interface ScoringCondition {
  field: string;
  operator: 'contains' | 'equals' | 'gt' | 'lt' | 'regex' | 'in';
  value: any;
  caseSensitive?: boolean;
}
```

### Категории и веса (по умолчанию)

| Категория | Вес | Описание |
|-----------|-----|----------|
| Skills | 30 | Совпадение ключевых навыков |
| Title | 20 | Релевантность названия должности |
| Location | 15 | Соответствие локации/удалёнки |
| Salary | 15 | Соответствие зарплатным ожиданиям |
| Experience | 10 | Соответствие опыта |
| Schedule | 5 | График работы |
| Company | 5 | Рейтинг компании/чёрный список |

### Алгоритм скоринга

```typescript
function calculateRuleScore(job: Job, profile: Profile): ScoreResult {
  const result: ScoreResult = {
    totalScore: 0,
    categoryScores: {},
    matchedSkills: [],
    missingSkills: [],
    riskFlags: [],
    fitReasons: [],
  };

  // 1. Skills matching (30%)
  const skillsScore = calculateSkillsScore(job.skills, profile.skills);
  result.categoryScores.skills = skillsScore;
  result.totalScore += skillsScore * 0.30;

  // 2. Title matching (20%)
  const titleScore = calculateTitleScore(job.title, profile.title, profile.keywords);
  result.categoryScores.title = titleScore;
  result.totalScore += titleScore * 0.20;

  // 3. Location matching (15%)
  const locationScore = calculateLocationScore(job.location, profile);
  result.categoryScores.location = locationScore;
  result.totalScore += locationScore * 0.15;

  // 4. Salary matching (15%)
  const salaryScore = calculateSalaryScore(job.salary, profile.desiredSalary);
  result.categoryScores.salary = salaryScore;
  result.totalScore += salaryScore * 0.15;

  // 5. Experience matching (10%)
  const expScore = calculateExperienceScore(job.experience, profile.experience);
  result.categoryScores.experience = expScore;
  result.totalScore += expScore * 0.10;

  // 6. Schedule matching (5%)
  const scheduleScore = calculateScheduleScore(job.schedule, profile);
  result.categoryScores.schedule = scheduleScore;
  result.totalScore += scheduleScore * 0.05;

  // 7. Company check (5%)
  const companyScore = calculateCompanyScore(job.company, profile);
  result.categoryScores.company = companyScore;
  result.totalScore += companyScore * 0.05;

  // Risk flags
  result.riskFlags = detectRiskFlags(job, profile);

  // Fit reasons
  result.fitReasons = generateFitReasons(result);

  return result;
}
```

### Детальные правила

#### Skills Scoring (30%)

```typescript
function calculateSkillsScore(jobSkills: string[], profileSkills: Skill[]): number {
  if (jobSkills.length === 0) return 50; // Нейтрально, если навыки не указаны

  const profileSkillNames = profileSkills.map(s => s.name.toLowerCase());
  const normalizedJobSkills = jobSkills.map(s => normalizeSkill(s));

  let matched = 0;
  let weightedScore = 0;

  for (const jobSkill of normalizedJobSkills) {
    const match = findBestSkillMatch(jobSkill, profileSkillNames);
    if (match) {
      matched++;
      const level = profileSkills.find(s => s.name.toLowerCase() === match)?.level;
      weightedScore += skillLevelMultiplier(level);
    }
  }

  const coverage = matched / normalizedJobSkills.length;
  const avgWeight = weightedScore / (matched || 1);

  return Math.min(100, coverage * 100 * 0.7 + avgWeight * 0.3);
}

// Нормализация навыков
function normalizeSkill(skill: string): string {
  const synonyms: Record<string, string[]> = {
    'python': ['python3', 'питон', 'py'],
    'javascript': ['js', 'ecmascript', 'node.js', 'nodejs'],
    'typescript': ['ts'],
    'react': ['reactjs', 'react.js'],
    // ... etc
  };

  const lower = skill.toLowerCase().trim();
  for (const [canonical, variants] of Object.entries(synonyms)) {
    if (variants.includes(lower) || lower === canonical) return canonical;
  }
  return lower;
}

function skillLevelMultiplier(level?: string): number {
  switch (level) {
    case 'beginner': return 60;
    case 'intermediate': return 80;
    case 'advanced': return 95;
    case 'expert': return 100;
    default: return 70;
  }
}
```

#### Title Scoring (20%)

```typescript
function calculateTitleScore(
  jobTitle: string,
  profileTitle: string,
  keywords: string[]
): number {
  const jobWords = tokenize(jobTitle.toLowerCase());
  const profileWords = tokenize(profileTitle.toLowerCase());

  // Точное совпадение
  if (jobTitle.toLowerCase() === profileTitle.toLowerCase()) return 100;

  // Частичное совпадение
  const overlap = jobWords.filter(w => profileWords.includes(w)).length;
  const coverage = overlap / Math.max(jobWords.length, profileWords.length);

  // Ключевые слова
  const keywordMatches = keywords.filter(k =>
    jobTitle.toLowerCase().includes(k.toLowerCase())
  ).length;
  const keywordScore = keywords.length > 0
    ? (keywordMatches / keywords.length) * 100
    : 0;

  return coverage * 60 + keywordScore * 40;
}
```

#### Location Scoring (15%)

```typescript
function calculateLocationScore(location: JobLocation, profile: Profile): number {
  // Удалёнка — приоритет
  if (profile.remotePreference === 'remote' && location.remote) return 100;
  if (profile.remotePreference === 'hybrid' && (location.hybrid || location.remote)) return 100;
  if (profile.remotePreference === 'office' && location.office) return 80;

  // Город
  const cityMatch = profile.preferredLocations.some(
    city => location.city.toLowerCase().includes(city.toLowerCase())
  );

  if (cityMatch) return 90;
  if (profile.remotePreference === 'any') return 70;

  return 20; // Не подходит
}
```

#### Salary Scoring (15%)

```typescript
function calculateSalaryScore(
  jobSalary?: JobSalary,
  desiredSalary?: DesiredSalary
): number {
  if (!jobSalary || !desiredSalary) return 50; // Нейтрально

  const jobFrom = jobSalary.from || jobSalary.to || 0;
  const jobTo = jobSalary.to || jobSalary.from || 0;
  const desiredFrom = desiredSalary.from;
  const desiredTo = desiredSalary.to;

  // Вилка зарплат пересекается с ожиданиями
  if (jobFrom >= desiredFrom && jobTo <= desiredTo) return 100;
  if (jobFrom >= desiredFrom * 0.8 && jobTo <= desiredTo * 1.2) return 80;
  if (jobTo < desiredFrom) return 30; // Ниже ожиданий
  if (jobFrom > desiredTo) return 60; // Выше ожиданий (не всегда плохо)

  return 50;
}
```

#### Risk Flags

```typescript
function detectRiskFlags(job: Job, profile: Profile): RiskFlag[] {
  const flags: RiskFlag[] = [];

  // Навыки не совпадают
  if (result.categoryScores.skills < 30) {
    flags.push({
      type: 'skill_mismatch',
      severity: 'high',
      message: 'Требуемые навыки сильно отличаются от ваших',
    });
  }

  // Зарплата ниже ожиданий
  if (job.salary?.to && profile.desiredSalary?.from &&
      job.salary.to < profile.desiredSalary.from * 0.7) {
    flags.push({
      type: 'salary_too_low',
      severity: 'medium',
      message: 'Зарплата существенно ниже ожиданий',
    });
  }

  // Требуется больше опыта
  const expMap = {
    'no_experience': 0,
    'between_1_and_3': 2,
    'between_3_and_6': 4.5,
    'more_than_6': 7,
  };
  // ... etc

  // Компания в чёрном списке
  if (job.company.isBlacklisted) {
    flags.push({
      type: 'blacklisted_company',
      severity: 'high',
      message: 'Компания в вашем чёрном списке',
    });
  }

  // Подозрительное описание
  const suspiciousPatterns = [
    /family/i, /стартап.*?без.*?зп/i, /бесплатно/i,
    /стажировка.*?без.*?оплаты/i, /волонт[её]р/i,
  ];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(job.description)) {
      flags.push({
        type: 'suspicious_description',
        severity: 'medium',
        message: 'В описании найдены подозрительные формулировки',
      });
      break;
    }
  }

  // Вакансия старая
  const daysSincePublish = (Date.now() - new Date(job.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePublish > 60) {
    flags.push({
      type: 'old_vacancy',
      severity: 'low',
      message: 'Вакансия опубликована более 2 месяцев назад',
    });
  }

  return flags;
}
```

### Рекомендации на основе скоринга

```typescript
function getRecommendation(score: number, riskFlags: RiskFlag[]): Recommendation {
  const hasCriticalRisk = riskFlags.some(f => f.severity === 'high');
  const hasMediumRisk = riskFlags.some(f => f.severity === 'medium');

  if (score >= 85 && !hasCriticalRisk) {
    return { action: 'apply', message: 'Отличное совпадение, рекомендуем откликнуться' };
  }

  if (score >= 70 && !hasCriticalRisk) {
    return { action: 'consider', message: 'Хорошее совпадение, стоит рассмотреть' };
  }

  if (score >= 50 && !hasCriticalRisk) {
    return { action: 'review', message: 'Среднее совпадение, внимательно изучите детали' };
  }

  if (hasCriticalRisk) {
    return { action: 'skip', message: 'Есть критические риски, рекомендуем пропустить' };
  }

  return { action: 'skip', message: 'Низкое совпадение' };
}
```

---

## AI Prompt Templates

### 1. Анализ вакансии

```
SYSTEM PROMPT:
You are an expert career advisor and job market analyst. Analyze the provided job vacancy
and candidate profile to give structured recommendations. Be objective, specific, and actionable.

Respond in Russian unless the vacancy is clearly for an English-speaking position.

OUTPUT FORMAT (strict JSON):
{
  "matchScore": number,        // 0-100, overall match percentage
  "fitReasons": [string],      // 3-5 specific reasons why this is a good fit
  "riskFlags": [
    {
      "severity": "low" | "medium" | "high",
      "category": "skills" | "experience" | "salary" | "culture" | "location" | "other",
      "description": string
    }
  ],
  "skillGaps": [string],       // Skills from vacancy that candidate might lack
  "salaryAssessment": {
    "isCompetitive": boolean,
    "marketRange": string,     // e.g., "100-150k RUB for this level"
    "negotiationTips": [string]
  },
  "companyRedFlags": [string], // Any concerns about the company or vacancy
  "recommendedProfile": string, // Which of candidate's profiles fits best
  "confidence": "high" | "medium" | "low" // How confident is this assessment
}

RULES:
- Be honest about mismatches, don't sugarcoat
- Consider Russian job market specifics
- If salary is not specified, note it as a risk
- If experience requirements exceed candidate's, flag it
- Check for vague descriptions, unrealistic requirements, or suspicious patterns
- Consider career progression: is this a step up, lateral, or step down?

USER PROMPT:
Vacancy:
Title: {{job.title}}
Company: {{job.company.name}}
Salary: {{job.salary || "Not specified"}}
Location: {{job.location.city}} (Remote: {{job.location.remote}}, Hybrid: {{job.location.hybrid}})
Experience required: {{job.experience}}
Skills required: {{job.skills.join(", ")}}
Description: {{job.description}}

Candidate Profile:
Desired position: {{profile.title}}
Skills: {{profile.skills.map(s => s.name + " (" + s.level + ")").join(", ")}}
Experience: {{profile.experience.map(e => e.title + " at " + e.company + " (" + e.years + " years)").join("; ")}}
Desired salary: {{profile.desiredSalary.from}}-{{profile.desiredSalary.to}} {{profile.desiredSalary.currency}}
Preferred locations: {{profile.preferredLocations.join(", ")}}
Remote preference: {{profile.remotePreference}}

Additional context: {{userNotes || "None"}}
```

### 2. Генерация сопроводительного письма

```
SYSTEM PROMPT:
You are an expert in writing compelling cover letters for the Russian job market.
Write a cover letter that is authentic, specific to the vacancy, and highlights
the candidate's relevant experience.

CRITICAL RULES:
- NEVER use generic phrases like "I am writing to apply for..." or "I found your vacancy on..."
- ALWAYS reference specific requirements from the vacancy and how the candidate meets them
- Mention 2-3 specific achievements or projects relevant to the role
- Keep it concise and impactful
- Match the tone to the company culture (startup = energetic, enterprise = professional)
- If the vacancy is in English or for an international company, write in English
- Otherwise, write in Russian

OUTPUT FORMAT:
{
  "subject": string,           // Email subject line (if applicable)
  "body": string,              // The cover letter text
  "tone": string,              // Detected tone used
  "keyPoints": [string],       // 3 key selling points highlighted
  "callToAction": string,     // Suggested next step
  "estimatedReadTime": string  // e.g., "45 seconds"
}

USER PROMPT:
Vacancy:
Title: {{job.title}}
Company: {{job.company.name}}
Company description: {{job.company.description || "Not available"}}
Key requirements: {{job.requirements.join("; ")}}
Key responsibilities: {{job.responsibilities.join("; ")}}
Required skills: {{job.skills.join(", ")}}

Candidate Profile:
{{profile.summary}}

Relevant experience:
{{profile.experience.filter(e => isRelevant(e, job)).map(e =>
  `- ${e.title} at ${e.company} (${e.years} years): ${e.achievements.join("; ")}`
).join("\n")}}

Relevant skills:
{{profile.skills.filter(s => job.skills.some(js => matchSkill(js, s.name))).map(s =>
  `- ${s.name}: ${s.level} level, ${s.yearsOfExperience || "N/A"} years`
).join("\n")}}

Letter settings:
- Tone: {{settings.tone}} (short_tg = telegram-style brief, hh_standard = formal for HH.ru, confident = assertive, brief = very short, english = English version)
- No emoji: {{settings.noEmoji}}
- No markdown: {{settings.noMarkdown}}
- No special characters: {{settings.noSpecialChars}}
- Max length: {{settings.maxLength || "unlimited"}} characters

Previous successful letters for similar roles:
{{successfulLetters.map(l => "- " + l.substring(0, 200)).join("\n") || "None available"}}
```

### 3. Классификация ответа HR

```
SYSTEM PROMPT:
Analyze the HR response and classify it. Determine the next recommended action.

OUTPUT FORMAT (JSON):
{
  "classification": "invitation" | "rejection" | "question" | "no_response" | "other",
  "confidence": number,        // 0-100
  "sentiment": "positive" | "neutral" | "negative",
  "keyPoints": [string],       // Key information extracted
  "actionRequired": string,    // What candidate should do next
  "followUpRecommended": boolean,
  "followUpTiming": string,    // e.g., "in 3 days" or "not needed"
  "draftReply": string         // Suggested reply (if applicable)
}

USER PROMPT:
Vacancy: {{job.title}} at {{job.company.name}}
Original application date: {{application.appliedAt}}
HR Response:
{{hrResponse.content}}

Candidate context: {{profile.summary}}
```

### 4. Ежедневная сводка

```
SYSTEM PROMPT:
Generate a daily job search digest. Be concise and actionable.

OUTPUT FORMAT:
{
  "summary": string,           // One-line summary
  "newVacancies": number,
  "appliedToday": number,
  "responsesToday": number,
  "strongMatches": [          // Vacancies with score >= 85
    {
      "jobId": string,
      "title": string,
      "company": string,
      "score": number,
      "whyMatch": string
    }
  ],
  "followUpsNeeded": [         // Applications needing follow-up
    {
      "jobId": string,
      "title": string,
      "daysSinceApplied": number,
      "suggestedMessage": string
    }
  ],
  "insights": [string],        // 2-3 actionable insights
  "motivation": string         // Encouraging closing remark
}
```

---

## UX/UI Структура

### 1. Content Badges (Поисковая выдача HH.ru)

```
[Карточка вакансии HH.ru]
+-------------------------------------+
| [Score: 87] [Saved] [Blacklist]     |  <- Вставлено расширением
| Senior Python Developer              |
| Yandex * Moscow * 300-500k RUB      |
| [Quick: Save] [Analyze] [Letter]    |
+-------------------------------------+
```

**Цветовая схема бейджей:**
- Score 85-100: Зелёный фон
- Score 70-84: Жёлтый фон
- Score 50-69: Оранжевый фон
- Score <50: Красный фон
- Статус applied: Синий бейдж
- Статус blacklist: Серый бейдж с зачёркиванием

### 2. Side Panel (Страница вакансии)

```
+-----------------------------------------+
| CareerSignal Copilot              [X]   |
+-----------------------------------------+
|                                         |
| +-------------------------------------+ |
| | Match Score: 87/100          [AI]  | |
| | ████████████████████░░░             | |
| |                                     | |
| | [OK] Great skill match             | |
| | [OK] Salary in range               | |
| | [WARN] More experience required    | |
| +-------------------------------------+ |
|                                         |
| +-------------------------------------+ |
| | Vacancy                             | |
| | Title: Senior Python Developer      | |
| | Company: Yandex                     | |
| | Salary: 300-500k RUB                | |
| | Location: Moscow, remote            | |
| | Experience: 3-6 years             | |
| | Skills: Python, Django, PostgreSQL  | |
| | [Open on HH.ru]                     | |
| +-------------------------------------+ |
|                                         |
| +-------------------------------------+ |
| | Cover Letter                        | |
| | [Generate AI]                       | |
| |                                     | |
| | [Letter text...                     | |
| |  ...editable field]                 | |
| |                                     | |
| | [Save] [Copy]                       | |
| | [Letter Settings]                   | |
| +-------------------------------------+ |
|                                         |
| +-------------------------------------+ |
| | Status                              | |
| | [New] [Saved] [Applied] ...         | |
| |                                     | |
| | [Save vacancy]                      | |
| | [Export] [Settings]                 | |
| +-------------------------------------+ |
|                                         |
| [Open Dashboard]                        |
+-----------------------------------------+
```

### 3. Popup (Иконка расширения)

```
+-----------------------------+
| CareerSignal                |
+-----------------------------+
|                             |
| Today:                      |
| * Viewed: 12                |
| * Saved: 5                  |
| * Applied: 2                |
| * HR responses: 1            |
|                             |
| Strong matches: 3           |
| [View ->]                   |
|                             |
| --------------------------- |
|                             |
| Quick actions:              |
| [Dashboard] [Settings]      |
| [AI API Keys]               |
|                             |
| --------------------------- |
| v1.0.0 | [?] Help           |
+-----------------------------+
```

### 4. Dashboard / Settings Page

**Вкладки:**
1. **Dashboard** — статистика, графики, воронка
2. **Vacancies** — таблица/карточки с фильтрами
3. **Profiles** — управление профилями кандидата
4. **Letters** — библиотека сопроводительных писем
5. **AI Settings** — API keys, модели, лимиты
6. **n8n Webhook** — настройка интеграции
7. **Export** — CSV/JSON экспорт
8. **About** — версия, лицензия, privacy policy

---

## Security & Privacy Model

### Permissions (Manifest V3)

```json
{
  "manifest_version": 3,
  "name": "CareerSignal HH Copilot",
  "version": "1.0.0",
  "permissions": [
    "storage",
    "activeTab",
    "sidePanel"
  ],
  "optional_permissions": [
    "clipboardWrite"
  ],
  "host_permissions": [
    "https://hh.ru/*",
    "https://*.hh.ru/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://hh.ru/vacancy/*", "https://hh.ru/search/vacancy*"],
      "js": ["content-scripts/vacancy-page.js"],
      "run_at": "document_idle"
    }
  ]
}
```

**Принцип минимальных прав:**
- Нет `tabs` permission (только `activeTab`)
- Нет `webRequest` (не нужен для MVP)
- Нет `background` scripts с широкими правами
- Нет доступа к cookies HH.ru
- Нет доступа к другим сайтам

### Local Storage Security

```typescript
// IndexedDB encryption для sensitive данных
// (опционально, для паролей API keys)

interface StorageSecurity {
  // API keys хранятся в chrome.storage.local с encryption
  apiKeys: {
    openai?: EncryptedString;
    deepseek?: EncryptedString;
    openrouter?: EncryptedString;
  };

  // Вакансии — не encrypted, но local-only
  jobs: Job[];

  // Настройки — chrome.storage.sync (encrypted если sensitive)
  settings: Settings;
}

// Encryption для API keys (simple AES-GCM)
async function encryptApiKey(key: string, password: string): Promise<EncryptedString>;
async function decryptApiKey(encrypted: EncryptedString, password: string): Promise<string>;
```

### AI Data Minimization

```typescript
interface AIDataPolicy {
  // Что отправляется в AI по умолчанию
  defaultFields: {
    jobTitle: true;
    jobDescription: true;        // Очищенный текст, без HTML
    jobSkills: true;
    jobSalary: true;
    jobLocation: true;
    jobExperience: true;
    profileTitle: true;
    profileSkills: true;
    profileExperience: true;
    profileSummary: true;
    userNotes: false;              // По умолчанию не отправляем
  };

  // Что НИКОГДА не отправляется
  neverSend: [
    'job.descriptionHtml',        // Полный HTML
    'job.sourceUrl',              // URL может содержать tracking
    'profile.personalInfo',       // Имя, телефон, email
    'profile.fullResumeText',     // Полное резюме
    'company.internalNotes',      // Внутренние заметки
  ];

  // Audit log
  auditLog: AIRequestLog[];
}

interface AIRequestLog {
  timestamp: string;
  model: string;
  promptTokens: number;
  fieldsSent: string[];
  userApproved: boolean;         // Пользователь явно подтвердил
}
```

### n8n Webhook Safety

```typescript
interface WebhookSecurity {
  // Валидация URL
  urlValidation: {
    allowedProtocols: ['https://'];
    blockedDomains: ['localhost', '127.0.0.1', '0.0.0.0'];
    requireHttps: true;
  };

  // Rate limiting
  rateLimit: {
    maxRequestsPerMinute: 10;
    maxRequestsPerHour: 100;
  };

  // Payload filtering
  payloadFilter: {
    includeFields: ['job.id', 'job.title', 'job.company.name', 'job.status', 'event.type'];
    excludeFields: ['job.description', 'profile.personalInfo', 'coverLetter.content'];
  };

  // Retry policy
  retryPolicy: {
    maxRetries: 3;
    backoffMs: 1000;
  };

  // Test mode
  testMode: boolean;               // Только симуляция, без реальной отправки
}
```

### Privacy Checklist

- [ ] Нет сбора данных без явного согласия
- [ ] Нет tracking, analytics без opt-in
- [ ] Нет отправки данных в third-party (кроме AI по выбору пользователя)
- [ ] Локальное хранение по умолчанию
- [ ] Возможность полного удаления всех данных
- [ ] Прозрачный privacy policy
- [ ] Нет доступа к cookies/авторизации HH.ru
- [ ] AI запросы только с явного действия пользователя
- [ ] Audit log всех AI запросов
- [ ] Возможность экспорта и удаления данных

---

## Тест-план

### Unit Tests

```typescript
// Примеры тестов

describe('HH Parser', () => {
  it('should extract vacancy ID from URL', () => {
    const url = 'https://hh.ru/vacancy/12345678';
    expect(extractVacancyId(url)).toBe('12345678');
  });

  it('should parse salary range', () => {
    const salaryText = 'от 300 000 до 500 000 ₽ на руки';
    expect(parseSalary(salaryText)).toEqual({
      from: 300000,
      to: 500000,
      currency: 'RUB',
      gross: false,
    });
  });

  it('should handle missing salary', () => {
    expect(parseSalary('')).toBeNull();
  });
});

describe('Scoring Engine', () => {
  it('should give 100 for perfect skill match', () => {
    const job = { skills: ['Python', 'Django'] };
    const profile = { skills: [{ name: 'Python', level: 'expert' }, { name: 'Django', level: 'advanced' }] };
    expect(calculateSkillsScore(job.skills, profile.skills)).toBe(100);
  });

  it('should detect blacklisted company', () => {
    const job = { company: { isBlacklisted: true } };
    const flags = detectRiskFlags(job, profile);
    expect(flags).toContainEqual(expect.objectContaining({ type: 'blacklisted_company' }));
  });
});

describe('AI Client', () => {
  it('should not send excluded fields', async () => {
    const mockFetch = jest.fn();
    await sendAIRequest(job, profile, { apiKey: 'test' });
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody).not.toHaveProperty('personalInfo');
  });
});
```

### DOM Fixtures

```
tests/fixtures/
├── hh-vacancy-v1.html          # Snapshot реальной страницы вакансии
├── hh-vacancy-v2.html          # Альтернативная версия
├── hh-search-v1.html           # Поисковая выдача
├── hh-search-no-results.html   # Пустая выдача
├── hh-vacancy-archived.html    # Архивная вакансия
└── hh-vacancy-no-salary.html   # Вакансия без зарплаты

// Обновление fixtures
// 1. Открыть страницу на HH.ru
// 2. Сохранить HTML (без личных данных)
// 3. Заменить sensitive данные на placeholder'ы
// 4. Добавить в репозиторий
```

### E2E Tests (Playwright)

```typescript
// tests/e2e/vacancy-page.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Vacancy Page', () => {
  test.beforeEach(async ({ context }) => {
    // Загрузить расширение
    await context.addInitScript({ path: './dist/content-scripts/vacancy-page.js' });
  });

  test('should extract vacancy data', async ({ page }) => {
    await page.goto('file://' + path.resolve('./tests/fixtures/hh-vacancy-v1.html'));

    // Ждём инициализации content script
    await page.waitForSelector('[data-cs-ext="vacancy-panel"]');

    // Проверяем извлечённые данные
    const title = await page.locator('[data-cs-field="title"]').textContent();
    expect(title).toBeTruthy();
  });

  test('should calculate score', async ({ page }) => {
    await page.goto('file://' + path.resolve('./tests/fixtures/hh-vacancy-v1.html'));
    await page.waitForSelector('[data-cs-ext="score"]');

    const score = await page.locator('[data-cs-ext="score"]').textContent();
    expect(parseInt(score)).toBeGreaterThan(0);
  });

  test('should save vacancy to storage', async ({ page, context }) => {
    // ... тест сохранения
  });
});
```

### Ручное тестирование на HH.ru

**Чеклист ручного тестирования:**

1. **Парсинг вакансий:**
   - [ ] Открыть 10 разных вакансий
   - [ ] Проверить корректность извлечения всех полей
   - [ ] Проверить вакансии без зарплаты
   - [ ] Проверить вакансии с "по договорённости"
   - [ ] Проверить удалённые/гибридные вакансии
   - [ ] Проверить вакансии на английском
   - [ ] Проверить архивные вакансии

2. **Scoring:**
   - [ ] Создать профиль с конкретными навыками
   - [ ] Проверить scoring для 20 вакансий
   - [ ] Проверить корректность risk flags
   - [ ] Проверить рекомендации

3. **AI интеграция:**
   - [ ] Протестировать с DeepSeek
   - [ ] Протестировать с OpenAI
   - [ ] Протестировать с OpenRouter
   - [ ] Проверить обработку ошибок API
   - [ ] Проверить лимиты токенов

4. **Storage:**
   - [ ] Сохранить 100+ вакансий
   - [ ] Проверить производительность
   - [ ] Проверить экспорт CSV/JSON
   - [ ] Проверить удаление

5. **UX:**
   - [ ] Проверить на разных разрешениях
   - [ ] Проверить с отключенным AI
   - [ ] Проверить с пустым профилем
   - [ ] Проверить производительность

---

## Roadmap (Один разработчик)

### Неделя 1-2: Foundation

**Цель:** Работающий парсер + storage + базовый UI

- [ ] Настройка проекта (WXT + Solid.js + Tailwind + Dexie)
- [ ] Создание content script для страницы вакансии
- [ ] Парсер DOM HH.ru (title, company, salary, location, skills, description)
- [ ] IndexedDB schema (Job, Company)
- [ ] Side panel UI (базовый)
- [ ] Сохранение/загрузка вакансий
- [ ] Базовые статусы (new, saved, applied)

**Результат:** Можно открыть вакансию, увидеть данные, сохранить.

### Неделя 3-4: Scoring & AI

**Цель:** Rule-based scoring + AI интеграция

- [ ] Профиль кандидата (один, hardcoded)
- [ ] Rule-based scoring engine
- [ ] Отображение score в side panel
- [ ] AI client (DeepSeek/OpenAI/OpenRouter)
- [ ] AI-анализ по кнопке
- [ ] Генерация сопроводительного письма
- [ ] Сохранение писем

**Результат:** Можно получить score и сгенерировать письмо.

### Неделя 5-6: Polish & Search

**Цель:** Поисковая выдача + экспорт + настройки

- [ ] Content script для поисковой выдачи
- [ ] Бейджи на карточках вакансий
- [ ] Быстрое сохранение из поиска
- [ ] Экспорт CSV/JSON
- [ ] Страница настроек
- [ ] AI API keys management
- [ ] Privacy settings

**Результат:** Полноценный MVP-1.

### Неделя 7-8: Profiles & Templates

**Цель:** Множественные профили + шаблоны писем

- [ ] Менеджер профилей (CRUD)
- [ ] AI-рекомендация профиля
- [ ] Шаблоны писем (5 режимов)
- [ ] Настройки писем (emoji, markdown, length)
- [ ] Библиотека писем

**Результат:** MVP-2 + MVP-3.

### Неделя 9-10: n8n Integration

**Цель:** Webhook + события

- [ ] Настройка webhook URL
- [ ] События: vacancy_saved, status_changed, ai_analysis_complete
- [ ] Тест webhook
- [ ] Retry logic
- [ ] Payload filtering

**Результат:** MVP-4.

### Неделя 11-12: Response Tracking

**Цель:** Мониторинг откликов

- [ ] Парсер страницы "Мои отклики"
- [ ] Классификация ответов HR
- [ ] Follow-up reminders
- [ ] Telegram через n8n

**Результат:** MVP-5.

### Неделя 13-14: Release Prep

- [ ] Полное ручное тестирование
- [ ] Подготовка к Chrome Web Store
- [ ] Privacy policy
- [ ] Документация
- [ ] Landing page

---

## ToS / Бан / Антибот-риски

### Анализ рисков

| Риск | Вероятность | Ущерб | Митигация |
|------|------------|-------|-----------|
| Бан аккаунта HH.ru пользователя | Средняя | Критический | Никакой автоматизации взаимодействия |
| Блокировка расширения в CWS | Низкая | Критический | Соблюдение ToS, no automation |
| Юридические претензии | Низкая | Высокий | Privacy-first, no data collection |
| Детекция как бот | Средняя | Высокий | User-initiated actions only |
| Изменение DOM HH.ru | Высокая | Средний | Graceful degradation, быстрые обновления |

### Безопасный подход

**Что НЕ делать:**
- ❌ Автоматическая отправка откликов
- ❌ Массовый scraping
- ❌ Обход капчи
- ❌ Имитация человеческого поведения
- ❌ Использование API HH.ru (если нет официального доступа)
- ❌ Подмена User-Agent
- ❌ Использование прокси для обхода rate limits

**Что делать:**
- ✅ Только чтение открытой страницы
- ✅ Пользователь явно сохраняет каждую вакансию
- ✅ Никакого background scraping
- ✅ Никакого взаимодействия с формами HH.ru
- ✅ Rate limiting на AI запросы (не на HH.ru)
- ✅ Graceful degradation при изменении DOM

### ToS HH.ru (ключевые пункты)

1. **Запрет автоматизированного сбора данных** — парсинг без согласия запрещён.
2. **Запрет использования ботов** — автоматизированные действия запрещены.
3. **Интеллектуальная собственность** — данные вакансий принадлежат HH.ru.

**Митигация:**
- Расширение — это инструмент для пользователя, аналогично bookmarklet.
- Пользователь сам решает, какие вакансии сохранять.
- Нет массового сбора, нет redistribution.
- Данные хранятся локально, не передаются третьим лицам.

### Рекомендация

**До запуска автоматизации откликов:**
1. Проконсультироваться с юристом по ToS HH.ru.
2. Рассмотреть партнёрство с HH.ru (API доступ).
3. Альтернатива: не автоматизировать отправку, а только подготавливать.

---

## Финальная рекомендация

### Лучший первый MVP

**Название:** CareerSignal Job Tracker

**Core функциональность (4-6 недель):**
1. 📋 Парсинг страницы вакансии HH.ru
2. 💾 Сохранение в локальную базу
3. 📊 Rule-based match score
4. 🤖 AI-анализ по кнопке (BYOK)
5. ✉️ Генерация сопроводительного письма
6. 🏷️ Статусы отслеживания
7. 📤 Экспорт CSV/JSON

**Что НЕ входит в первый MVP:**
- ❌ Автоматизация откликов (любая форма)
- ❌ Интеграция с поисковой выдачей
- ❌ n8n webhook
- ❌ Множественные профили
- ❌ AI без ключа (всегда BYOK)
- ❌ Автоматический AI-анализ

**Почему это лучший MVP:**
1. **Безопасность** — нет риска бана на HH.ru
2. **Скорость** — 4-6 недель вместо 3-4 месяцев
3. **Ценность** — пользователь сразу получает пользу
4. **Валидация** — можно проверить спрос до сложных фич
5. **Фундамент** — архитектура готова для расширения

**Следующие шаги после MVP:**
1. Собрать feedback от 50-100 пользователей
2. Проверить ToS HH.ru с юристом
3. Добавить поисковую выдачу (MVP-2)
4. Добавить профили (MVP-3)
5. Только потом рассматривать автоматизацию

---

## Список конкретных улучшений для ТЗ

1. **Переименовать продукт** с "Copilot" на "Tracker" или "Assistant" для снижения рисков восприятия как бота.

2. **Убрать все формы автоматизации откликов** из MVP-1, MVP-2, MVP-3. Перенести в отдельную V2 с юридической проверкой.

3. **Добавить явное согласие пользователя** на парсинг каждой вакансии (кнопка "Сохранить" вместо авто-сбора).

4. **Добавить монетизацию** — freemium модель с AI-фичами за подписку.

5. **Добавить graceful degradation** — если DOM HH.ru изменился, расширение не ломается, а показывает fallback UI.

6. **Добавить версионирование парсера** — v1, v2 и т.д. для быстрого обновления при изменении HH.ru.

7. **Добавить audit log** для всех AI-запросов с возможностью просмотра пользователем.

8. **Добавить offline mode** — работа без AI (только rule-based scoring).

9. **Добавить data minimization settings** — пользователь выбирает, какие поля отправлять в AI.

10. **Добавить rate limiting** для AI-запросов (не для HH.ru).

11. **Добавить A/B тестирование писем** — сравнение разных версий с tracking ответов HR.

12. **Добавить skill synonym dictionary** — Python/Python3/Питон и т.д.

13. **Добавить company blacklist/whitelist** — с интеграцией в scoring.

14. **Добавить suspicious vacancy detection** — автоматическое обнаружение подозрительных вакансий.

15. **Добавить export encryption** — шифрование CSV/JSON при экспорте.

16. **Добавить Telegram bot** как альтернативу n8n для массовых пользователей.

17. **Добавить job market insights** — аналитика по сохранённым вакансиям (средние зарплаты, популярные навыки).

18. **Добавить interview preparation** — подготовка к собеседованию на основе вакансии.

19. **Добавить salary negotiation assistant** — советы по зарплатным переговорам.

20. **Добавить career path visualization** — визуализация карьерного пути на основе вакансий.
