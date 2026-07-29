# Development Pack

This folder turns the final specification into implementable work units for Codex/Cursor.

Read in order:

1. `docs/Техническое заданиеV.1.md`
2. `00-product-development-plan.md`
3. `01-epics.md`
4. `02-iteration-map.md`
5. `03-autopilot-workflow.md`
6. `CODEX-RUNTIME-BRIEF.md`
7. `04-zed-deepseek-workflow.md`, if using Zed
8. target file in `epics/`
9. target file in `iterations/`
10. matching prompt in `prompts/`

## Start Here

Current implementation status:

```text
ITER-059 complete
EPIC-37 complete (ITER-076..ITER-078: 2026-06-22 audit closure)
phase 1 code, hardening, and closeout gate complete on 2026-06-20
phase 2 pack complete on 2026-06-20
phase 3 workflow-assist pack complete on 2026-06-20
dependency/toolchain maintenance pack complete on 2026-06-20
security-alert closure pack complete on 2026-06-21
phase 4 hr communication hub complete on 2026-06-21
post-audit reliability and scoring pack complete on 2026-06-21
final security tail closure complete on 2026-06-21
private release readiness pack complete on 2026-06-21
next active sequence: AI/release-trust
next active iteration: ITER-060
```

Recommended next action:

```text
1. Review docs/development/00-product-development-plan.md
2. Start ITER-060 (AI settings lifecycle + first real BYOK provider)
3. Continue through ITER-061 and ITER-062 one row at a time for AI assist quality
4. Keep the queued UI/UX pack (`ITER-065`..`ITER-068`) ready but do not start it before the current AI row is reviewed
5. After the UI/UX pack, run the runtime stabilization follow-up pack (`ITER-069`..`ITER-071`) only if the manual screenshots/runtime defects still reproduce
6. After that, use the runtime visual consistency pack (`ITER-072`..`ITER-075`) for the remaining screenshot-driven UX cleanup
7. The 2026-06-22 audit is closed — see `docs/development/audit-2026-06-22-closure-report.md`
8. The HH Visual Triage / Search Highlights pack (`EPIC-38`, `ITER-079`..`ITER-081`) is complete, including follow-up search-card discovery hardening
9. Keep ITER-043 deferred until the n8n permission model is explicitly reopened
```

For Zed, paste `docs/development/prompts/ZED-SESSION-START.md` once before the first iteration prompt.

For Codex/new chats on late-stage rows, the default minimal read set is:

```text
AGENTS.md
docs/Техническое заданиеV.1.md
docs/development/CODEX-RUNTIME-BRIEF.md
target epic doc
target iteration doc
```

The runtime brief reduces repeated navigation; it does not replace the
master-spec read required by `AGENTS.md`.

If Zed reports residual risks after an iteration, use:

```text
docs/development/prompts/RISK-CLOSURE.md
```

Run it in the same Zed chat before asking Codex to review.

Remaining implementation prompt, if webhook automation returns to scope later:

```text
ITER-014: n8n Events
Prompt: docs/development/prompts/ITER-014.md
```

Manual QA, audit, and concept inputs:

```text
docs/development/manual-qa-run-2026-06-20.md
docs/development/audit-2026-06-22-decision-report.md
docs/development/audit-2026-06-22-closure-report.md
docs/development/hh-visual-triage-decision-report.md
docs/development/ITER-022-triage-report.md
docs/development/ITER-027-triage-report.md
docs/development/phase-2-start-gate.md
```

## Status

The first post-signoff hardening pack is complete. The second audit follow-up fix pack (`ITER-028`..`ITER-031`) is also complete. `ITER-032` closed the manual/infrastructure gate, Phase 2 implementation ran through `ITER-038`, the workflow-assist/Labs pack ran through `ITER-042`, the dependency/toolchain maintenance pack ran through `ITER-050`, the security-alert closure pack ran through `ITER-054`, the HR communication pack ran through `ITER-045`, the post-audit reliability/scoring pack ran through `ITER-058`, the final security tail closure landed through `ITER-059`, and the private release readiness pack landed through `ITER-063` and `ITER-064`. The 2026-06-22 full audit closure pack (`EPIC-37`: `ITER-076`..`ITER-078`) is complete — Sonar coverage is configured, HR timeline trust surface is hardened, and the closure report is committed at `docs/development/audit-2026-06-22-closure-report.md`. The HH Visual Triage / Search Highlights MVP (`EPIC-38`: `ITER-079`..`ITER-081`) is also complete and includes follow-up search-card discovery hardening. The next active iterations remain `ITER-060`..`ITER-062` under `EPIC-31`; other prepared UI/runtime rows remain governed by their explicit gates. The master specification remains frozen unless a change affects product boundaries, permissions, data model, or external data flows.
