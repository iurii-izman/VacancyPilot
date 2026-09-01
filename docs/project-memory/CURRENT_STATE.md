# Current State

Last runtime/code baseline reviewed: `607f8004f39ab2d810181f7fd973bbb8935e871c`

Documentation snapshot date: 2026-09-01

The baseline before this documentation-only pass is post-R5.1 plus dependency maintenance. After the pass, it remains the runtime/code baseline; documentation commits are not runtime acceptance evidence.

## Product

VacancyPilot is a local-first, user-controlled HH.ru job-search copilot for vacancy discovery/intake, deterministic triage, explainable Full V4 analysis, evidence-aware cover-letter preparation, a human-controlled application preparation queue, application tracking/follow-ups, and descriptive conversion feedback.

It is not an auto-apply bot. Browser interaction with HH remains read-only; external actions remain explicit and human-controlled.

## Accepted milestone state

- **R5 PASS:** Application Factory and bounded descriptive Conversion Intelligence are accepted and pushed. Manual browser QA passed with synthetic local data. Preview makes zero provider calls; execution requires explicit confirmation; queue preparation does not create `APPLIED`; no response remains pending; analytics are descriptive, not causal.
- **R5.1 accepted/pushed:** Project Memory Lite exists as a navigation/index layer, not a second truth store. The search-before-create protocol and current/decision/parked registers are active.
- **Dependency maintenance:** The latest dependency updates are merged. Fresh local audit on this snapshot reports 3 high and 1 moderate advisory in the pnpm graph; GitHub Dependabot exposes 2 open alerts. This is recorded fact, not a claim that the audit is clean. No dependency upgrade is part of this documentation pass.

## Runtime surfaces

### Standalone extension

WXT / Manifest V3 / TypeScript / React with read-only DOM parsing on user-opened HH pages. Dexie/IndexedDB is the canonical domain store; `chrome.storage.local` holds settings, small state, badge state, companion client token, and the standalone extension BYOK provider path.

### Ops Mode

The paired extension talks to a loopback-only FastAPI companion. SQLite is canonical in Ops Mode; Dexie is cache/outbox/sync metadata. The companion uses the OS keyring for its HH/Ops/provider secrets, loads the private V4 engine package from local disk, exposes generated OpenAPI, and performs official HH API reads. There is no developer-operated cloud backend or sync service.

Current HH capability reality is represented honestly: account `AVAILABLE`, resumes `DENIED_BY_HH`, negotiations `DENIED_BY_HH`, and writes `FORBIDDEN_BY_PRODUCT`.

## Binding safety and privacy invariants

- No auto-submit, auto-apply, auto-click, HH form writes, synthetic HH form events, hidden HH page/private-endpoint requests, CAPTCHA bypass, cookie/password/session handling, external recruiter/follow-up sending, or developer telemetry by default.
- Full V4 candidate knowledge is private local input and is not committed to the repository. Generated text is never evidence.
- AI is opt-in and previewed. Standalone BYOK keys remain in `chrome.storage.local` with a warning; companion secrets use the OS keyring.
- Export/delete controls and retention scope must distinguish browser-managed data from companion SQLite, keyring and local engine data; uninstalling the extension does not imply deletion of companion data.

## Operating mode

**FEATURE DEVELOPMENT: FROZEN**
**MODE: REAL DAILY USE / DOGFOOD**

The next operational step is to process real vacancies and applications and collect repeated friction, quality, token/cost, provenance and conversion evidence. The next feature milestone is selected from that evidence; it is not automatically EPIC-31, ITER-060, AOPS-14 or full AOPS-15.

## Deferred and incomplete

- AOPS-14 Interview Pack: deferred, not started.
- Full canonical AOPS-15 analytics/production pilot: incomplete; only the bounded R5 slice is accepted.
- AOPS-16, AOPS-17 and AOPS-18: not active during the dogfood freeze.
- `n8n` / Telegram: deferred pending an explicit permission-model decision.
- Public release, backup/recovery redesign, V4.1 and new providers: separate backlog or later decision.

## Navigation

Use [`README.md`](../../README.md) for the external product story, [`IMPLEMENTATION_STATUS.md`](../development/application-ops/IMPLEMENTATION_STATUS.md) for implementation evidence, [`R5_DAILY_USE_READINESS.md`](../development/application-ops/r5/R5_DAILY_USE_READINESS.md) for daily operation, [`docs/ROADMAP.md`](../ROADMAP.md) for current planning, and the master [specification](../Техническое%20заданиеV.1.md) for product boundaries.
