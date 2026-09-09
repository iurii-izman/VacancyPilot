# Development

The repository is in **FEATURE DEVELOPMENT: FROZEN** / **MODE: REAL DAILY USE
/ DOGFOOD**. Historical milestone reports are evidence, not an implementation
queue.

## Start here

1. [`../../AGENTS.md`](../../AGENTS.md)
2. [`../project-memory/README.md`](../project-memory/README.md)
3. [`../project-memory/CURRENT_STATE.md`](../project-memory/CURRENT_STATE.md)
4. [`LOCAL_SELF_CONTAINED_SETUP.md`](LOCAL_SELF_CONTAINED_SETUP.md)
5. [`application-ops/r5/R5_DAILY_USE_READINESS.md`](application-ops/r5/R5_DAILY_USE_READINESS.md)
6. [`application-ops/IMPLEMENTATION_STATUS.md`](application-ops/IMPLEMENTATION_STATUS.md)

Use the [master specification](../Техническое%20заданиеV.1.md) before changing
product boundaries, permissions, storage, or external data flows. Use the
generated [OpenAPI snapshot](../../shared/contracts/openapi.json) for the
Companion contract.

## Application Ops

The current hub is [`application-ops/README.md`](application-ops/README.md).
The private V4 engine workspace stays outside Git and is installed locally
through the setup guide. AOPS-14, full AOPS-15 and other deferred milestones
are not automatic next steps.

## Historical material

Accepted QA, audit, recovery and ADR reports remain where they provide unique
evidence. Superseded prompts, executor packs and planning dumps were removed
from the active tree during the truth audit; Git history is the recovery path
for those artifacts.
