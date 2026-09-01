# Security Policy

VacancyPilot is a local-first browser extension with an optional local loopback companion. The extension is paired to the companion explicitly; there is no developer-operated cloud backend, cloud sync service or developer telemetry by default.

## Reporting a Security Issue

Please report vulnerabilities privately through [GitHub Security Advisories](https://github.com/iurii-izman/VacancyPilot/security/advisories/new). Do not open a public issue for an exploitable secret, privacy or account-safety problem.

## Security Boundaries

- **Browser HH access is read-only.** Content scripts inspect user-opened HH DOM only.
- **No hidden HH fetch** means no hidden browser content/background requests to HH pages, private endpoints or unofficial APIs. Explicit companion-side reads from official `api.hh.ru` are allowed by ADR-004 and remain read-only.
- **No auto-apply, auto-submit, auto-click or form writes.** No synthetic HH form events, CAPTCHA/antibot bypass, cookie/password/session handling or external recruiter/follow-up sending.
- **Local companion only.** Ops Mode binds to loopback, uses explicit pairing and strict extension-origin CORS, and keeps SQLite and the generated OpenAPI contract local.
- **Secret separation.** Companion HH/OAuth/provider secrets use the OS keyring; the standalone extension BYOK path remains in `chrome.storage.local` with an explicit non-vault warning. Secrets are excluded from Dexie domain data, SQLite operational records and exports where implemented.
- **Private V4 boundary.** Real candidate knowledge and generated private engine content are local inputs and are not committed to the public repository.

## Permissions

The current extension permissions are `storage`, `sidePanel` and `activeTab`. Install-time `host_permissions` are empty. Optional runtime host access is limited to `https://api.openai.com/*` and `http://127.0.0.1:8765/*`; no broad HH host permission is added. Changes to permissions or external data flows require a specification and security review update.

## Dependency Security

Dependencies are reviewed through Dependabot and the dependency-review workflow. The current documentation snapshot records the measured state rather than claiming a clean audit: `pnpm audit --json` reported 3 high and 1 moderate advisories in the development graph on 2026-09-01, and GitHub exposed 2 open Dependabot alerts. No dependency upgrade is included in this documentation-only pass.

## Verification

Run the current gates from the repository root:

```bash
pnpm verify
pnpm verify:companion
pnpm test:release
```

These cover TypeScript typecheck, ESLint, Vitest, WXT build, Application Ops workflow validation, Ruff, mypy, companion pytest and OpenAPI drift checks. Build outputs, local databases, browser profiles, QA screenshots/logs, engine packages, secrets and candidate data must not be committed.

## Disclosure Principles

When reviewing a change, check the read-only HH boundary, minimal permissions, loopback exposure, pairing/authentication, secret handling, generated contract, redaction, export/delete scope and whether any private V4 or candidate data enters Git. Historical audit reports remain historical evidence; current status belongs in Project Memory Lite and current implementation documents.
