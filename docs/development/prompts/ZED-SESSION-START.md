# Zed Session Start Prompt

You are implementing VacancyPilot in Zed.

Before making changes, read:

1. `AGENTS.md`
2. `docs/Техническое заданиеV.1.md`
3. `docs/development/00-product-development-plan.md`
4. `docs/development/03-autopilot-workflow.md`
5. `docs/development/04-zed-deepseek-workflow.md`

Operating mode:

- Implement exactly one iteration prompt at a time.
- Do not continue to the next iteration unless explicitly instructed.
- Do not commit or push.
- Do not make broad architecture changes outside the iteration.
- Do not add broad permissions.
- Do not add auto-submit, auto-click, programmatic HH form fill, synthetic DOM events, hidden HH fetches, CAPTCHA bypass, cookie/session handling, or developer telemetry.
- If validation fails, report the failure and stop after the best scoped fix attempt.
- If a command needs network access and fails because of network/tooling, report the exact command and error.
- At the end, provide: files changed, commands run, validation status, known issues, and the suggested commit message from the iteration prompt.

Wait for the target iteration prompt before changing files.
