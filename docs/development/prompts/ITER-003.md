# Prompt: ITER-003 Domain Models

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md` sections 10, 11, 12
3. `docs/development/epics/EPIC-01-domain-models-and-storage.md`
4. `docs/development/iterations/ITER-003-domain-models.md`

Task: implement TypeScript domain model contracts.

Allowed scope:

- model/type files under `src/core` or established project convention;
- unit tests for type guards only if useful;
- exports/index files.

Hard constraints:

- no persistence implementation;
- no UI;
- no API keys in business entities;
- no `any` for known contracts.

Validation:

```text
pnpm typecheck
pnpm test
```

Expected commit message: `feat: add domain model contracts`
