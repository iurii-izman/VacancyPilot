# Prompt: ITER-080 Search Highlights MVP

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md`
3. `docs/development/CODEX-RUNTIME-BRIEF.md`
4. `docs/development/hh-visual-triage-decision-report.md`
5. `docs/development/epics/EPIC-38-hh-visual-triage-and-search-highlights-mvp.md`
6. `docs/development/iterations/ITER-080-search-highlights-mvp.md`

Use the runtime brief as navigation context, not as a replacement for the full
specification.

Task: turn the current search-card badge layer into a real local visual-triage surface by resolving batched highlight state from local data and rendering viewed/saved/rejected/known-score states safely on HH search cards.

Allowed scope:

- batched highlight-state service built from `visitMarks`, `jobs`, and settings;
- background/runtime message flow for visible search-card vacancy IDs;
- deliberate extension or replacement of current search badge rendering contract;
- viewed/saved/rejected/score rendering plus status priority handling;
- dim/hide rejected behavior through local state only;
- focused runtime/search-surface tests for dynamic lists, dedupe, and re-render safety.

Hard constraints:

- no browser history integration;
- no new scoring or AI calls on the search page;
- no company history counters or duplicate hints yet;
- no dashboard expansion;
- no `history` or `tabs` permission;
- no hidden HH fetch/XHR or HH control mutation.

Validation:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```

Expected commit message: `feat: add search highlights mvp`
