# EPIC-00: Foundation And Tooling

## Goal

Create an installable, testable WXT + Manifest V3 + React + TypeScript extension skeleton with minimal permissions and a development workflow suitable for iterative AI-assisted coding.

## Scope

- WXT project scaffold.
- React UI entrypoints.
- TypeScript config.
- Package manager setup.
- Basic manifest config.
- Minimal permissions.
- Test/typecheck/lint/build scripts.
- Placeholder popup, side panel, dashboard/options entrypoints.

## Non-Goals

- No HH parsing.
- No AI.
- No n8n.
- No tracker logic.
- No browser automation.

## Acceptance Criteria

- `pnpm install` works.
- `pnpm build` builds the extension.
- `pnpm typecheck` runs.
- `pnpm test` has a placeholder or first smoke test.
- Generated manifest contains only allowed baseline permissions.
- No `<all_urls>`, `cookies`, `webRequest`, or `nativeMessaging`.

## Safety Notes

Manifest changes are security-sensitive. Any new permission must be justified against the master spec.
