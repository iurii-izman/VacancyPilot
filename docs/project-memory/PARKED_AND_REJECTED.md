# Parked, Rejected, and Out-of-Scope Approaches

This register prevents re-proposing approaches whose status is already supported by repository authority.

| Status | Approach | Reason | Authoritative source |
| --- | --- | --- | --- |
| REJECTED | Auto-submit, auto-click, HH form writes, hidden HH requests, CAPTCHA bypass, cookies/session handling, and default telemetry. | Violates the read-first, user-controlled product boundary and safety requirements. | [Master specification](../Техническое%20заданиеV.1.md), [`AGENTS.md`](../../AGENTS.md) |
| REJECTED | Cloud backend, Streamlit/Electron replacement, or a SQLite-only / Dexie-only storage model. | Violates local-first goals, duplicates the browser workflow, or breaks standalone/Ops authority requirements. | [`ADR-001`](../development/application-ops/adr/ADR-001-local-companion.md), [`ADR-002`](../development/application-ops/adr/ADR-002-sqlite-dexie-authority.md) |
| REJECTED | Hand-maintained duplicate companion API interfaces, shared hand-written JSON schema, or gRPC/protobuf. | Adds contract drift or disproportionate complexity; generated OpenAPI is canonical. | [`ADR-003`](../development/application-ops/adr/ADR-003-openapi-contract-source.md) |
| REJECTED | Extension-side HH API calls, unofficial HH endpoints, or companion write access to applications. | Exposes secrets, violates the official read-only boundary, or enables auto-apply behavior. | [`ADR-004`](../development/application-ops/adr/ADR-004-hh-official-read-only-boundary.md) |
| REJECTED | Committing real candidate V4 facts or encrypting them in the repository. | Exposes private data or adds key-management theater; install real packages locally instead. | [`ADR-005`](../development/application-ops/adr/ADR-005-engine-package-privacy.md) |
| DEFERRED_UNTIL | DeepSeek runtime provider. | Requires a separate owner decision, ADR, security review, compatibility proof, and bounded epic. | [`ADR-006`](../development/application-ops/adr/ADR-006-ai-provider-boundary.md) |
| DEFERRED_UNTIL | `n8n` / Telegram integration. | Permission model must be explicitly reopened before work resumes. | [`00-product-development-plan.md`](../development/00-product-development-plan.md), [`docs/ROADMAP.md`](../ROADMAP.md) |
| PARKED | AOPS-14 Interview Pack and full canonical AOPS-15 analytics/pilot. | AOPS-14 is not started; AOPS-15 remains incomplete beyond the bounded R5 slice. | [`IMPLEMENTATION_STATUS.md`](../development/application-ops/IMPLEMENTATION_STATUS.md), [`R5_POST_MERGE_ACCEPTANCE.md`](../development/application-ops/r5/R5_POST_MERGE_ACCEPTANCE.md) |
| OUT_OF_SCOPE | Memory infrastructure: SQLite/FTS/vector search, embeddings, RAG, memory API/CLI/MCP, watchers, generators, telemetry, or external knowledge-base integration. | R5.1 is a static documentation map and must remain cheap to maintain. | R5.1 milestone contract (user-provided task text) |
