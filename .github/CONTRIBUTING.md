# Contributing to VacancyPilot

Thank you for your interest in contributing. VacancyPilot is currently in **pre-release personal dogfood** with feature development frozen while real-use evidence is collected. Issues and pull requests are welcome, but the scope is controlled to keep the project aligned with its core safety principles.

---

## Project Status

VacancyPilot is a **local-first, read-first HH.ru job-search copilot**. It is not an auto-apply bot. All contributions must respect the project's safety boundaries.

---

## Local Setup

```bash
git clone git@github.com:iurii-izman/VacancyPilot.git
cd VacancyPilot
pnpm install
pnpm dev        # Dev mode with hot reload (Chrome)
pnpm build      # Production build
```

Load the unpacked extension from `.output/chrome-mv3/` in Chrome Developer mode.

See [`docs/development/private-install-guide.md`](../docs/development/private-install-guide.md) for detailed instructions.

---

## Validation Commands

Run these before opening a PR:

```bash
pnpm typecheck      # TypeScript type-check
pnpm lint           # ESLint
pnpm test           # Unit tests
pnpm build          # Production build
pnpm test:release   # Release-safety tests
```

All checks must pass. CI enforces the same pipeline on every push and PR.

---

## Safety Constraints (Non-Negotiable)

All contributions must respect these boundaries:

- **No auto-submit** — never submit forms or applications programmatically
- **No auto-click on HH controls** — never programmatically click HH.ru UI elements
- **No form writes** — never write values into HH.ru form fields
- **No hidden HH fetch/XHR** — no background or content-script requests to HH.ru endpoints
- **No broad permissions** — keep permissions minimal (`storage`, `sidePanel`, `activeTab`); optional OpenAI/loopback companion hosts require explicit justification
- **No telemetry by default** — no analytics, crash reporting, or usage tracking unless explicitly opt-in and off by default
- **AI and n8n must remain opt-in** — no automatic external requests without explicit user action

Violations of these constraints will block a PR from being merged.

---

## PR Checklist

Before opening a pull request:

- [ ] Changes are scoped to the described goal
- [ ] No new permissions added without updating the specification and explaining the reason
- [ ] No forbidden HH automation patterns introduced
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
- [ ] `pnpm test:release` passes
- [ ] Tests or fixture checks included where practical
- [ ] Documentation updated if contracts or behavior changed
- [ ] No secrets, API keys, or personal data committed

---

## Coding Style

- TypeScript with strict mode
- React functional components with hooks
- Follow existing patterns in `src/`, `entrypoints/`
- ESLint configuration is in `eslint.config.mjs`
- Prefer parser fixtures over live HH scraping for new tests

---

## Documentation

- Project Memory Lite: [`docs/project-memory/README.md`](../docs/project-memory/README.md)
- Product specification: [`docs/Техническое заданиеV.1.md`](../docs/Техническое%20заданиеV.1.md)
- Current roadmap: [`docs/ROADMAP.md`](../docs/ROADMAP.md)
- Security policy: [`SECURITY.md`](../SECURITY.md)

---

## Reporting Security Issues

**Do not post security vulnerabilities publicly.** Follow the process in [`SECURITY.md`](../SECURITY.md):

GitHub → [Report a vulnerability](https://github.com/iurii-izman/VacancyPilot/security/advisories/new)
