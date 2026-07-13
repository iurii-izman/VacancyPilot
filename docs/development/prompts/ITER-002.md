# Prompt: ITER-002 Quality Scripts

Read first:

1. `AGENTS.md`
2. `docs/development/epics/EPIC-00-foundation-and-tooling.md`
3. `docs/development/iterations/ITER-002-quality-scripts.md`

Task: add quality scripts for typecheck, lint, unit tests, and build.

Allowed scope:

- package scripts;
- test config;
- lint config;
- TypeScript/build config;
- minimal smoke test;
- README development commands.

Hard constraints:

- no product features;
- no permissions expansion;
- no parser or AI work.

Validation:

```text
pnpm typecheck
pnpm test
pnpm build
```

Expected commit message: `chore: add project quality scripts`
