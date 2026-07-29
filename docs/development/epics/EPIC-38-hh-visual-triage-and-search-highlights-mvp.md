# EPIC-38: HH Visual Triage And Search Highlights MVP

Status: done

Delivered by `1d55ab0`, `63474fb`, and `e6c3958`; rendering/discovery
hardening followed in `71ab48c` and `083d360`.

## Goal

Extend the current HH search-triage runtime with a local-first visual layer that marks already viewed vacancies and surfaces richer local status directly on HH search cards, without adding sensitive permissions or hidden network behavior.

## Inputs

- `docs/Техническое заданиеV.1.md`
- `docs/vacancypilot_hh_visual_triage_concept_2026-06-22.md`
- `docs/development/hh-visual-triage-decision-report.md`
- current search-triage baseline from `EPIC-20`
- current search-surface/runtime work prepared in `EPIC-35` and `EPIC-36`

## In Scope

- local vacancy visit marks in IndexedDB;
- vacancy-page view recording for user-opened HH vacancy pages;
- batched card highlight state using local visit marks, jobs, and settings;
- safe search-card rendering for viewed/saved/rejected/known-score states;
- Search Highlights settings and small local controls where they materially help;
- export/delete/test/manual-QA coverage for the new local data.

## Explicitly Deferred

- browser history import or `history` permission;
- `tabs` permission;
- hidden HH fetch/XHR;
- search-time AI scoring or remote requests;
- company history counters, duplicate hints, and saved-search snapshots in MVP;
- resume/candidate-page support;
- full dashboard/kanban expansion for viewed-only records.

## Success Criteria

- HH search results become meaningfully easier to triage using only local VacancyPilot knowledge;
- viewed-only cards stay separate from saved jobs and do not pollute tracker workflows;
- no new sensitive permissions are introduced;
- the implementation stays compatible with dynamic HH result pages and existing search quick actions.
