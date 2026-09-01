# Roadmap

## Current Mode

- R5 accepted: Application Factory plus bounded descriptive Conversion Intelligence.
- R5.1 Project Memory Lite accepted.
- Dependency maintenance complete and merged; current audit state is measured, not assumed.
- **FEATURE DEVELOPMENT: FROZEN**
- **MODE: REAL DAILY USE / DOGFOOD**

VacancyPilot is currently used with real vacancies and applications to collect evidence. It is not published as a Chrome Web Store release.

## Dogfood Objectives

Observe, with provenance:

- Search Profile yield and useful-intake rate.
- Stage A and Full V4 false positives/negatives.
- Cover-letter edit intensity and evidence quality.
- Application Factory and queue friction.
- Provider calls, token/cost behavior and cache behavior.
- Response/interview conversion signals.
- Correctness of vacancy, letter, application, status and outcome linkage.

Observation targets are roughly 2–4 weeks, 20–50 reviewed real vacancies, and 15–30 real applications if available. They are not quotas.

## Immediate Hotfix Criteria

Only unblock immediately for:

- data loss or cache corruption;
- duplicate application or incorrect `APPLIED` state;
- duplicate paid provider call;
- wrong vacancy/letter linkage or outcome/provenance;
- security or privacy defect;
- queue that cannot resume.

Log other friction and continue dogfood until the next feature decision is evidence-backed.

## Decision Gate for Next Feature Work

After the observation period, select the next milestone from repeated real friction, quality failures, cost evidence, conversion evidence or a justified operational defect. Do not treat an old epic/iteration plan as an automatic next step.

## Deferred Product Work

- **AOPS-14 Interview Pack:** deferred; on-demand only after real interview signal justifies it.
- **Full AOPS-15:** incomplete; deeper analytics and the production pilot require more real outcome evidence.
- **V4.1:** only after enough real outcomes support a scoring-policy change.
- **n8n / Telegram:** deferred; permission model must be explicitly reopened.
- **Backup/recovery and public release:** separate later work.

## Public Release Backlog

Public release is not imminent. Before any store submission, resolve the prerequisites in [`development/public-release-prerequisites.md`](development/public-release-prerequisites.md), including privacy-policy hosting, store assets, permission justification, broader browser QA, parser coverage, key-storage decision, legal review and license selection.

Because current Ops Mode uses a local loopback companion, public packaging and onboarding must establish how a store-distributed extension pairs with that companion. This is a release design/prerequisite question, not a runtime change for this pass.

## Non-Goals

- Auto-apply, auto-submit, auto-click, form writes, synthetic HH events, CAPTCHA bypass, hidden scraping, cookies or session handling.
- External recruiter/follow-up sending or developer telemetry by default.
- A developer-operated cloud backend or sync service. Optional Ops Mode uses a loopback-only local FastAPI companion with SQLite authority.
- Scheduler/background sync, new HH permissions, new AI providers, schema/API changes or release `0.2.0` during the freeze.
