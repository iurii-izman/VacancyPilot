# Private Install & Validation Guide — VacancyPilot

Status: ITER-064
Target audience: developer or early tester installing from source

This guide covers building and loading the extension for private/personal use. It does NOT cover Chrome Web Store submission.

---

## Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | >= 18 | `node --version` |
| pnpm | >= 8 | `pnpm --version` |
| Chromium browser | Chrome, Edge, Brave, or Яндекс Браузер (latest stable) | — |
| Git | any recent | `git --version` |

---

## 1. Clone and Install

```bash
git clone <repository-url> vacancy-pilot
cd vacancy-pilot
pnpm install
```

---

## 2. Verify the Build

Run the automated checks before loading the extension:

```bash
# TypeScript type checking
pnpm typecheck

# Lint
pnpm lint

# Unit and safety tests
pnpm test

# Production build
pnpm build

# Release safety tests
pnpm test:release
```

All five commands must pass. The build output is in `.output/chrome-mv3/`.

Expected current output: about **1615 tests** in the main suite and **373 release-safety tests**. Exact counts may move slightly as tests are added, but both commands must stay fully green.

---

## 3. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `.output/chrome-mv3/` directory from this project.
5. The extension "VacancyPilot" should appear in your extensions list.

---

## 3a. Load in Edge

1. Open Edge and navigate to `edge://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `.output/chrome-mv3/` directory.

---

## 3b. Load in Brave

1. Open Brave and navigate to `brave://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `.output/chrome-mv3/` directory.

---

## 3c. Load in Яндекс Браузер

1. Open Яндекс Браузер and navigate to `browser://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `.output/chrome-mv3/` directory.

---

## 4. Permissions Granted

At the current private-alpha stage, the extension requests only:

| Permission | Reason |
|------------|--------|
| `storage` | Save vacancy data, settings, and profiles locally |
| `sidePanel` | Open a side panel for the current browser window |
| `activeTab` | Read the user-opened HH.ru page after explicit user action |

There are currently no broad `host_permissions` and no `optional_permissions` in the manifest.

The current build also declares a narrow optional runtime host access for OpenAI requests: `https://api.openai.com/*`. It is not a broad install-time host permission.

---

## 5. Smoke Test After Install

1. Open any HH.ru vacancy page (e.g., `https://hh.ru/vacancy/12345678`).
2. Confirm the **VacancyPilot badge** appears on the page (small floating badge, top-right area).
3. Click the badge — the **side panel** should open with vacancy details.
4. Click the extension icon in the toolbar — the **popup** should open.
5. Click "Dashboard" from the popup — the dashboard page should open.
6. Check that no errors appear in the browser console (F12 → Console).

If the badge does not appear:
- Check that the extension is enabled in `chrome://extensions/`.
- Ensure you are on a `https://*.hh.ru/vacancy/*` URL.
- Check `chrome.storage.local` settings: `showPageBadge` must not be `false`.

---

## 6. Onboarding

On first install, the extension shows an onboarding flow that explains:
- Permissions and what data is accessed
- Storage (local-only, no cloud sync)
- AI features (opt-in, BYOK)
- n8n integration (opt-in, Labs)
- Non-goals (no auto-apply, no auto-click)

---

## 7. Quick Feature Tour

### Parse a vacancy
Navigate to any HH.ru vacancy. The extension automatically extracts title, company, salary, description, and skills. Passive HH status (applied, invitation, rejection, viewed) is also detected.

### Score a vacancy
Open the side panel. A rule-based score (0–100) is displayed with a breakdown of factors (title match, skills, experience fit, work mode, salary, company preference).

### Track application status
From the side panel or popup, change the status: Saved → Applied → Interview → Offer → Rejected → Archived. Status history is recorded with timestamps.

### Search triage (Phase 2)
On HH.ru search result pages, the extension shows quick-action badges on each vacancy card. Use **Save** or **Reject** directly from the search page without opening each vacancy.

### Queue and workflow
Use the queue view to manage your application pipeline with kanban stages. Company greylist helps you track organizations you've decided not to engage with.

### HR timeline
When an employer sends you an invitation, message, or rejection, the extension captures it on the vacancy page. Timeline entries are stored locally and linked to the corresponding job.

### AI analysis (requires API key)
1. Go to extension **Settings** → **AI**.
2. Enter your API key (OpenAI-compatible provider).
3. Configure privacy mode (Standard or Strict).
4. On a vacancy page, click **Analyze** in the side panel.
5. Review the **payload preview** before confirming.
6. AI analysis results appear in the side panel.

### Generate a cover letter
1. From the vacancy side panel, click **Cover Letter**.
2. Select mode (short / full / concise).
3. Click **Generate**.
4. Edit the generated text if needed.
5. **Save** or **Copy** the letter.

### HR follow-up drafts
From the HR workspace, draft replies and schedule follow-ups for employer communications. All drafts are stored locally.

### Export data
1. Go to extension **Settings** → **Data**.
2. Click **Export CSV** or **Export JSON**.
3. File downloads to your default download location.

### Delete all data
1. Go to extension **Settings** → **Data**.
2. Click **Delete All Data**.
3. Confirm the action.

---

## 8. Uninstalling

1. Go to `chrome://extensions/`.
2. Find "VacancyPilot".
3. Click **Remove**.
4. All local data is deleted with the extension.

To keep data before uninstalling, export first (CSV or JSON).

---

## 9. Troubleshooting

| Problem | Check |
|---------|-------|
| Badge not appearing | Only on `https://*.hh.ru/vacancy/*` or `https://*.hh.ru/search/*` pages. Check `showPageBadge` setting. |
| Search badge not appearing | Only on `https://*.hh.ru/search/vacancy*` pages. Ensure Phase 2 features are not disabled in settings. |
| Side panel not opening | Click the badge or extension icon → "Open side panel". Ensure `sidePanel` permission is granted. |
| AI request fails | Check API key in Settings. Check network connectivity. Review payload preview for errors. |
| Parser returns no data | HH page may have changed DOM. Check browser console for parser errors. Report with vacancy URL. |
| Extension crashes | Reload extension in `chrome://extensions/`. Check console for error stack traces. |

---

## 10. Updating

To update to a newer build:

```bash
git pull
pnpm install
pnpm build
```

Then:
1. Go to `chrome://extensions/`.
2. Find "VacancyPilot".
3. Click the **reload** icon (circular arrow).
4. Your data persists across reloads (stored in IndexedDB and `chrome.storage.local`).

---

## 11. Development

For development with hot reload:

```bash
pnpm dev
```

This starts WXT in development mode. Load the `.output/chrome-mv3-dev/` directory as an unpacked extension. Changes to source files trigger automatic rebuild.
