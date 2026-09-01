# VacancyPilot Project Memory Lite

Memory Lite is a small, human-maintained map for future agents. It records where the current truth lives, summarizes the accepted post-R5 state, and prevents repeated proposals of explicitly rejected or deferred work.

It is not a memory platform, database, search index, second source of truth, or substitute for code, tests, the accepted specification, ADRs, runtime contracts, security reviews, or acceptance reports.

## Authority and startup order

Use this precedence when sources disagree:

1. Repository instructions: [`AGENTS.md`](../../AGENTS.md) and any applicable `CONSTITUTION.md`.
2. Accepted product specification: [`docs/Техническое заданиеV.1.md`](../Техническое%20заданиеV.1.md).
3. Accepted ADRs and milestone contracts/reviews/reports under [`docs/development/`](../development/).
4. Shared status and current-state documents, especially [`IMPLEMENTATION_STATUS.md`](../development/application-ops/IMPLEMENTATION_STATUS.md).
5. This Memory Lite index and snapshot.
6. Historical notes, prompts, audits, and discussion material.

Recommended startup reading:

1. [`AGENTS.md`](../../AGENTS.md)
2. [`CURRENT_STATE.md`](CURRENT_STATE.md)
3. The relevant accepted milestone report and runtime/security artifacts
4. The applicable ADRs in [`docs/development/application-ops/adr/`](../development/application-ops/adr/)
5. The master specification before implementation changes

## Canonical document map

| Topic | Canonical source | Memory Lite role |
| --- | --- | --- |
| Product boundary and safety | [`docs/Техническое заданиеV.1.md`](../Техническое%20заданиеV.1.md) | Link only |
| Shared implementation status | [`docs/development/application-ops/IMPLEMENTATION_STATUS.md`](../development/application-ops/IMPLEMENTATION_STATUS.md) | Snapshot source |
| Milestone acceptance | Relevant `*_ACCEPTANCE*.md` or post-merge report under [`docs/development/`](../development/) | Evidence link |
| Architecture decisions | Accepted ADRs under [`docs/development/application-ops/adr/`](../development/application-ops/adr/) | Retrieval register |
| API contract | [`shared/contracts/openapi.json`](../../shared/contracts/openapi.json) and its accepted ADR | Link only |
| Product priority | [`docs/development/00-product-development-plan.md`](../development/00-product-development-plan.md) and [`docs/ROADMAP.md`](../ROADMAP.md) | Context; not acceptance authority |
| Implementation behavior | Source code and tests | Final truth |

## Search before create

Before introducing a concept, document, API, schema, table, event, status, configuration key, or subsystem:

1. Search filenames and content for the concept and synonyms.
2. Identify the highest-authority existing source.
3. Read the relevant specification, ADR, contract, current implementation, and tests.
4. Update or link the canonical source instead of creating a duplicate.
5. If the proposal conflicts with an accepted source, use the repository decision process; do not hide the conflict in a new file.

## Milestone closure update

At closure, code/tests and accepted milestone artifacts establish truth first. Then update the shared implementation status, refresh [`CURRENT_STATE.md`](CURRENT_STATE.md) from those sources, and change [`DECISIONS.md`](DECISIONS.md) only for newly accepted or superseded decisions. Change [`PARKED_AND_REJECTED.md`](PARKED_AND_REJECTED.md) only when an authoritative decision changes. Check links, contradictions, and the verified commit. Never mark a milestone accepted merely because Memory Lite says so.

## Maintenance rule

Keep this layer compact and sourced. Prefer links over copied detail, and never store raw chats, prompts, provider payloads, secrets, credentials, or private candidate data here.
