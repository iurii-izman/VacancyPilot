# Prompt: ITER-008 Rule-Based Scoring

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md` section 11
3. `docs/development/epics/EPIC-04-rule-based-scoring.md`
4. `docs/development/iterations/ITER-008-rule-based-scoring.md`

Task: implement deterministic rule-based scoring.

Allowed scope:

- scoring module;
- risk flag helpers;
- score tests;
- profile weighting helpers.

Hard constraints:

- no AI;
- no external enrichment;
- no hidden network.

Validation:

```text
pnpm typecheck
pnpm test
```

Expected commit message: `feat: add rule based scoring`
