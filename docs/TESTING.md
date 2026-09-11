# Testing and Verification

Run commands from the repository root. They use fixtures and local test
services; they do not make real HH, OpenAI or other provider calls.

## Extension

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```

The release command builds and zips the extension, checks production output
and package privacy, then runs the Manifest V3 permissions, no broad host
access, public/private engine separation and other release-safety invariants.
It fails closed when release output is missing.

Contract and workflow checks:

```text
pnpm contracts:generate
pnpm contracts:check
pnpm workflows:check
pnpm release:artifacts
```

The generated TypeScript module is type-only and must stay synchronized with
the canonical FastAPI snapshot. Workflow actions must use the verified full
SHA pins recorded by the static checker.

## Companion

```text
pnpm companion:format-check
pnpm companion:lint
pnpm companion:typecheck
pnpm companion:test
pnpm companion:openapi-check
```

`pnpm verify:companion` runs the Companion checks as one command. The generated
OpenAPI snapshot is checked against the FastAPI application. Companion tests
use isolated databases and fake keyring/provider boundaries where needed.

## Combined checks

```text
pnpm verify
pnpm verify:all
git diff --check
```

`pnpm verify` covers extension typecheck, lint, tests and build. The removed
`verify:aops-workflow` command belonged to a retired documentation executor
pack and is intentionally no longer part of verification.

`pnpm verify:all` is the CI-equivalent gate: workflow safety, contract drift,
extension tests/build, release packaging/privacy, release tests, and the full
Companion quality suite. No command above makes live HH, provider, or private
engine calls.
