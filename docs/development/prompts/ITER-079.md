# Prompt: ITER-079 Visit Marks Foundation

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md`
3. `docs/development/CODEX-RUNTIME-BRIEF.md`
4. `docs/development/hh-visual-triage-decision-report.md`
5. `docs/development/epics/EPIC-38-hh-visual-triage-and-search-highlights-mvp.md`
6. `docs/development/iterations/ITER-079-visit-marks-foundation.md`

Use the runtime brief as navigation context, not as a replacement for the full
specification.

Task: add the local visit-mark foundation for HH visual triage by recording vacancy-page visits in IndexedDB and wiring the new lifecycle surface into export/delete/migrations without creating viewed-only jobs.

Allowed scope:

- `visitMarks` model, schema, migration, repository, and helpers;
- vacancy-page open recording for user-opened HH vacancy pages;
- any minimal default settings shape needed for future feature enablement;
- export/delete lifecycle integration;
- focused tests and release-safety checks for unchanged permission posture.

Hard constraints:

- do not create `Job` rows just because a vacancy page was viewed;
- no search-card UI work yet;
- no browser history integration;
- no `history` or `tabs` permission;
- no hidden HH fetch/XHR;
- no auto-click or form-write behavior.

Validation:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```

Expected commit message: `feat: add local visit marks foundation`
