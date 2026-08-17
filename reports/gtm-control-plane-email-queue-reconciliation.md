# GTM Control Plane email-queue reconciliation

Generated 2026-08-17 from the private runtime-owned Firestore reconciliation. This is strictly SHADOW / human-review-only work: it creates no delivery, email schedule, contact-form, social, paid-enrichment, Stripe, or production-traffic action.

## Runtime evidence and scope

- Authoritative source: Firestore gtm/daily-awards, scanned at 2026-08-16T13:35:04.406Z, combined with the seeded Control Plane opportunities.
- Enumeration: private Cloud Run Job grantdeskhq-control-plane-reconciliation, execution grantdeskhq-control-plane-reconciliation-7rrxx, completed successfully at 2026-08-17T04:46:22.666190Z under the runtime identity. It saved the card-level ledger to private Firestore document gtm/control-plane-reconciliation.
- Direct VM access: remains correctly denied (PERMISSION_DENIED) and was not broadened. The runtime job is the least-privilege reader for the current Firestore-only scan.
- Method: every card is deduplicated by canonical organization and assigned exactly one mutually exclusive state. The state counts below sum to all 106 current cards.

## Final reconciliation - real counts

CONTROL PLANE CARDS: 106
UNIQUE ORGANIZATIONS: 96
QUALIFIED: 0
ALREADY IN TARGET EMAIL QUEUE: 4
NEWLY ADDED TO TARGET QUEUE: 0
CONTACT RESEARCH REQUIRED: 90
ENRICHMENT REQUIRED: 2
EMAIL VERIFICATION REQUIRED: 0
SUPPRESSION CHECK REQUIRED: 0
DRAFT REQUIRED: 0
READY FOR HUMAN REVIEW: 4
ALREADY CONTACTED: 0
CUSTOMERS: 0
DISQUALIFIED: 0
DUPLICATES: 10
MISSING / UNACCOUNTED FOR: 0
REAL EMAILS SENT: 0

QUALIFIED is a queue state, not a count of source-qualified organizations. All 96 canonical organizations have an evidence-backed award signal; 90 need current finance/grants contact research, two have a current person but no established direct business address, and four have a preserved direct business route plus a source-grounded draft and a CLEAR runtime suppression result. Those four are retained only as READY_FOR_HUMAN_REVIEW; no delivery is enabled.

## Required high-intent opportunities

| Organization | Current reconciled state | Handling |
| --- | --- | --- |
| Junior Achievement of South Florida | READY_FOR_HUMAN_REVIEW | Preserved existing direct business route; no Hunter re-lookup. |
| Rodale Institute | READY_FOR_HUMAN_REVIEW | Preserved existing direct business route; no Hunter re-lookup. |
| Project Oceanology | READY_FOR_HUMAN_REVIEW | Alias/deduplication merges the Interdistrict Committee source record; direct route is preserved. |
| Perkins School for the Blind | ENRICHMENT_READY | Relevant contact is known, but no established direct business email. |
| Sustainable Food Center | ENRICHMENT_READY | Relevant contact is known, but no established direct business email. |
| Newer Aug. 16 award signals | CONTACT_RESEARCH_REQUIRED unless represented above | Included in the 106-card runtime scan; source evidence is retained in the private card-level ledger. |

## Automatic forward path

The deterministic reconciliation is already implemented in the daily award-scan path and is stored in the private GTM Control Plane ledger. A separate Cloud Scheduler trigger for the private job could not be created by the VM service account because it lacks only cloudscheduler.jobs.create on projects/grantdeskhq-proto-ek-2026/locations/us-central1. No IAM was broadened and no scheduler was created. If an independent private schedule is required, a project administrator can grant the VM service account a narrowly scoped custom role containing only cloudscheduler.jobs.create (and, for future managed updates, cloudscheduler.jobs.get and cloudscheduler.jobs.update) on that Cloud Scheduler location. This is not required to retain the current canonical reconciliation, and no outbound path exists either way.

## Safety confirmation

REAL PROSPECT EMAILS SENT: 0
PARTNER EMAILS SENT: 0
EMAILS SCHEDULED: 0
CONTACT FORMS SUBMITTED: 0
LINKEDIN ACTIONS: 0
REDDIT ACTIONS: 0
PRODUCTION TRAFFIC CHANGED: NO
LIVE STRIPE CHARGES: 0

Do not run any credit-consuming search, export, enrichment, or personal-contact access without the user's prior explicit approval.
