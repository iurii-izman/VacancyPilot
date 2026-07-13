# ITER-019: Profile And Resume Management

Epic: EPIC-11
Commit: `feat: add profile resume management`

## Goal

Make profile/resume data manageable in the UI so scoring and cover-letter flows can be used in practice.

## Scope

- Create/list/edit basic profiles.
- Create/list/edit resumes or resume highlights used by current models.
- Allow selecting a default/current profile.
- Ensure saved profile/resume data is persisted locally.

## Non-Goals

- No remote resume import.
- No AI provider implementation.
- No new labs workflow.

## Acceptance Criteria

- User can create at least one usable profile.
- User can create at least one usable resume/highlights record.
- Local scoring/letter workflows can reference saved profile/resume data.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
