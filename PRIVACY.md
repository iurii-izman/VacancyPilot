# VacancyPilot Privacy Policy

Effective date: 2026-09-01
Last updated: 2026-09-01
Version: 0.2

This policy describes the public VacancyPilot extension and its optional local loopback companion. VacancyPilot has no developer-operated cloud backend, cloud sync service or developer telemetry by default.

## Summary

- VacancyPilot is local-first and user-controlled, but data may live in the browser and, when Ops Mode is enabled, in the user’s local companion SQLite database.
- Standalone Mode uses Dexie/IndexedDB for domain data and `chrome.storage.local` for settings, small state and the standalone BYOK provider path.
- Ops Mode uses a paired loopback-only FastAPI companion. SQLite is canonical there; companion secrets are stored in the OS keyring and the private V4 engine package stays on local disk.
- HH browser-page access is read-only DOM inspection of pages the user opened. Official HH API reads, when configured, are made by the local companion.
- OpenAI requests happen only after an explicit AI action and payload review. The user’s provider terms and privacy policy apply.
- VacancyPilot does not auto-apply, auto-click, write HH forms, send recruiter/follow-up messages, or bypass CAPTCHA/antibot controls.

## Data Stored Locally

The extension may store vacancy data, search profiles, profiles and resume highlights supplied by the user, scores and analysis results, cover-letter drafts and versions, application statuses/events/follow-ups, local cache and outbox records, and UI/settings state.

### Standalone Mode

- Dexie/IndexedDB is the canonical domain store.
- `chrome.storage.local` stores application settings, small/badge state, the paired companion client token when used, and standalone BYOK API keys.
- Standalone API keys are stored separately from IndexedDB and exports, but browser local storage is not a secure vault; the UI warns users to use a minimally scoped key.

### Ops Mode

- The loopback companion stores its canonical operational records in local SQLite, including applications, events, snapshots, engine runs, evidence usage, letters, follow-ups and Search Profiles as defined by the accepted data model.
- Companion HH/OAuth/provider secrets and pairing material are handled by the OS keyring. The companion stores only hashed client-token material in SQLite.
- The private V4 engine package and real candidate knowledge are loaded from local disk and are not part of this public repository.
- Local logs/cache contain only the data implemented by the current companion; secrets and authorization headers are redacted or excluded by the runtime.

## Data Not Collected

VacancyPilot does not collect developer telemetry, advertising identifiers, browsing history outside its active product use, HH browser cookies, HH passwords or browser session secrets. It does not intentionally collect data from non-HH sites as part of the core flow.

## External Connections

### HH browser pages

Content scripts inspect visible DOM on user-opened HH pages. They do not make hidden fetch/XHR requests to HH, click HH controls, write form values or read cookies/session state.

### Official HH API

When the user configures the optional companion integration, the local companion may call official `api.hh.ru` read endpoints for account, vacancy/search and permitted applicant data. The current capability matrix is honest: account `AVAILABLE`, resumes `DENIED_BY_HH`, negotiations `DENIED_BY_HH`, and writes `FORBIDDEN_BY_PRODUCT`. There is no fallback to scraping or private endpoints. HH OAuth/application credentials are kept on the companion side in the OS keyring where implemented.

### AI providers

An explicit user-confirmed AI action may send a reviewed, redacted payload to the configured provider. Standalone AI uses the extension’s OpenAI BYOK path and its local key storage; Ops Mode Full V4 uses the local companion and its OS-keyring provider secret. Payload preview, redaction and Strict Privacy behavior apply as implemented. Raw HH HTML, cookies, tokens, email addresses, phone numbers and URLs are not sent by the supported redaction path. Generated text is not promoted to evidence.

### n8n / other webhook integrations

n8n remains an opt-in Labs/deferred integration, not the current default operating path. If a user explicitly enables an existing n8n flow, events go to the user-configured webhook rather than a developer endpoint; the user is responsible for that destination. It must not be described as external recruiter or follow-up sending.

## User Controls and Retention

The extension provides export and deletion controls for browser-managed data, AI cache controls and AI/Labs toggles. Export excludes API keys and other secret material. The extension’s `Delete All Data` clears its Dexie tables and known extension storage keys, including standalone API keys and badge state; it does not delete unknown browser storage keys.

Ops Mode companion SQLite data, OS-keyring secrets and local engine files are separate local resources. The current extension delete action does not imply deletion of those companion resources; manage or remove them through the companion’s documented local storage procedures. Uninstalling the extension may remove browser-managed storage but does not necessarily remove companion SQLite, keyring or engine data.

Data remains locally until the user deletes it, clears the relevant browser/companion storage, or removes the relevant local resources. There is no developer-side backup or cloud retention. Export before deletion when a copy is wanted.

## Permissions and Security

The extension declares `storage`, `sidePanel` and `activeTab`, with no broad install-time host permissions. Optional runtime host access is narrowly scoped to OpenAI and the loopback companion. The companion binds only to loopback and uses paired client authentication, strict extension-origin CORS, SQLite constraints, generated OpenAPI and OS keyring integration.

No remote code, external scripts or developer backend are loaded into the extension runtime. See [`SECURITY.md`](SECURITY.md) for the security boundary and reporting process.

## Children and Policy Changes

VacancyPilot is not directed at children. Material policy changes will be reflected in this repository and, where relevant, onboarding or release notes.

## Contact

For general questions, use [GitHub Issues](https://github.com/iurii-izman/VacancyPilot/issues). For sensitive security matters, use [GitHub Security Advisories](https://github.com/iurii-izman/VacancyPilot/security/advisories/new).
