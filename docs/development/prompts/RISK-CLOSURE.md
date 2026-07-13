# Prompt: Residual Risk Closure

Use this after an iteration prompt finishes and before asking Codex to review.

You are still working in the same iteration. Do not start the next iteration.

Read:

1. `AGENTS.md`
2. the iteration prompt you just completed
3. your own final report, especially `Residual risks`

Task: triage and close only residual risks that are clearly inside the current iteration scope and can be fixed safely in a small follow-up patch.

Rules:

- Do not broaden scope.
- Do not start the next iteration.
- Do not add new dependencies unless the completed iteration already requires them.
- Do not add broad permissions.
- Do not add auto-submit, auto-click, HH form fill, synthetic DOM events, hidden HH fetches, cookie/session handling, or telemetry.
- Do not replace deliberate placeholders unless the iteration acceptance criteria require production assets.
- If a risk is valid but belongs to a future iteration, document it as deferred and do not implement it.
- If a risk requires manual browser testing, document the exact manual check and do not pretend it was tested.
- Do not commit or push.

For each residual risk, classify it:

```text
Risk: <original risk>
Decision: fix now | defer | manual check | accept
Reason: <why>
Action: <what changed, or what should happen later>
```

After any scoped fixes, run the iteration validation commands again if possible.

Final response must include:

- risk classification table;
- files changed;
- commands run;
- validation result;
- remaining risks, if any;
- suggested commit message from the original iteration.
