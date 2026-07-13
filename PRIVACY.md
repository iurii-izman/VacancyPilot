# VacancyPilot Privacy Policy

Effective date: 2026-06-22
Last updated: 2026-06-22
Version: 0.1

VacancyPilot is a local-first browser extension for HH.ru vacancy analysis, tracking, and writing assistance. This policy covers the VacancyPilot extension itself. It does not cover any separate developer website or backend because VacancyPilot does not operate one.

## Summary

- VacancyPilot stores its main data locally in your browser.
- VacancyPilot does not send data to developer-operated servers.
- External requests happen only when you explicitly use optional integrations such as AI.
- VacancyPilot does not auto-apply, auto-click HH controls, or access HH cookies or session data.

## What Data VacancyPilot Stores Locally

VacancyPilot may store the following on your device:

- vacancy data from HH.ru pages you open, such as title, company, salary, skills, URL, and extracted plain-text description;
- your local job-search history, statuses, and timestamps;
- your profiles, preferences, and resume highlights that you enter yourself;
- cover letters and draft content generated or edited in the extension;
- settings such as privacy mode, AI controls, UI preferences, and Labs toggles;
- AI cache entries for results you requested;
- local event and workflow records used by the extension UI.

Storage is implemented through IndexedDB and `chrome.storage.local`.

## What VacancyPilot Does Not Collect

VacancyPilot does not collect:

- HH.ru login credentials, cookies, tokens, or session secrets;
- browsing history outside the extension's active use on HH.ru pages;
- telemetry, analytics, crash reporting, advertising identifiers, or tracking profiles by default;
- data from non-HH.ru websites as part of the core product flow.

## When Data Is Sent Externally

### AI provider requests

If you enable AI features and explicitly start an AI action, VacancyPilot may send a reviewed payload to your chosen provider.

This is limited by the product's safety model:

- you configure the provider and your own API key;
- the extension shows a payload preview before sending;
- emails, phone numbers, and URLs are redacted before external requests;
- Strict Privacy mode can exclude vacancy description text and resume highlights;
- raw HH page HTML is not sent.

For the current implementation, the supported real provider is OpenAI through the runtime origin `https://api.openai.com/*`. You are responsible for reviewing your provider's terms and privacy policy.

### Other external integrations

The project keeps webhook automation and related external delivery out of the current public-ready path. If such integrations are enabled in a future build, they remain opt-in and must be explicitly disclosed in the relevant release notes and settings.

## Permissions

VacancyPilot currently declares these core permissions:

- `storage`
- `sidePanel`
- `activeTab`

VacancyPilot does not request broad host permissions at install time. The current optional runtime host access is narrowly scoped to OpenAI for user-confirmed AI requests.

## User Controls

You can:

- export your data as JSON or CSV;
- delete all local data;
- disable AI features;
- clear AI cache through extension settings;
- hide the page badge;
- remove the extension entirely.

Uninstalling the extension removes extension-managed local storage from your browser profile.

## Data Retention

VacancyPilot keeps data on your device until you delete it, clear browser extension storage, or uninstall the extension. VacancyPilot does not provide cloud sync or developer-side backups.

## Security Notes

- API keys are stored locally in `chrome.storage.local`.
- The extension warns that browser local storage is not a secure vault.
- API keys are not exported with project data.
- VacancyPilot does not load remote code into the extension runtime.

## Children's Privacy

VacancyPilot is not directed at children.

## Policy Changes

If this policy changes materially, the updated version will be published in the repository and may also be referenced from release notes or onboarding content.

## Contact

For general project questions, use the repository issue tracker: [GitHub Issues](https://github.com/VacancyPilot/VacancyPilot/issues)
For sensitive security matters, use: [GitHub Security Advisories](https://github.com/VacancyPilot/VacancyPilot/security/advisories/new)
