# VacancyPilot Application Ops — Claude + DeepSeek Implementation Pack

Source specification:
`docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md`.

Target repository:
the repository root containing this pack.

## Verdict on the workflow

Claude + DeepSeek is suitable as an implementation executor when every run has a
narrow scope, objective acceptance criteria, mandatory tests, and a separate
review gate. DeepSeek must not be the authority for product scope, security
boundaries, candidate facts, HH API behavior, or final PASS.

The safe loop is:

```text
clean reviewed checkpoint
→ ask Claude to read ZED_SESSION_START.md (compatibility filename)
→ paste exactly one AOPS epic prompt
→ DeepSeek implements and reports, but does not commit
→ Codex reviews the diff and reruns tests
→ micro-prompt or direct correction when needed
→ Codex commits and pushes the accepted epic directly to main
→ next epic
```

## Why the original nine epics were split

The source backlog is architecturally sound but too broad for one-agent runs.
For example, its dashboard epic combines seven UI surfaces, multiple APIs,
state management, accessibility, and error handling. This pack decomposes P0
into 18 reviewable checkpoints and keeps conditional P1 work in `AOPS-18`.

## AOPS-00 readiness

The target repository was prepared on 2026-07-29. Before this repo-native pack
was imported, the clean predecessor state was:

```text
historical preparation branch: codex/application-ops-mvp
pre-import predecessor: e36a067ae4e8ef931bf0f151712016cb4dbce47e
worktree: clean
historical MVP baseline in the source spec:
71ab48c48376a1e7b44ed0733fdc9aa435f39e76
```

The prior Search Highlights runtime fix and its documentation were preserved.
Its documentation closure is commit
`e36a067ae4e8ef931bf0f151712016cb4dbce47e`; local `main` was fast-forwarded,

Repo-native pack import commit
`8117cc7ec479210a027bc09954d9069c65d23bd4` and prepared predecessor
`e36a067` must remain ancestors of the current clean HEAD. AOPS-00 records the
exact start commit.

Run this read-only preflight before pasting AOPS-00:

```powershell
git status --short --branch
git branch --show-current
git rev-parse HEAD
git merge-base --is-ancestor 71ab48c48376a1e7b44ed0733fdc9aa435f39e76 HEAD
pnpm verify
pnpm test:release
```

Expected implementation branch is `main`; repo-native import `8117cc7`
and prepared predecessor `e36a067` must be ancestors of HEAD. If the branch
differs or the worktree is dirty, do not reset, clean, stash, switch, or pull
from inside the Zed run; return the exact blocker for review.

The inspected local clone and its configured `origin` had no `v4.0.0` tag on
2026-07-29. Treat tag state as an invariant: if a later clean baseline contains
the tag, preserve its exact target; if it is still absent, do not create it as
part of these epics.

## How to run an epic

1. Open the VacancyPilot repository root in Claude with DeepSeek selected.
2. Start a new Claude/DeepSeek session for the epic.
3. Ask the agent to read the repo-local session contract and exactly one
   matching prompt completely.
4. Let the agent inspect, implement, test, and produce its handoff.
5. Do not accept a textual PASS without command output.
6. Return the diff and handoff to Codex for review.
7. Apply a focused micro-prompt if review finds a bounded issue.
8. Commit only after review passes.

For the next epic, AOPS-03, start a new Claude/DeepSeek session with exactly:

```text
Read these two repo-local files completely and follow them as one combined
instruction, in this order:

1. docs/development/application-ops-pack/ZED_SESSION_START.md
2. docs/development/application-ops-pack/prompts/AOPS-03.md

Implement only AOPS-03. Do not commit or push. Return the required handoff and
leave the reviewed diff in the worktree.
```

For later epics, change `AOPS-03` in both places to the next accepted epic
number. If Claude cannot resolve repo-local paths, attach those two files from
the open workspace. No file from another workspace is required.

One epic prompt may contain many coding steps, but it must remain one coherent
review unit. Do not concatenate two epic prompts.

## Direct-main commit policy

DeepSeek does not commit or push. After review:

```powershell
git status --short
git diff --check
git add <reviewed paths>
git commit -m "<reviewed epic commit message>"
git push origin main
```

Codex/user performs these commands directly on `main`; no feature branch or PR
is created. Every next epic starts only after `main` is pushed and the worktree
is clean. Never use force-push, destructive reset, or checkout to discard
unknown changes.

## Files in this pack

- `EPIC_MAP.md` — sequence, dependencies, scope and gates.
- `ZED_SESSION_START.md` — common agent contract pasted before each epic.
- `CODEX_REVIEW_GATE.md` — review checklist and verdict rules.
- `MICROPROMPT_TEMPLATES.md` — bounded remediation templates.
- `BASELINE_READY.md` — exact prepared Git state and executed test evidence.
- Executor prompts for completed/deferred AOPS runs were retired from the
  current tree during the 2026-09-01 release-hygiene pass. Retrieve an old
  prompt from Git history through [`../../HISTORY.md`](../../HISTORY.md) when
  historical reconstruction is required.

## Product/runtime distinction

DeepSeek through Claude is the coding executor. That does not automatically make DeepSeek
an AI provider inside VacancyPilot. Product provider support remains:

- P0: current OpenAI BYOK plus the manual ChatGPT bridge described by the MVP;
- P1/explicit decision: DeepSeek provider adapter.

Do not mix coding-tool credentials with product runtime credentials.

## Private Application Engine workspace

The separate `workoutreachHH` workspace contains private candidate facts,
corpora, pilot outcomes, release archives, and V4 tooling. It is intentionally
not vendored into this repository. AOPS-07 implements and tests the package
boundary with synthetic fixtures; optional real-package verification receives
an explicit local source path at runtime and never commits that payload.
