# GTM contact enrichment — SHADOW only

The contact-enrichment pipeline prepares an auditable business-contact record for human review. It never sends email, schedules delivery, submits a form, or enables a delivery provider.

## Flow

Recent grant signal → verified organization domain → current finance/grants persona → Hunter Email Finder and Verifier → Apollo fallback only when Hunter is not verified → provenance → suppression/history check → SHADOW draft → human approval.

The primary endpoint is `POST /api/gtm/contact-enrichment`. It is restricted to an authenticated GrantDeskHQ GTM administrator, accepts only a named organization/person/domain and authoritative role/domain sources, and returns a SHADOW record. It does not accept a browser-supplied email, price, delivery instruction, or send action.

## Provider configuration

Provider calls are disabled unless all of the following are explicitly configured on the private runtime:

- `GTM_CONTACT_ENRICHMENT_ENABLED=true`
- `HUNTER_API_KEY` injected from the Secret Manager secret `grantdeskhq-hunter-api-key`
- `HUNTER_MAX_LOOKUPS_PER_RUN` set to a positive, bounded number

Apollo is optional and remains the secondary fallback:

- `APOLLO_API_KEY` injected from `grantdeskhq-apollo-api-key`
- `APOLLO_MAX_LOOKUPS_PER_RUN` set to a positive, bounded number

Secrets must be attached as runtime secret environment variables; they must never be passed to a browser, written to source, committed, logged, or included in reports. A configured limit of `0` disables that provider. Hunter is always attempted first. Apollo is called only when Hunter does not return a verified business email.

## Decision and safety gates

- `VERIFIED` can proceed only to the suppression check.
- `ACCEPT_ALL`, `UNKNOWN`, `INVALID`, and `NOT_FOUND` cannot become ready; non-verified Hunter outcomes may use the Apollo fallback.
- `SUPPRESSED` wins over every provider result.
- `READY_FOR_HUMAN_APPROVAL` requires a current role source, a verified business email matching the organization domain, and a `CLEAR` suppression lookup.
- No application code generates an email from a pattern. Provider results that do not match the verified organization domain are discarded.

Contact results are stored at `gtm/contact-enrichments/{contact-key}`. Usage counters are stored at `gtm/contact-enrichment-usage/current`. Suppression records use a SHA-256 email hash as their document ID rather than storing the address in the path.

## Suppression/history coverage

The runtime checks the hashed `gtm/contact-suppressions` record and the existing `organizations.ownerEmail` account record. A history-read failure remains `UNKNOWN`, which blocks readiness. Future unsubscribe, bounce, complaint, DNC, prior-outreach, duplicate, and customer-state writers must call the same suppression record function rather than bypassing this gate.

## Cost controls

The pipeline caches a contact key formed from organization, verified domain, and person. Verified results refresh after 30 days; unresolved results are eligible for a retry. It tracks Hunter lookups, Hunter verifications, Apollo lookups, verified emails, not-found contacts, and provider successes. It does not make a provider call when the provider is disabled, its secret is absent, or its configured per-run limit is exhausted.

## Outbound boundary

All generated copy remains `SHADOW_DRAFT`. The approved offer is: “We're offering introductory Growth pricing to 25 nonprofit customers at $99/month, normally $199/month.” The approved CTA is: “Would you be open to trying it with one award for free?” The existing Free First Report flow supports one initial report at no cost and does not make the ongoing Growth subscription free.
