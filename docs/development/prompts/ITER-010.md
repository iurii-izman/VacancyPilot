# Prompt: ITER-010 AI Privacy Layer

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md` sections 12, 20
3. `docs/development/epics/EPIC-06-ai-privacy-layer-and-analysis.md`
4. `docs/development/iterations/ITER-010-ai-privacy-layer.md`

Task: implement AI redaction, input builders, payload preview, and Standard/Strict Privacy modes.

Allowed scope:

- redaction service;
- prompt/input builder;
- payload preview model;
- privacy tests.

Hard constraints:

- no real AI API call;
- no API key storage UI;
- no raw HTML in AI payload;
- Strict Privacy must exclude `descriptionClean`.

Validation:

```text
pnpm typecheck
pnpm test
```

Expected commit message: `feat: add ai privacy layer`
