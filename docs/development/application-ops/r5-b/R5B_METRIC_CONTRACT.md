# R5-B Metric Contract

Applications sent means an application with `applied_at` and an explicit
`application_confirmed` event. Responses are explicit persisted workflow
states/events (`hr_replied` and later response states); absence is pending,
never rejection. Interviews and offers are explicit states. Response time is
the first explicit response event minus `applied_at`, in UTC. Rates always
show their denominator and return unknown when it is zero.

The read model is descriptive only. Score bands are `<50`, `50–69`, and `70+`;
unknown remains unknown. Role family and source come from persisted vacancy
fields. Search Profile attribution uses the normalized many-to-many hit table;
multi-profile attribution is visible in breakdowns and does not duplicate the
canonical application count. AI totals sum persisted engine-run usage; cost
is unknown unless every included run has authoritative persisted cost. Cached
reuse is not a provider call. No outcome, rejection reason, causality, or
calibration is inferred.
