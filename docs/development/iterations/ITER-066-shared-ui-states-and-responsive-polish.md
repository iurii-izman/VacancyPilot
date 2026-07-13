# ITER-066: Shared UI States And Responsive Polish

Epic: EPIC-33
Commit: `feat: polish shared ui states and responsiveness`

## Goal

Make empty, loading, error, and narrow-width states more consistent and more usable across the extension.

## Scope

- standardize empty/loading/error visual treatment and messaging density;
- improve narrow popup and side-panel layout behavior where content currently feels cramped or visually uneven;
- tighten spacing, scrolling, and section transitions in runtime views that users revisit often;
- add focused tests for state rendering where practical.

## Non-Goals

- no full navigation rewrite;
- no workflow logic changes except where required by clearer state feedback;
- no new product modules.

## Acceptance Criteria

- common UI states look and behave consistently;
- key surfaces remain readable at extension-sized widths;
- the runtime feels less brittle in sparse-data and error cases;
- tests cover the highest-risk state render paths.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
