# Codex Review Gate

Use after each DeepSeek epic and before committing it.

## Review order

1. Confirm the target branch is `main`, `HEAD` started at `origin/main`, and
   the diff contains only the current epic.
2. Read the DeepSeek handoff, but independently inspect the code.
3. Inspect:

```powershell
git status --short --branch
git diff --check
git diff --stat
git diff
```

4. Trace new persisted fields through migration, repository, export, delete,
   backup, fixtures and UI contracts.
5. Trace new API fields from FastAPI schema to TypeScript consumer.
6. Review safety-sensitive changes: manifest permissions, localhost binding,
   CORS, pairing, keyring, logging, HH requests and AI payloads.
7. Run focused tests for the behavior changed by the epic, plus the static
   checker for each changed language and any directly affected schema,
   migration, permission, or contract check.
8. Do not run repository-wide, release, browser, or deep-security suites for
   ordinary epic review. Record them as deferred to the consolidated release
   gate. Run an extra broad gate only when the user explicitly requests it or
   a focused failure proves that wider impact must be diagnosed.
9. Return exactly one verdict:

```text
PASS
NEEDS_FIX
BLOCKED
```

## PASS requirements

- acceptance criteria are observable in code/tests;
- no unexplained skipped or failing command;
- no unsupported runtime behavior or invented evidence;
- no secret-bearing artifact;
- no unrelated cleanup/refactor;
- standalone mode remains functional when required;
- work is ready for one epic commit.

A focused PASS is not a release PASS. The handoff must list every broader
suite as DEFERRED_TO_RELEASE_GATE; never imply that an unrun suite passed.

## Consolidated release gate

Broad commands such as pnpm verify, pnpm test:release, the complete
pnpm verify:companion suite, browser smoke runs, performance runs, and Codex
Security scans are postponed until the final integration/release epic.
Earlier security-sensitive epics still require narrow negative tests for the
exact boundary they change, but do not trigger a repository scan by default.

Start an earlier deep or repository-wide scan only for a demonstrated critical
signal: remote or cross-origin exposure, credential disclosure, destructive
data loss, authorization bypass on real domain operations, or an explicit
user request.

## NEEDS_FIX

Create a micro-prompt containing:

- exact failing behavior;
- file/function/test evidence;
- bounded requested change;
- tests that must prove closure;
- explicit non-goals.

Do not ask the agent to “review everything again.”

## BLOCKED

Use only when completion depends on a real external prerequisite, such as:

- existing dirty work not owned by the epic;
- unresolved architecture choice;
- unavailable/private API capability;
- missing registered OAuth redirect;
- missing canonical engine artifact;
- a user decision about committing private candidate data.

## Commit after PASS

DeepSeek does not commit. After PASS, the reviewer/user commits only reviewed
paths with the message specified in the epic prompt directly to `main`, pushes
`main` to `origin`, and confirms `HEAD == origin/main` plus a clean worktree.
Do not create a feature branch or pull request. Do not start the next epic
until that direct-main checkpoint is complete.
