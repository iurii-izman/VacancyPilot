# Development Pack

This folder contains implementation packs, accepted contracts, architecture decisions and historical decomposition behind VacancyPilot. Current operation is **FEATURE DEVELOPMENT: FROZEN** / **MODE: REAL DAILY USE / DOGFOOD**; historical iterations are not an automatic work queue.

## Start Here

For a new agent or developer:

1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/project-memory/README.md`](../project-memory/README.md)
3. [`docs/project-memory/CURRENT_STATE.md`](../project-memory/CURRENT_STATE.md)
4. [`application-ops/IMPLEMENTATION_STATUS.md`](application-ops/IMPLEMENTATION_STATUS.md)
5. [`application-ops/r5/R5_DAILY_USE_READINESS.md`](application-ops/r5/R5_DAILY_USE_READINESS.md) for daily use
6. Accepted contracts/ADRs and the [master specification](../Техническое%20заданиеV.1.md) when investigating or changing behavior

Do not start `ITER-060`, `EPIC-31`, `AOPS-14` or full `AOPS-15` automatically. Read [`docs/ROADMAP.md`](../ROADMAP.md) for the evidence-collection gate and deferred work.

## Application Ops

Use the repo-native [Application Ops MVP](../mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md), [pack](application-ops-pack/), and [documentation hub](application-ops/README.md). The private Application Engine workspace is outside this repository and must not be copied into Git.

## Historical Implementation Context

Accepted QA, audit and milestone reports remain available where they are still
useful evidence. Superseded plans, prompts and epic/iteration decomposition
were removed from the current tree during the 2026-09-01 hygiene pass; use
[`../HISTORY.md`](../HISTORY.md) and Git history when an old artifact is needed.

The master specification remains the authority for product boundaries,
permissions, data model and external data flows. The current implementation
and tests remain the final authority for behavior.
