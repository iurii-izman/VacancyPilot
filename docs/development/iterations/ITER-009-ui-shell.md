# ITER-009: UI Shell

Epic: EPIC-05
Commit: `feat: add extension ui shell`

## Goal

Create the first usable UI shell for popup, side panel, and dashboard/options.

## Scope

- Popup status placeholder.
- Side panel tabs placeholder.
- Dashboard shell.
- Content badge with Shadow DOM.
- Error boundaries.
- Loading/empty/error states.

## Non-Goals

- No complex styling.
- No search badges.
- No auto-open unless explicitly configured.

## Acceptance Criteria

- UI builds.
- Badge does not use global styles.
- Error boundary exists for main UI roots.
- UI does not mutate HH business state.

## Validation

```text
pnpm typecheck
pnpm test
pnpm build
```
