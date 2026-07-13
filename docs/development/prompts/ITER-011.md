# Prompt: ITER-011 AI Provider And Cache

Read first:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md` sections 12.1, 12.7, 12.8
3. `docs/development/epics/EPIC-06-ai-privacy-layer-and-analysis.md`
4. `docs/development/iterations/ITER-011-ai-provider-and-cache.md`

Task: add AI provider abstraction, mock provider, AI output validation, input hash, and cache.

Allowed scope:

- provider interface;
- mock provider;
- cache service;
- validation tests;
- manual regenerate flow shape.

Hard constraints:

- no automatic AI calls;
- no backend proxy;
- no raw response persistence outside debug mode;
- no content script access to API keys.

Validation:

```text
pnpm typecheck
pnpm test
```

Expected commit message: `feat: add ai analysis workflow`
