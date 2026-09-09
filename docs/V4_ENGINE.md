# Full V4 Engine Boundary

Full V4 is a local/private analysis capability. The real engine package and
candidate knowledge live outside the public repository.

## Installation boundary

The default private source is `.local/private-engine/`. The Companion installs
and verifies the package under `.local/data/companion/engine/`; the active local
metadata currently reports engine `4.0.1`. Use the commands in
[`development/LOCAL_SELF_CONTAINED_SETUP.md`](development/LOCAL_SELF_CONTAINED_SETUP.md).

The public `companion/tests/engine_fixtures/valid-minimal` package reports
`4.0.0` deliberately. It is synthetic regression/compatibility coverage, not
the private production package. Historical bridge/prompt compatibility labels
must not be interpreted as the installed engine version.

## Analysis semantics

The application workspace exposes a provider-free Preview and a separately
confirmed Execute action. Preview does not call an AI/provider. When a selected
HH vacancy is incomplete, the readiness path can first hydrate it through the
official read-only HH API and persist that vacancy snapshot; this is why the
workflow describes Full V4 Preview as provider-free with no application/status
side effects, rather than as fully side-effect-free.

Full V4 output is persisted only after validation. Evidence references remain
distinct from generated text: a cover letter is a draft and never evidence.
When the decision is `SKIP`, no letter is generated.

## Application boundary

The bounded R5 flow is:

```text
Preview → explicit confirmation → Execute → review → manual HH action
→ explicit Confirm Applied
```

Application Factory queue preparation does not create an application and never
sets `APPLIED`. No extension code clicks HH controls, writes HH form fields,
dispatches synthetic form events, or treats opening/copying a vacancy or letter
as an application action.
