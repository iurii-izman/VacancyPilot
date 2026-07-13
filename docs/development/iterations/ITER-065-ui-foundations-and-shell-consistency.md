# ITER-065: UI Foundations And Shell Consistency

Epic: EPIC-33
Commit: `refactor: unify ui surface foundations`

## Goal

Create a shared UI foundation and normalize the shell styling of popup, side panel, dashboard, and key trust surfaces.

## Scope

- extract shared tokens or primitive style helpers for spacing, typography, panels, buttons, and section headers;
- reduce duplicated inline styling where it is obviously recurring;
- normalize shell-level layout and visual hierarchy across popup, side panel, dashboard, onboarding, permissions, and privacy surfaces;
- keep changes conservative and aligned with the existing product tone.

## Non-Goals

- no broad visual rebrand;
- no large framework or CSS-in-JS migration;
- no dark mode system;
- no new product behavior outside what is needed to support the UI refactor.

## Acceptance Criteria

- repeated layout/styling patterns are visibly more consistent;
- the main extension surfaces share a coherent visual structure;
- the refactor stays small enough that runtime behavior remains stable;
- focused tests are updated where structure-sensitive rendering changes.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
