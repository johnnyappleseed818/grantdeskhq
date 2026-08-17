# GTM Command Center production gap audit

- **Audit date:** 2026-08-17
- **100%-traffic revision:** `grantdeskhq-prototype-00152-vem`
- **Application source revision reported by health:** `dc69deacffe485f8f1e8eb421775ea018346b425`
- **Candidate branch:** `feature/gtm-command-center-kpis`

## Live state

The live dashboard retains the original Daily hot list, manual social research, signal engines, referral channels, progress, SHADOW outreach controls, and accuracy controls. It does not include the canonical Control Plane queue tab, contact-enrichment state, persisted queue freshness, or founder-level current/target/gap KPI tables.

## Existing but not live

The follow-on GTM branch already includes a protected Control Plane reconciliation endpoint, direct-lead state machine, Hunter/Apollo SHADOW enrichment architecture, and persistent suppression gate. The direct queue data is stored in Firestore. Its dashboard view is not on the 100%-traffic revision.

## This candidate

The candidate adds an internal, admin-protected overview backed only by the persisted Control Plane reconciliation, SHADOW status, and enrichment usage. It shows direct-pipeline current/target/gap values, data freshness, enrichment limits, top enrichment candidates, and a no-send customer funnel.

Partner research exists in reviewed artifacts but does not yet have a canonical persisted pipeline. The candidate deliberately labels partner counts `Not instrumented`; it does not manufacture actuals. Google Analytics remains the web-traffic source of truth and is not duplicated.

## Data freshness

A reconciliation is HEALTHY only when its persisted timestamp is within 36 hours. Earlier reconciliation records have no persisted timestamp, so they intentionally display STALE until the private reconciliation job writes the next record. Missing/unaccounted is shown as zero only for a successfully loaded canonical reconciliation.

## Safety

The candidate adds no delivery integration, email action, scheduling, social action, contact form, paid enrichment request, Stripe behavior, or production traffic change. All endpoints require the existing GTM-admin gate.
