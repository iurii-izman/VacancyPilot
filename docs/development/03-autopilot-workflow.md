# Cursor / Codex / Zed Autopilot Workflow

Use one prompt per iteration. The prompt files in `docs/development/prompts/` are the canonical source for autopilot instructions and should be used instead of ad hoc chat prompts.

## Standard Autopilot Run

1. Start from a clean working tree.
2. Read `AGENTS.md`.
3. Read `docs/Техническое заданиеV.1.md`.
4. Read `docs/development/CODEX-RUNTIME-BRIEF.md`.
5. Read the target epic file.
6. Read the target iteration file.
7. Paste the matching prompt.
8. Let autopilot implement only that iteration.
9. Review diff.
10. Run validation commands.
11. Commit with the suggested commit message.
12. Update `docs/development/02-iteration-map.md` status if appropriate.

## Zed Session Setup

When using Zed, paste this once at the beginning of the AI chat:

```text
docs/development/prompts/ZED-SESSION-START.md
```

Then paste only the target iteration prompt.

Zed should implement and validate, but should not commit or push unless explicitly instructed. Prefer returning to Codex for review, commit, and push after each iteration.

## Prompt Contract

Every prompt must include:

- target iteration;
- source docs;
- exact task;
- allowed files/folders;
- non-goals;
- safety constraints;
- validation commands;
- expected final response.

For late-stage implementation rows, prefer:

- `AGENTS.md`
- `docs/Техническое заданиеV.1.md`
- `docs/development/CODEX-RUNTIME-BRIEF.md`
- target epic file
- target iteration file

The runtime brief is a navigation aid and does not replace the mandatory
master-spec read.

## Review Checklist

Before accepting an autopilot diff:

- no permissions added beyond the iteration;
- no hidden HH network calls;
- no DOM writes to HH forms;
- no secrets;
- no broad refactor;
- tests or fixtures match the scope;
- generated files are ignored;
- implementation follows the master spec.

## When To Stop Autopilot

Stop and split the task if it:

- starts implementing AI before local scoring exists;
- adds backend services;
- adds auto-fill or synthetic input;
- broadens host permissions;
- rewrites the whole architecture;
- removes safety checks to make tests pass.
