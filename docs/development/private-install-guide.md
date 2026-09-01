# Private Install and Daily-Use Guide — VacancyPilot

Status: current personal dogfood guide
Last reviewed: 2026-09-01

This guide covers installation from source for personal use. It does not describe Chrome Web Store publication. Do not copy private engine payloads, real candidate data, API keys, OAuth tokens, browser profiles, databases or QA artifacts into the repository.

## Prerequisites

| Requirement | Current policy/check |
| --- | --- |
| Node.js | Use the current LTS supported by the toolchain; CI uses Node 22. Check with `node --version`. |
| pnpm | `pnpm@11.1.1` from `package.json`; check with `pnpm --version`. |
| Python | 3.12 or newer, required by `companion/pyproject.toml`. |
| uv | Required for the companion workflow; check with `uv --version`. |
| Chromium | Chrome, Edge, Brave or Yandex Browser for unpacked extension use. |
| Git | Recent version. |

## 1. Install the repository

```bash
git clone https://github.com/iurii-izman/VacancyPilot.git vacancy-pilot
cd vacancy-pilot
pnpm install
```

The repository package version remains `0.1.0`; this is a dogfood build, not a release version.

## 2. Standalone Mode

Standalone Mode needs only the extension:

```bash
pnpm verify
pnpm build
```

Load `.output/chrome-mv3/` as an unpacked extension from the browser’s extensions page with Developer mode enabled. Open an HH.ru vacancy yourself, then use the VacancyPilot UI. Dexie/IndexedDB is the canonical domain store; settings, small state and the standalone BYOK path use `chrome.storage.local`.

## 3. Ops Mode companion

Ops Mode is optional. It adds local SQLite authority, the paired FastAPI companion, official HH read-only API access, the private local V4 engine and Application Factory workflows.

Install and verify the companion:

```bash
uv sync --project companion
pnpm verify:companion
```

Apply the local schema before using operational endpoints:

```bash
uv run --project companion alembic -c companion/alembic.ini upgrade head
```

Start the loopback-only service:

```bash
uv run --project companion uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8765
```

The companion health endpoint is `http://127.0.0.1:8765/api/v1/health`. It does not silently migrate the database at startup.

## 4. Pair the extension locally

1. Build and load the extension.
2. In the extension’s **Companion** settings, enable **Ops Mode** and grant the narrow loopback permission when prompted.
3. Start pairing from the same screen.
4. Read the short-lived six-digit code displayed in the companion terminal and enter it in the extension.
5. Confirm that the status is **Connected**.

The extension stores its client token separately in browser local storage; the companion stores only a hash for verification. Disconnect/revoke pairing when the local relationship should end.

## 5. Install and verify the private V4 engine

The real engine package is supplied privately and is not committed here. Install it into the companion’s local engine data root with the existing CLI:

```bash
uv run --project companion vacancypilot-engine install --source <private-engine-package-directory>
uv run --project companion vacancypilot-engine verify
```

The CLI validates and atomically activates the package. Full V4 analysis is blocked when the package is missing or invalid; deterministic Stage A triage remains independent. Keep the source package, local engine data and any candidate knowledge outside Git.

## 6. Optional AI and HH setup

### Standalone AI

Configure OpenAI BYOK in the extension settings only if needed. The standalone key is kept in `chrome.storage.local`, separately from IndexedDB and exports, with a clear non-vault warning. AI actions are opt-in and payload-previewed.

### Ops Mode Full V4 AI

Configure the companion’s provider secret through its OS keyring and use the local companion analysis flow. Do not put secrets in shell history, source files, SQLite domain records or logs. The companion supports the OpenAI path accepted by the current Application Ops contract.

### HH official API/OAuth

The companion’s HH integration is optional and read-only. Obtain credentials through HH’s official developer/OAuth process; keep application credentials, client secrets and OAuth token bundles on the companion side. The repository includes the local HH credential helper for the OAuth client secret (`python -m app.hh.credentials`), while application-token provisioning is an operator setup concern and must not be passed to the extension or committed. OAuth uses the loopback callback shown by the companion contract.

The extension UI reports capability reality honestly: account `AVAILABLE`, resumes `DENIED_BY_HH`, negotiations `DENIED_BY_HH`, and writes `FORBIDDEN_BY_PRODUCT` where applicable. No private-endpoint or scraping fallback exists.

## 7. Daily R5 workflow

Search Profiles / HH discovery → Inbox → select → preview → explicit process → review V4 decision → prepare/review letter → manually apply externally → confirm `APPLIED` → track response/outcome.

Application Factory preview makes zero provider calls. Processing requires explicit confirmation and prepares a manual queue; it does not submit applications or create `APPLIED`. Conversion/Performance views are descriptive and warn about small samples and non-causation.

## 8. Verification commands

```bash
pnpm verify
pnpm verify:companion
pnpm test:release
```

These commands cover extension typecheck, lint, tests, build, release-safety tests, companion Ruff/mypy/pytest and OpenAPI drift. All must pass for a trusted local baseline. Test totals are intentionally not hardcoded here; record the observed count with the date in a report.

## 9. Troubleshooting

| Symptom | Check |
| --- | --- |
| Badge absent | Use a user-opened `https://*.hh.ru/vacancy/*` or search page; verify the extension is enabled and page-badge setting is on. |
| Companion unavailable | Confirm the Uvicorn process, `127.0.0.1:8765`, browser permission and the health endpoint. |
| Not paired | Enable Ops Mode, grant loopback permission, start pairing and use the current terminal code before it expires. |
| API incompatible | Run the repository and companion from matching accepted revisions; inspect the displayed API versions. |
| Engine invalid | Run `vacancypilot-engine verify`; replace only through the validated private package install flow. |
| Keyring failure | Check the OS credential-store integration and companion process user; never replace it with plaintext logs or command-line secrets. |
| HH capability denied | Treat `DENIED_BY_HH` as a real upstream restriction; do not retry through scraping or private endpoints. |
| AI request fails | Review the payload preview, provider/key configuration and provider response; cached results may still be used where the UI indicates. |
| Queue cannot resume | Treat as an immediate hotfix criterion; preserve local evidence and do not manually mark items `APPLIED` without the explicit workflow. |

## 10. Local data and uninstall

Browser deletion controls clear extension-managed Dexie tables and known `chrome.storage.local` keys. They do not delete unknown browser keys or companion SQLite, OS-keyring or engine data. Uninstalling the extension may remove browser-managed storage but does not necessarily remove the separate companion resources; export before deletion when retention is wanted.

## 11. Current scope

Feature development is frozen for real daily use / dogfood. AOPS-14 Interview Pack and full AOPS-15 remain deferred/incomplete. Do not treat historical `ITER-060`/`EPIC-31` text as the next automatic implementation step.
