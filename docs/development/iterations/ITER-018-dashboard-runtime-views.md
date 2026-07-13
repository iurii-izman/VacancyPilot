# ITER-018: Dashboard Runtime Views

Epic: EPIC-11
Commit: `feat: add dashboard runtime views`

## Goal

Replace key dashboard empty states with real local data views for tracked vacancies and related entities.

## Scope

- Render tracked vacancies in the dashboard.
- Show core columns like title, company, score, status, updated date.
- Add basic empty/loading/error states around real data.
- Add minimal sorting/filtering only if needed for usable browsing.
- Keep export/privacy sections intact.

## Non-Goals

- No large dashboard redesign.
- No n8n UI.
- No public-release polish work.

## Acceptance Criteria

- Saved vacancies appear in dashboard.
- Dashboard reflects local state changes after save/status updates.
- Empty state appears only when there is actually no local vacancy data.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
