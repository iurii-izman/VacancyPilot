# HH Official API Evidence

Checked: 2026-08-30 UTC, against the current official HH OpenAPI documentation.

Sources:

- https://api.hh.ru/openapi/redoc
- https://github.com/hhru/api/blob/master/docs/authorization.md
- https://github.com/hhru/api/blob/master/docs/negotiations.md

| Area | Official implementation-relevant fact |
|---|---|
| Base API | `https://api.hh.ru/`, HTTPS, JSON |
| Request identity | `User-Agent` is required; `HH-User-Agent` is accepted where a client cannot send `User-Agent`. This implementation sends both. |
| Public token | `POST https://api.hh.ru/token`, form encoded; application token is long-lived and must be kept out of browser storage. |
| Vacancy search | `GET /vacancies`; vacancy detail is `GET /vacancies/{vacancy_id}`. |
| Pagination | `per_page` maximum is 100; vacancy search depth is bounded by 2000 results. The service owns `page` and `per_page`. |
| Common search fields | `text`, `area`, `experience`, `employment`, `schedule`, `salary`, `only_with_salary`, `professional_role`, `search_field`, `period`, and `order_by` are supported official query concepts. |
| OAuth authorize | `https://hh.ru/oauth/authorize`; user authorization uses `response_type=code`, `client_id`, `state`, `redirect_uri`, `code_challenge`, and `code_challenge_method=S256`. |
| OAuth exchange | Server-side `POST https://api.hh.ru/token` with form-encoded authorization-code parameters and `code_verifier` when PKCE is used. |
| Current user | `GET /me` is the documented token check/current-user resource. |
| Applicant resumes | The applicant resume resources are exposed by the official API and require user authorization; consumed endpoint details are verified from the downloaded OpenAPI before AOPS-11 implementation. |
| Applicant negotiations | `GET /negotiations` and `GET /negotiations/{id}` are documented applicant read resources; collection links may also be returned from vacancy relations. |
| Errors | OAuth failures include 401/403-style authorization failures; 403 can mean an unavailable capability. 429 and 5xx are handled with bounded retry only where safe. |
| Deliberately unused writes | No vacancy management, favorite mutation, response/application, negotiation state mutation, message send/edit, hide, or employer write endpoint is used. |

No large documentation excerpts are copied here. Endpoint details not needed by
AOPS-10 remain deferred to the AOPS-11 evidence document.
