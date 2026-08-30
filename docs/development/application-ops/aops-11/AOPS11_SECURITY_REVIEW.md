# AOPS-11 security review

| Area | Result |
|---|---|
| CSRF/state and replay | Random state, five-minute expiry, and consume-before-exchange; replay fails. |
| PKCE/verifier | S256 challenge; verifier stays in companion memory and is not returned. |
| Redirect/open redirect | Redirect URI is a configured non-secret value; no user-supplied redirect is accepted. Browser launch is deferred until HH app registration exists. |
| Secrets | Client secret and refresh token use OS keyring; access token is process-memory only. No SQLite/Dexie/log/OpenAPI persistence. |
| Refresh | One lock-serialized refresh path; rotated refresh token replaces the old keyring value only after a valid response. |
| HTTP boundary | Fixed official HH hosts and explicit read methods; applicant resource methods are GET-only. Token endpoint POST is the sole OAuth POST. |
| Error/log leakage | Sanitized codes only; upstream bodies and credential values are not returned. |
| Data minimization | Applicant sync returns an allowlisted identifier/status projection and does not store raw resume or negotiation bodies. |
| Extension boundary | No HH host permission, browser session access, or token exposure was added. |
| Product writes | No application, negotiation, message, or vacancy-management write methods exist in AOPS-11. |

No P0/P1 issue was found in the implemented, locally testable boundary. Live capability verification remains unrun because the OAuth application is not configured.
