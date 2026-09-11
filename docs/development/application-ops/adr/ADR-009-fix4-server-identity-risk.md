# ADR-009: Fix 4 Local Companion Server-Identity Risk

Status: ACCEPTED RISK WITH PUBLIC-RELEASE GATE
Date: 2026-09-10
Scope: Current private local dogfood

## Context

The Companion is supported only on loopback and uses pairing/client
authentication for protected routes. That constrains accidental LAN exposure
and unauthorized extension requests, but a malicious local process could still
answer on the loopback port. Loopback transport and a client token alone do not
prove server identity to the extension.

## Decision

Record `SEC-SERVER-AUTH-001` as
`ACCEPTED_RISK_WITH_PUBLIC_RELEASE_GATE` for the current private local dogfood
release. Fix 4 does not pretend that server identity is technically solved.

The current controls remain mandatory: the project-owned launcher rejects
non-loopback binds, pairing protects the client token, protected routes verify
the token, pre-auth requests are bounded before expensive verification, CORS is
constrained, and responses are sanitized. The extension continues to have no
developer cloud backend.

Before public distribution, the project must implement and review server
identity using authenticated IPC, pinned local TLS, or an equivalent mechanism.
TLS/mTLS/named-pipe implementation is outside Fix 4 and is not added as an
incidental change.

## Consequences

- Private dogfood can proceed under the documented loopback/local-process
  assumption.
- The risk remains visible in the current risk register and Fix 4 acceptance
  report.
- Public-release approval is blocked until the server-identity gate is met.
