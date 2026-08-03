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
7. Run the target epic commands independently.
8. Run broader regression commands proportional to risk.
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
