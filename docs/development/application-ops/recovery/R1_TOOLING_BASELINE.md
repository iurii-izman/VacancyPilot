# R1 Tooling Baseline

Branch: `chore/recovery-tooling-hygiene` (from main `169bb5c`).
Date: 2026-08-30.

## Fixes

1. **Ruff import-order** in `companion/app/main.py` (pre-existing on main,
   reproduced first, then fixed with `ruff check app/main.py --fix` — no
   incidental reformatting; `ruff format --check` reports 61 files already
   formatted).
2. **Vitest worktree discovery** — `vitest.config.ts` `include` was
   `**/*.test.ts(x)`, which pulls in test files under
   `.claude/worktrees/**` (duplicate discovery noise). Added
   `exclude: ["**/node_modules/**", ".claude/**"]`.
3. **ESLint worktree discovery** — added `.claude/**` to `ignores` in
   `eslint.config.mjs`.
4. `tsconfig.json` uses explicit `include` lists — no worktree leakage; no
   change needed.
5. Ruff/mypy/pytest run scoped to `companion/` — no worktree leakage; no
   change needed.

Not excluded: `src/**`, `companion/app/**`, real tests, AOPS-08 source/tests.

## Baseline gate results (actual, this machine)

| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck` | 0 | PASS |
| `pnpm lint` | 0 | PASS |
| `pnpm test` | 0 | 78 files, 2808 tests passed, ~16s |
| `pnpm build` | 0 | chrome-mv3 built, 758.75 kB |
| `pnpm test:release` | 0 | 10 files, 1364 tests passed |
| `pnpm verify:companion` | 0 | ruff format+check PASS, mypy strict PASS, 277 pytest passed, OpenAPI snapshot current |
| `pnpm verify:aops-workflow` | 0 | PASS |
| `git diff --check` | 0 | PASS |

Historical counts not used as requirement; actual counts recorded above.
