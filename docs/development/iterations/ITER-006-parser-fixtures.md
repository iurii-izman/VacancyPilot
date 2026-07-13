# ITER-006: Parser Fixtures

Epic: EPIC-02
Commit: `test: add vacancy parser fixtures`

## Goal

Add a repeatable parser fixture test harness with first sanitized vacancy fixtures.

## Scope

- Fixture folder convention.
- Sanitized HTML snippets.
- Expected JSON outputs.
- Parser fixture test runner.
- At least 3 starter fixtures: normal vacancy, no salary, archived/removed or partial.

## Non-Goals

- No broad fixture collection automation.
- No live site scraping in tests.

## Acceptance Criteria

- Fixture tests run locally.
- Fixture data is sanitized.
- Parser result is compared to expected DTO.
- Failures show useful field-level differences.

## Validation

```text
pnpm test
```
