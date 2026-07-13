# Prompt: ITER-007 Local Vacancy Tracker

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md` sections 10, 15
3. `docs/development/epics/EPIC-03-local-tracker-and-status-history.md`
4. `docs/development/iterations/ITER-007-local-vacancy-tracker.md`

Task: implement local vacancy save/update/status history services.

Allowed scope:

- tracker service;
- status helpers;
- event log helper;
- DB repository tests;
- minimal integration with parsed DTOs.

Hard constraints:

- no external network;
- no n8n;
- no passive status auto-update without user confirmation path.

Validation:

```text
pnpm typecheck
pnpm test
```

Expected commit message: `feat: add local vacancy tracker`
