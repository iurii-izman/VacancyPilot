# Prompt: ITER-009 UI Shell

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md` sections 17, 18, 19
3. `docs/development/epics/EPIC-05-extension-ui-shell.md`
4. `docs/development/iterations/ITER-009-ui-shell.md`

Task: build popup, side panel, dashboard/options shell, and content badge with safe UI isolation.

Allowed scope:

- UI roots;
- shared UI components;
- content badge;
- error boundaries;
- basic state placeholders.

Hard constraints:

- no heavy UI injection into HH;
- no auto-clicks;
- no writing into HH fields;
- no broad permissions.

Validation:

```text
pnpm typecheck
pnpm test
pnpm build
```

Expected commit message: `feat: add extension ui shell`
