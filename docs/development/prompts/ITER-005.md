# Prompt: ITER-005 HH Adapter Skeleton

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md` sections 8.5, 8.7, 16
3. `docs/development/epics/EPIC-02-hh-vacancy-parser-and-fixtures.md`
4. `docs/development/iterations/ITER-005-hh-adapter-skeleton.md`

Task: add `SiteAdapter`, `HHAdapter`, and a safe vacancy parser skeleton.

Allowed scope:

- adapter interfaces;
- HH adapter files;
- parser skeleton;
- selector version files;
- parser tests with synthetic minimal HTML.

Hard constraints:

- no live HH network calls;
- no `fetch` to HH from content scripts;
- no auto-clicks;
- no DOM form writes;
- no search parser yet.

Validation:

```text
pnpm typecheck
pnpm test
```

Expected commit message: `feat: add hh vacancy parser skeleton`
