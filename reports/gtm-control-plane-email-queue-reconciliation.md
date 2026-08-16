# GTM Control Plane email-queue reconciliation

Generated 2026-08-16. This is a SHADOW / human-review-only reconciliation. It creates no delivery, schedule, contact-form, social, or paid-enrichment action.

## Sources and coverage

- **Used:** the six seeded `initialOpportunities` Control Plane cards and the twelve source-backed records in `public/gtm/award-signals.json`.
- **Compared with:** the direct prospect and 20-prospect reports, enrichment targets, top-two shadow result, and the no-send target-email state machine. None of the readable Control Plane organizations appears in the prior 20-prospect cohort or top-two enrichment queue.
- **Unavailable or limited:** the VM identity received `403 PERMISSION_DENIED` when reading the authoritative live Firestore document `gtm/daily-awards`. The live-only Aug. 16 scan therefore could not be enumerated from this VM. This report is exhaustive for the 18 readable cards, not a claim that the private Firestore scan has no additional cards.
- **Suppression:** no direct address was advanced. The VM cannot read live suppression/customer-history data, so every preserved direct route remains `SUPPRESSION_CHECK_REQUIRED`.

## Reconciliation result

```text
CONTROL PLANE CARDS: 18
UNIQUE ORGANIZATIONS: 15
QUALIFIED: 15 (evidence-qualified organizations before contact/suppression gates)
ALREADY IN TARGET EMAIL QUEUE: 0
NEWLY ADDED TO TARGET QUEUE: 0 (four direct public routes are queued for suppression confirmation; no live queue write was possible from the VM)
CONTACT RESEARCH REQUIRED: 9
ENRICHMENT REQUIRED: 2
READY FOR HUMAN REVIEW: 0
DISQUALIFIED: 0
DUPLICATES: 3
MISSING / UNACCOUNTED FOR: 0 (across the 18 readable cards)
REAL EMAILS SENT: 0
```

The four preserved target-email candidates are Project Oceanology, Junior Achievement of South Florida, Rodale Institute, and University of Nebraska at Omaha. Their direct business routes are already public in the seeded Control Plane source, so the reconciliation deliberately did **not** call Hunter again. They need only canonical suppression/customer-history confirmation before they can move to a reviewed draft state.

## Card ledger — exactly one state per card

| Organization / card | State | Canonical record or reason |
| --- | --- | --- |
| Perkins School for the Blind | ENRICHMENT_READY | Named finance contact has only an organization inbox. |
| Project Oceanology | SUPPRESSION_CHECK_REQUIRED | Published direct business route preserved; suppression is not confirmed. |
| Junior Achievement of South Florida | SUPPRESSION_CHECK_REQUIRED | Published direct business route preserved; suppression is not confirmed. |
| Sustainable Food Center | ENRICHMENT_READY | Named grants contact has only an organization inbox. |
| Rodale Institute | SUPPRESSION_CHECK_REQUIRED | Published direct business route preserved; suppression is not confirmed. |
| University of Nebraska at Omaha | SUPPRESSION_CHECK_REQUIRED | Published direct business route preserved; suppression is not confirmed. |
| City Island Oyster Reef | CONTACT_RESEARCH_REQUIRED | Recent official award source, but no current contact attached. |
| Interdistrict Committee for Project Oceanology Corporation | DUPLICATE | Merged with the Project Oceanology Control Plane record. |
| Sealaska Heritage Institute | CONTACT_RESEARCH_REQUIRED | Recent official award source, but no current contact attached. |
| Collective Oyster Recycling & Restoration Foundation | CONTACT_RESEARCH_REQUIRED | Recent official award source, but no current contact attached. |
| Trout Unlimited — first card | CONTACT_RESEARCH_REQUIRED | Recent official award source, but no current contact attached. |
| Trout Unlimited — repeated card | DUPLICATE | Repeated organization signal retained under the first Trout Unlimited record. |
| Perkins School for the Blind — award-signal mirror | DUPLICATE | Merged with the seeded Perkins Control Plane record. |
| Ducks Unlimited | CONTACT_RESEARCH_REQUIRED | Recent official award source, but no current contact attached. |
| Dena Nena Henash | CONTACT_RESEARCH_REQUIRED | Recent official award source, but no current contact attached. |
| Northkey Community Care | CONTACT_RESEARCH_REQUIRED | Recent official award source, but no current contact attached. |
| Texas Health Resources | CONTACT_RESEARCH_REQUIRED | Recent official award source, but no current contact attached. |
| Seattle Indian Health Board | CONTACT_RESEARCH_REQUIRED | Recent official award source, but no current contact attached. |

## Required high-intent review

| Opportunity | State | Reconciliation finding |
| --- | --- | --- |
| Junior Achievement of South Florida | SUPPRESSION_CHECK_REQUIRED | Retains its published finance route; do not spend Hunter credit again. |
| Rodale Institute | SUPPRESSION_CHECK_REQUIRED | Retains its published finance route; do not spend Hunter credit again. |
| Sustainable Food Center | ENRICHMENT_READY | Current grants persona is known but no direct business email is established. |
| Project Oceanology | SUPPRESSION_CHECK_REQUIRED | Direct public route preserved; the award-signal mirror is deduplicated. |
| Perkins School for the Blind | ENRICHMENT_READY | Finance persona is known but only an organization inbox is attached. |
| Live-only newer Aug. 16 awards | BLOCKED FROM VM ENUMERATION | Firestore `gtm/daily-awards` returned 403 to the VM identity; runtime reconciliation will include them when deployed. |

## Automatic forward path

The new deterministic `reconcileControlPlaneQueue` state machine uses one of the requested states for every card, deduplicates organization variants, retains public direct routes, and fails closed on suppression. The existing daily award scan now calls it with both seeded and fresh award candidates, writes the result to the private `gtm/control-plane-reconciliation` document, and exposes it only through the existing GTM-admin authorization gate. It cannot send, schedule, or contact anyone.

The private Cloud Run Job grantdeskhq-control-plane-reconciliation is now provisioned with the existing runtime service account and no public endpoint. Its first execution, grantdeskhq-control-plane-reconciliation-l46bk, was created but was still awaiting Cloud Run task scheduling at the time of this report; it had not produced a reconciliation result yet. No production traffic, Stripe data, or outbound action changed. The source implementation is tested locally; the existing daily award scan calls the same deterministic reconciliation only after a successful scan, so it cannot erase the prior queue when award discovery fails. Activating that new service code for the production scheduler remains a separate zero-traffic/candidate deployment decision.

## Exact access gap

The current VM principal cannot call Firestore `documents.get` on `projects/grantdeskhq-proto-ek-2026/databases/(default)/documents/gtm/daily-awards`; the API returned `403 PERMISSION_DENIED`. If direct VM inspection is necessary, the least broad predefined role is `roles/datastore.viewer` for `grantdeskhq-dev-vm@grantdeskhq-proto-ek-2026.iam.gserviceaccount.com` on project `grantdeskhq-proto-ek-2026`. The preferred operational path is the tested runtime-owned reconciliation, because it keeps Firestore access in the existing runtime service account.

Do not run any credit-consuming search, export, enrichment, or personal-contact access without the user's prior explicit approval.
