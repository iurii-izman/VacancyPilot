# Prompt: ITER-081 Search Highlights Controls And QA

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md`
3. `docs/development/CODEX-RUNTIME-BRIEF.md`
4. `docs/development/hh-visual-triage-decision-report.md`
5. `docs/development/epics/EPIC-38-hh-visual-triage-and-search-highlights-mvp.md`
6. `docs/development/iterations/ITER-081-search-highlights-controls-and-qa.md`

Use the runtime brief as navigation context, not as a replacement for the full
specification.

Task: make the Search Highlights MVP operable and reviewable by adding user-facing settings, narrowly scoped local controls, and final QA/reporting for the pack.

Allowed scope:

- Search Highlights settings in the current settings UI;
- MVP controls for enable/disable, viewed/saved/rejected/score/view-count visibility, dim rejected, hide rejected;
- a small local search-surface control strip only if it stays lightweight and clearly useful;
- manual QA artifact and residual-risk capture for the MVP pack;
- focused tests for any settings/derived-state logic added.

Hard constraints:

- no browser-history import;
- no search snapshots / "new since last search";
- no company history counters or duplicate hints;
- no broader dashboard redesign;
- no permissions changes;
- no HH control mutation or hidden network behavior.

Validation:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```

Expected commit message: `feat: add search highlights controls and qa pack`
