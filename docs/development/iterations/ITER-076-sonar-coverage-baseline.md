# ITER-076: Sonar Coverage Baseline

Epic: EPIC-37
Commit: `ci: add sonar coverage baseline`

## Goal

Improve the repository-local Sonar signal by adding a Vitest coverage baseline and aligning docs/workflow wording with the current advisory mode, without guessing the external SonarCloud identity after repo transfer.

## Scope

- add Vitest coverage support using the existing test stack;
- add `pnpm test:coverage` and generate `coverage/lcov.info`;
- wire LCOV into `sonar-project.properties`;
- update the Sonar workflow so advisory scans can use the coverage artifact when the token exists;
- update Sonar setup docs to clearly separate repo-local coverage work from the still-manual org/project identity confirmation.

## Non-Goals

- no blind change to `sonar.projectKey` or `sonar.organization`;
- no branch protection or required-check policy changes;
- no switch to blocking Sonar quality-gate mode;
- no product/runtime/UI work.

## Acceptance Criteria

- `pnpm test:coverage` runs locally;
- Sonar properties include LCOV path configuration;
- workflow/docs describe the advisory mode accurately;
- docs explicitly state that Sonar org/project identity remains a manual confirmation item until verified in SonarCloud UI.

## Validation

```text
pnpm test:coverage
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
