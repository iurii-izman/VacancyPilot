# R4 Post-Merge Acceptance

Date: 2026-08-30

## Verdict

`R4_PASS`

The required AOPS-12 and AOPS-13 work is merged locally into `main`. The
baseline remains intact at `139f57fa2e84ef093e1ddf30546671fc041d3ee7`; no push,
tag, release, AOPS-14 work, or private-engine source change was performed.

## Local merge chain

- `4e4d587` — AOPS-12 implementation
- `48a8432` — local no-ff AOPS-12 merge
- `d3fa7e8` — AOPS-13 implementation
- `4b1f92c` — local no-ff AOPS-13 merge

`main` is five commits ahead of `origin/main` (the fifth is this acceptance
record); `origin/main` is unchanged.

## Gates

| Gate | Result |
|---|---|
| TypeScript | PASS |
| ESLint | PASS |
| Extension tests | PASS — 78 files, 2811 tests |
| Chrome MV3 build | PASS |
| Release safety | PASS — 10 files, 1367 tests |
| Companion quality | PASS — Ruff, mypy, 353 tests, OpenAPI snapshot |
| Application Ops workflow gate | PASS |
| Post-merge typecheck | PASS |
| Post-merge OpenAPI and whitespace checks | PASS |
| Browser smoke | PASS — desktop and 390px mobile options surfaces; standalone fallback and HH denial copy verified |

## Boundary confirmation

Auto-apply, HH form/API writes, hidden HH requests, external messaging,
automatic AI/provider calls, cookies/passwords/session handling, CAPTCHA
bypass, developer telemetry, and private V4 data remain out of Core.
