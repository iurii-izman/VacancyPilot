# Repository History Retrieval

The 2026-09-01 release-hygiene pass removed superseded planning archaeology
from the current tree while preserving Git history and recovery evidence.

Pre-prune commit:

`c7792e8afc7508e453bb9a67080245605da8aaab`

Removed categories:

- external model-dump discovery notes under `docs/search/`;
- completed executor prompts under `docs/development/prompts/`;
- completed epic and iteration decomposition under `docs/development/epics/`
  and `docs/development/iterations/`;
- completed Application Ops executor prompts;
- superseded top-level development plans and external-agent workflow notes.

Retrieve any removed file from the pre-prune tree with, for example:

```powershell
git show c7792e8:<path>
```

This file is a retrieval index, not a second product specification. Current
truth remains in Project Memory Lite, the master specification, accepted ADRs,
contracts, implementation/tests and current Application Ops/R5 documents.
