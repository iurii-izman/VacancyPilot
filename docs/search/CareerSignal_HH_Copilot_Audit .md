Executive summary
CareerSignal HH Copilot — правильная идея, но в текущем виде она пытается сделать слишком много автоматизации слишком рано. Главный риск: HH.ru жёстко банит за массовые отклики и любые скрипты, которые кликают за пользователя. Поэтому первый MVP должен быть не «ботом для откликов», а read-only ассистентом для принятия решений.

Сильная версия: локальный copilot, который читает вакансию, считает rule-based score, готовит письмо по кнопке, хранит историю в IndexedDB и шлёт события в n8n только с явного разрешения. Автоклик и очередь — это MVP-4, не MVP-1.

Что в концепции сильное
Local-first + BYOK AI. Пользователь контролирует ключи и данные.
Гибридный скоринг: быстрый rule-based всегда, AI — опционально.
Менеджер профилей под разные роли. Это решает главную боль HH: разные резюме под разные вакансии.
Экспорт CSV/JSON и webhook в n8n — сразу встраивается в твой стек автоматизации.
Chromium-first, Manifest V3, WXT, TypeScript — современный стек. WXT даёт поддержку всех браузеров, MV2 и MV3, HMR и файловую структуру entrypoints.
Что опасно или спорно
Противоречие приоритетов. Ты ставишь «не получить бан» на первое место, но уже в MVP-3 планируешь подстановку текста в форму HH. Любой programmatic click или fill — это триггер антибота.
Хранение полного HTML. В ТЗ «по умолчанию сохранять структурированные поля + очищенный текст». Хорошо. Но «полный HTML только в debug» — риск утечки персональных данных и нарушения ToS.
AI по умолчанию отправляет данные наружу. DeepSeek/OpenRouter — это передача описания вакансии третьей стороне. Без явного opt-in и минимизации — нарушение приватности.
Скоринг >=85 = сильная вакансия. Порог без калибровки даст ложные срабатывания и спам в Telegram.
Стек Solid.js или React. Выбор на старте замедлит. Нужен один.
Отсутствие анти-dedup. HH часто дублирует вакансии. Без нормализации по company+title+hash описания будет мусор в истории.
Permissions. Если запросишь <all_urls> или hh.ru/* на старте, пользователи испугаются, а ревью Chrome Web Store будет строже.
Исправленная стратегия
Сделать Job Search Copilot, а не Job Application Bot.

Три принципа:

Read first, write later. MVP-1 и MVP-2 только читают DOM, ничего не кликают.
User in the loop. Любое действие, которое меняет состояние на HH, требует физического клика пользователя.
Privacy by default. AI выключен, webhook выключен, данные локально.
Продуктовая формула: 70% — помощь в отборе, 20% — подготовка письма, 10% — трекинг.

MVP scope — пересборка
MVP-1 (2 недели): Read-only Copilot

Content script на странице вакансии hh.ru/vacancy/*
Извлечение: title, company, salary_from/to/currency, city, remote/hybrid/office, experience, employment, schedule, skills, description_clean, url, vacancy_id
Локальное сохранение в IndexedDB/Dexie
Статусы: new, viewed, saved, rejected_by_me, blacklist
Rule-based score 0-100
Рекомендация: откликаться / подумать / пропустить + 3 причины fit, 3 риска
Выбор профиля кандидата
Генерация письма по кнопке (BYOK, локальный шаблон если AI выкл)
Экспорт JSON/CSV
Side Panel с анализом
MVP-2 (1 неделя): Поисковая выдача

Бейджи на карточках в /search/vacancy
Подсветка new/viewed/saved/blacklist
Score на карточке
Быстрое «сохранить» и «скрыть» — только локально, без клика на HH
MVP-3 (1.5 недели): Подготовка, не отправка

Popup с черновиком письма
Кнопка «Скопировать письмо»
Кнопка «Открыть отклик на HH» — открывает форму, не заполняет
Сохранение финального письма + выбор резюме
MVP-4 (после валидации): Полуавто

Кнопка «Вставить письмо» — только после user gesture, через clipboard paste
Очередь с ручным подтверждением каждого шага
Webhook в n8n: applied, hr_replied (ручной ввод)
MVP-5 (позже): Ответы HR

Парсинг страницы откликов, классификация ответа
Напоминания follow-up
Что точно не делать в MVP-1:

Автоотправка откликов, автозаполнение форм
Скрапинг списком в фоне
Хранение полного HTML
Отправка данных в AI без явного клика
Синхронизация в облако
Поддержка LinkedIn/Indeed — фокус только HH
Архитектура
WXT + Manifest V3 + TypeScript + React (выбирай React — больше примеров, проще найти dev).

Структура:

content-script/vacancy.ts — парсер страницы вакансии
content-script/search.ts — бейджи в выдаче
side-panel/ — React UI для анализа
background/service-worker.ts — хранение настроек, webhooks, rate-limit
popup/ — быстрые действия
lib/db.ts — Dexie схемы
lib/scoring.ts — rule-based
lib/ai.ts — адаптеры DeepSeek/OpenAI/OpenRouter с BYOK
lib/n8n.ts — очередь событий
Почему так: content scripts изолированы, не трогают page JS HH, что снижает риск детекта. Background не делает network запросов к HH, только к AI/n8n по явному действию.

Data model
Таблица

Поля

Job

id (hh_vacancy_id), url, title, company_id, salary_from, salary_to, currency, city, remote_type, experience, employment, schedule, skills[], description_clean, description_hash, source, first_seen_at, last_seen_at, status

Company

id, name, hh_id, industry, size, blacklist_reason

Profile

id, name, target_roles[], skills[], years_exp, languages[], location_pref, remote_pref, salary_expectation, summary

Resume

id, profile_id, hh_resume_id, title, url, last_used_at

Application

id, job_id, profile_id, resume_id, cover_letter_id, status, applied_at, source

CoverLetter

id, job_id, profile_id, template, body, length_mode, tone, created_at, ai_model

Event

id, type, job_id, payload_json, sent_to_n8n_at, created_at

Ключи: description_hash = sha256(clean_text) для дедупликации. company_id нормализуется по нижнему регистру.

Rule-based scoring модель для HH
База 50 баллов, затем:

Title match: +20 если в title есть хотя бы 1 ключевое слово из Profile.target_roles
Skills overlap: +1 за каждый совпадающий навык, max +25
Experience fit: +15 если опыт вакансии <= years_exp +1, -10 если требуется больше на 3+ года
Salary: +10 если salary_from >= expectation*0.9, -15 если <0.7
Location: +10 если remote_pref совпадает, -5 если офис в другом городе
Stop-words: -20 если «холодные звонки», «поиск клиентов», «MLM», «стажировка без оплаты»
Company blacklist: -100
Свежесть: +5 если вакансия <3 дней
Итог 0-100. Рекомендация:

=80: откликаться

60-79: подумать
<60: пропустить
Причины fit/risk генерируются из сработавших правил.

UX/UI структура
Content badges: в выдаче маленький чип справа от заголовка: [CS 84] зелёный, синий, серый[saved][blacklist]
Side Panel: открывается по иконке расширения. Вкладки: Анализ, Письмо, История, Профиль
Popup: компактно — текущий score, кнопка «Анализировать», «Сохранить», «Скопировать письмо»
Dashboard (options page): таблица всех вакансий с фильтрами по статусу, экспорт, настройки AI и n8n
Всё работает без перезагрузки страницы HH.

AI prompt templates
Анализ вакансии (кнопка, BYOK)

Code
System: Ты senior рекрутер. Отвечай строго JSON.
User: Профиль кандидата: {profile.summary}, навыки: {profile.skills}, опыт: {profile.years_exp} лет, ожидания: {salary}, локация: {location_pref}.
Вакансия HH: Title: {job.title}, Company: {job.company}, Описание: {job.description_clean до 3000 символов}, Навыки: {job.skills}.
Задача: оцени fit 0-100, дай 3 причины fit, 3 риска, рекомендуемый профиль, и verdict: apply/consider/skip. Верни JSON {score, fit_reasons[], risks[], recommended_profile, verdict}.
Генерация письма

Code
System: Пиши сопроводительное для HH.ru. Без эмодзи, без markdown, до {max_chars} символов, тон: {tone}.
User: Вакансия: {job.title} в {job.company}. Требования: {job.skills}. Профиль: {profile.summary}. Достижения релевантные: {profile.achievements}. Пиши на {lang}. Не выдумывай факты.
Минимизация данных: отправляй только очищенный текст, без URL, без ID.

Privacy/security модель
Permissions минимальные: activeTab, storage, sidePanel, scripting. Host permissions только https://hh.ru/* — запрашивай опционально через optional_host_permissions при первом использовании.
Хранение: IndexedDB через Dexie (local), chrome.storage.sync только для настроек. Шифруй API ключи через chrome.storage.session.
AI: выключен по умолчанию. При включении — показывать предупреждение «данные вакансии будут отправлены в {provider}».
n8n webhook: только HTTPS, пользователь вставляет URL сам, тестовая отправка с подтверждением.
Нет телеметрии. Нет аналитики. Экспорт — явная кнопка.
Content Security Policy строгая, никаких remote scripts.
Риски ToS/банов и mitigations
HH.ru запрещает автоматизированные действия, массовые отклики и скрапинг. Хотя точный текст недоступен из поиска, практика рынка: бан за >30 откликов в час, за скрипты заполнения форм, за частые запросы к API.

Безопасный подход:

Никогда не кликай «Откликнуться» программно. Только window.open(url) по клику пользователя.
Не заполняй textarea через content script в MVP-1/2. В MVP-4 делай paste через clipboard, после user gesture.
Rate-limit: не больше 1 анализа в 2 секунды, не делай фоновый обход выдачи.
Не обходи Cloudflare или капчу. Если HH показывает капчу — останавливайся.
Имитируй человека: никаких очередей автоотправки ночью.
В описании расширения пиши: «CareerSignal не отправляет отклики автоматически. Все действия выполняются пользователем».
Тест-план
Unit: scoring.ts — 30 тестов на разные вакансии, парсер salary «от 200 000 до 300 000 ₽»
DOM fixtures: сохрани 5 реальных страниц HH (вакансия IT, без зарплаты, удалёнка, стажировка, закрытая) в /tests/fixtures, тестируй парсер
E2E: Playwright с расширением, тест: открыть hh.ru/vacancy/123, проверить side panel, score >0
Ручное: 20 вакансий в день 3 дня, проверь ложные срабатывания blacklist, проверь экспорт
Roadmap для одного разработчика
Неделя 1: WXT init, парсер вакансии, Dexie схема, side panel UI
Неделя 2: rule-based scoring, профили, генерация письма локально, экспорт
Неделя 3: бейджи в выдаче, подсветка, popup
Неделя 4: BYOK AI интеграция, prompt templates, настройки n8n webhook
Неделя 5: полировка, тест на 50 вакансиях, подготовка к Chrome Web Store
Неделя 6+: только после фидбэка — полуавто вставка

Финальная рекомендация
Сделай MVP-1 как локальный decision copilot без записи в HH. Это даст 80% ценности: быстрый отбор, качественные письма, история. Пользователь сам кликает «откликнуться», но делает это осознанно.

Так ты не получишь бан, сэкономишь на API (rule-based бесплатно), и сможешь показать расширение друзьям без страха.

Список улучшений для ТЗ
Заменить «автоматизация откликов» на «ассистент отбора»
Добавить description_hash и дедупликацию
Зафиксировать стек: React вместо Solid.js
Определить пороги scoring после 100 реальных вакансий, не хардкодить 85
Добавить optional permissions и privacy manifest
Ввести режим «без AI» по умолчанию
Добавить blacklist по компаниям и по ключевым словам
Хранить только description_clean, не HTML
Добавить rate-limiter в background
Убрать MVP-3 авто-вставку из первой версии, перенести в MVP-4
