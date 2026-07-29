# Autopilot Prompts

Use one prompt per autopilot run. Do not combine multiple iterations in one Cursor/Codex/Zed session unless the previous iteration is already committed and the next prompt explicitly depends on it.

## Zed

For Zed with DeepSeek, paste `ZED-SESSION-START.md` once at the beginning of the AI chat, then paste the target iteration prompt.

Zed should not commit or push by default. Review, commit, and push after validation.

If Zed reports residual risks, paste `RISK-CLOSURE.md` in the same chat before returning to Codex for review.

Available prompts:

- `ZED-SESSION-START.md`
- `RISK-CLOSURE.md`
- `ITER-001.md`
- `ITER-002.md`
- `ITER-003.md`
- `ITER-004.md`
- `ITER-005.md`
- `ITER-006.md`
- `ITER-007.md`
- `ITER-008.md`
- `ITER-009.md`
- `ITER-010.md`
- `ITER-011.md`
- `ITER-012.md`
- `ITER-013.md`
- `ITER-014.md`
- `ITER-015.md`
- `ITER-016.md`
- `ITER-017.md`
- `ITER-018.md`
- `ITER-019.md`
- `ITER-020.md`
- `ITER-021.md`
- `ITER-022.md`
- `ITER-023.md`
- `ITER-024.md`
- `ITER-025.md`
- `ITER-026.md`
- `ITER-027.md`
- `ITER-028.md`
- `ITER-029.md`
- `ITER-030.md`
- `ITER-031.md`
- `ITER-032.md`
- `ITER-033.md`
- `ITER-034.md`
- `ITER-035.md`
- `ITER-036.md`
- `ITER-037.md`
- `ITER-038.md`
- `ITER-039.md`
- `ITER-040.md`
- `ITER-041.md`
- `ITER-042.md`
- `ITER-044.md`
- `ITER-045.md`
- `ITER-048.md`
- `ITER-049.md`
- `ITER-050.md`
- `ITER-051.md`
- `ITER-052.md`
- `ITER-053.md`
- `ITER-054.md`
- `ITER-055.md`
- `ITER-056.md`
- `ITER-057.md`
- `ITER-058.md`
- `ITER-059.md`
- `ITER-060.md`
- `ITER-061.md`
- `ITER-062.md`
- `ITER-063.md`
- `ITER-064.md`
- `ITER-065.md`
- `ITER-066.md`
- `ITER-067.md`
- `ITER-068.md`
- `ITER-069.md`
- `ITER-070.md`
- `ITER-071.md`
- `ITER-072.md`
- `ITER-073.md`
- `ITER-074.md`
- `ITER-075.md`
- `PHASE-1-SIGNOFF.md`

Recommended use after `ITER-016`:

1. Capture manual QA findings
2. Run `ITER-017.md`
3. Continue through `ITER-021.md`
4. Run `PHASE-1-SIGNOFF.md` after the runtime rerun passes
5. Run `ITER-022.md` before starting any post-signoff hardening fixes
6. Run `ITER-023.md` through `ITER-026.md` one row at a time for confirmed hardening fixes
7. Run `ITER-027.md` if a new external audit is produced after `ITER-026`
8. Run `ITER-028.md` through `ITER-031.md` one row at a time for the second-audit fix pack
9. `ITER-032.md` is complete; the Phase 2 gate was opened and completed through `ITER-038`
10. Dependency/toolchain maintenance is complete through `ITER-050.md`
11. The enlarged Phase 3 pack is complete through `ITER-042.md`
12. The security-closure pack is complete through `ITER-054.md`
13. The HR communication pack is complete through `ITER-045.md`
14. The post-audit reliability/scoring pack is complete through `ITER-058.md`
15. Run `ITER-059.md` to close the remaining moderate dependency alert
16. Continue with the next active product pack: `ITER-060.md`, then continue one row at a time through `ITER-062.md`
17. Keep `ITER-043.md` and `ITER-014.md` deferred until the n8n permission model is explicitly reopened
18. After `EPIC-31`, the queued GUI/UI/UX follow-up pack is `ITER-065.md` through `ITER-068.md`
19. If manual QA still shows popup/side-panel runtime bugs or narrow-layout friction after that, continue with `ITER-069.md` through `ITER-071.md`
20. After the runtime stabilization pass, use `ITER-072.md` through `ITER-075.md` for the screenshot-driven visual consistency consolidation pack
21. After the 2026-06-22 full audit, do not duplicate its runtime/UI findings in a new pack; keep those on `ITER-069.md` through `ITER-075.md`, then use `ITER-076.md` through `ITER-078.md` only for the remaining repo-local quality/trust closure work
22. For late-stage implementation rows, read `AGENTS.md` + the full master spec + `docs/development/CODEX-RUNTIME-BRIEF.md` + the target epic/iteration docs; the brief is a navigation aid, not a substitute for the spec
23. `ITER-079.md` through `ITER-081.md` use this bounded-context pattern for the completed HH Visual Triage / Search Highlights MVP pack
