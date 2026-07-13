# Prompt: ITER-006 Parser Fixtures

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md` section 16
3. `docs/development/epics/EPIC-02-hh-vacancy-parser-and-fixtures.md`
4. `docs/development/iterations/ITER-006-parser-fixtures.md`

Task: add parser fixture harness and first sanitized fixtures.

Allowed scope:

- fixture directories;
- sanitized HTML snippets;
- expected JSON;
- fixture test runner;
- parser adjustments required for fixtures.

Hard constraints:

- no live scraping;
- no cookies/tokens/user PII in fixtures;
- no broad parser refactor beyond fixture needs.

Validation:

```text
pnpm test
```

Expected commit message: `test: add vacancy parser fixtures`
