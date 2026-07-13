# Prompt: ITER-012 Cover Letter Studio

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md` sections 13 and 3.9
3. `docs/development/epics/EPIC-07-cover-letter-studio.md`
4. `docs/development/iterations/ITER-012-cover-letter-studio.md`

Task: implement the first Cover Letter Studio workflow.

Allowed scope:

- letter UI components;
- draft/final save logic;
- copy workflow;
- constraint validation;
- tests for constraints where practical.

Hard constraints:

- no HH form fill;
- no `.click()` on HH controls;
- no synthetic DOM events;
- generated text must be editable before final use.

Validation:

```text
pnpm typecheck
pnpm test
pnpm build
```

Expected commit message: `feat: add cover letter studio`
