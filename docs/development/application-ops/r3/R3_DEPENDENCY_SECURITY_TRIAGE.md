# R3 Dependency Security Triage

Date: 2026-08-30

Command: `pnpm audit --json`

Result: 0 critical, 14 high, 2 moderate advisories. All observed paths are
development/build tooling (`wxt`, `vitest`, ESLint, Vite) and none is a direct
runtime dependency used by the FastAPI companion or shipped extension runtime.
No `pnpm audit fix --force` was run and no dependency was upgraded for this
bounded review.

| Advisory family | Classification | R3 relevance | Decision |
|---|---|---|---|
| `uuid` v3/v5/v6 buffer bounds | TRANSITIVE_RUNTIME | NOT_RELEVANT_TO_R3_SECURITY | `wxt` web-ext test tooling only; defer to AOPS-17 |
| `adm-zip` crafted ZIP allocation | DEV_BUILD_ONLY | NOT_RELEVANT_TO_R3_SECURITY | Firefox profile runner only; defer to AOPS-17 |
| `brace-expansion` DoS variants | DEV_BUILD_ONLY | NOT_RELEVANT_TO_R3_SECURITY | test/lint/build dependency paths only; defer to AOPS-17 |
| `shell-quote` quadratic parse | DEV_BUILD_ONLY | NOT_RELEVANT_TO_R3_SECURITY | Firefox runner only; defer to AOPS-17 |
| `postcss` source-map disclosure | DEV_BUILD_ONLY | NOT_RELEVANT_TO_R3_SECURITY | Vite/PostCSS build path only; defer to AOPS-17 |
| `nanoid` invalid-size loop | DEV_BUILD_ONLY | NOT_RELEVANT_TO_R3_SECURITY | Vite/PostCSS build path only; defer to AOPS-17 |

The audit reports transitive package paths, not an exploitable AOPS-10 HTTP,
OAuth, URL parsing, browser identity, secret-handling, or FastAPI/httpx runtime
surface. A narrow compatible patch is therefore not required before AOPS-10.
