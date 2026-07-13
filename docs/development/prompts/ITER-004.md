# Prompt: ITER-004 Local Storage Schema

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md` sections 8.3 and 10.15
3. `docs/development/epics/EPIC-01-domain-models-and-storage.md`
4. `docs/development/iterations/ITER-004-local-storage-schema.md`

Task: add Dexie schema v1, migrations structure, and local storage helpers.

Allowed scope:

- DB service files;
- migration files;
- storage tests;
- settings storage boundary.

Hard constraints:

- no API keys in IndexedDB;
- no sync/backend;
- no UI tracker yet.

Validation:

```text
pnpm typecheck
pnpm test
```

Expected commit message: `feat: add local storage schema`
