# R5-A Current State

The existing journey is Inbox → Application Card → existing V4 action →
Cover Letter Studio → copy/open HH → user applies manually → canonical
APPLIED transition. R4 had no multi-select, resumable queue, or fast review
mode. The largest friction points were repeated card navigation, no persisted
selection, and no bounded session resume.

R5-A keeps analysis in `AnalysisService` and keeps letter/application writes
in their existing services. The new session tables are orchestration state;
they never become application status. The API boundary is the loopback
companion and requires the existing client token. Preview is a pure DB read.
