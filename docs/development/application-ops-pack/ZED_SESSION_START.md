# Claude + DeepSeek Session Contract

The filename is retained for compatibility with existing launcher prompts.
Claude is the coding-agent surface and DeepSeek is the selected executor/model.

You are implementing exactly one VacancyPilot Application Ops epic in the open
VacancyPilot repository root containing
`docs/development/application-ops-pack/`.

Act as a careful repository-native coding agent. Do not treat a prose claim as
evidence that work or tests passed.

## Mandatory preflight

Before editing:

1. Read `AGENTS.md` completely.
2. Read `docs/Техническое заданиеV.1.md` completely, as required by
   `AGENTS.md`.
3. Read `docs/development/CODEX-RUNTIME-BRIEF.md`.
4. Read the target AOPS prompt completely.
5. Read the files explicitly listed by that prompt.
6. Inspect the current implementation and reuse repository patterns.
7. Run:

```powershell
git status --short --branch
git branch --show-current
git rev-parse HEAD
git rev-parse refs/remotes/origin/main
git log --oneline --decorate -5
git show-ref --tags --verify refs/tags/v4.0.0
```

The only implementation branch is `main`. Pull requests and feature branches
are not part of this workflow. At preflight the worktree must be clean, `HEAD`
must equal the existing `origin/main` remote-tracking ref, and the preceding
epic must be committed and marked complete in
`docs/development/application-ops/IMPLEMENTATION_STATUS.md`. If any condition
is false, stop without editing and report the exact blocker. Do not pull,
merge, rebase, switch/create branches, reset, clean, stash, or overwrite
unknown changes from the executor session.

The tag command may exit nonzero when `v4.0.0` is absent. Record either its
exact object ID or `ABSENT` at preflight. The same state must remain at handoff:
never create, move, force-update, or delete this tag.

The specification commit
`71ab48c48376a1e7b44ed0733fdc9aa435f39e76` is historical context, not a target
to reset to. Verify ancestry when relevant; record the actual clean start
commit.

Prepared predecessor `e36a067ae4e8ef931bf0f151712016cb4dbce47e` must also be
an ancestor of the current HEAD. Repo-native pack import
`8117cc7ec479210a027bc09954d9069c65d23bd4` must also be an ancestor. The pack
and canonical MVP spec must be present in the open repository.

## Absolute product constraints

Never introduce:

- auto-submit or auto-apply;
- auto-clicks or synthetic events on HH controls;
- programmatic writes to HH forms;
- hidden HH page/API requests from the extension;
- cookies, passwords, browser session tokens, CAPTCHA or antibot bypass;
- unofficial/private HH endpoints;
- broad HH host permissions in the extension;
- refresh/application/provider secrets in Dexie, SQLite, exports, logs, test
  fixtures, screenshots, or Git;
- developer telemetry by default;
- cloud backend, Streamlit, a second web frontend, microservices, Redis,
  Celery, Kafka, PostgreSQL, Docker requirement, or Kubernetes.

HH network integration belongs to the loopback companion and uses documented
official endpoints only. All external actions remain human-controlled.

## Implementation discipline

- Keep the diff inside the current epic.
- Preserve existing standalone extension behavior.
- Use the existing WXT/React/Dexie patterns.
- Companion stack: Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic,
  SQLite, httpx, keyring, pytest, Ruff, mypy, uv.
- Bind companion only to `127.0.0.1`.
- Add focused tests in the same epic.
- Update docs/contracts/schema/export/delete/backup when the change requires it.
- Use UTC timestamps and explicit revision/idempotency semantics.
- Do not invent candidate facts, evidence IDs, HH capabilities, API endpoints,
  successful outcomes, or test results.
- Do not weaken, skip, delete, or rewrite a failing test merely to obtain PASS.
- Do not edit Application Engine V4 source facts/rules. Runtime code consumes a
  versioned package and may use synthetic fixtures in tests.

## Secrets and live dependencies

Use fakes/mocks for normal tests. If HH credentials, an AI key, OS keyring, a
registered redirect URI, Chrome, or Edge is unavailable, implement and test the
offline contract, then report the live/manual gate precisely. Do not create a
fake live PASS.

## Git policy

You may inspect Git and create normal source files. Do not:

- commit;
- push;
- force anything;
- change remote configuration;
- switch branches;
- create a pull request or feature branch;
- delete or rewrite unrelated work.

Leave the completed reviewed diff in the worktree.

After handoff, Codex independently reviews and tests the diff. Only Codex/user
may commit the accepted epic directly to `main` and push `main` to `origin`.
No PR is opened. Epics are strictly serial: do not start the next executor
session until the reviewed commit is pushed and the worktree is clean.

## Validation

Run every command required by the target prompt. When applicable, the full
quality set is:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
pnpm verify:companion
```

If a canonical command differs after AOPS-01, use the documented repository
command and explain the difference.

## Required final handoff

Return:

1. Summary of implemented behavior.
2. Changed files grouped by purpose.
3. API/schema/migration/permission/security changes.
4. Tests added.
5. Commands actually run with exit status and concise output.
6. Acceptance checklist with PASS/FAIL/NOT RUN per item.
7. Residual risks, manual gates, or blockers.
8. `git diff --stat` and `git status --short`.
9. Start `HEAD`, current branch, and whether it matched `origin/main` at
   preflight.

Do not say “done” or “PASS” for an item that was not verified.
