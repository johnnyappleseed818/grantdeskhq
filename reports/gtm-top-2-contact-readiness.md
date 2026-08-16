# GrantDeskHQ — top two contact-enrichment readiness

**Status:** SHADOW / HUMAN REVIEW ONLY  
**Generated:** 2026-08-16  
**Real prospect emails sent:** 0  
**Emails scheduled:** 0  
**Follow-ups sent:** 0  
**Contact forms submitted:** 0  
**LinkedIn actions:** 0  
**Reddit actions:** 0

## Execution status

The reusable server-side enrichment pipeline is implemented and covered by focused tests. It keeps outbound locked, uses Hunter first, calls Apollo only if Hunter is not verified, stores provider provenance, caches results, and fails closed when suppression history is not clear.

The two real SHADOW fixtures were exercised locally with the provider interfaces disabled. No Hunter or Apollo lookup was made: the VM cannot inspect either named Secret Manager secret (`secretmanager.secrets.get` is denied for `grantdeskhq-dev-vm@grantdeskhq-proto-ek-2026.iam.gserviceaccount.com`), and no runtime secret-backed provider configuration was supplied. This report does **not** infer whether either secret exists.

The public award URLs below returned HTTP 200 on 2026-08-16. The current CFO titles were reconfirmed from the organizations’ official pages on the same date. No direct email has been found, guessed, or represented as verified.

## Prospect 1 — Lorain County Community Action Agency

**ORGANIZATION:** Lorain County Community Action Agency  
**CONTACT:** Justin Paige  
**CURRENT TITLE:** Chief Financial Officer  
**TITLE SOURCE:** https://www.lccaa.net/board-and-staff/  
**DOMAIN:** lccaa.net  
**DOMAIN SOURCE:** https://www.lccaa.net/board-and-staff/  
**RECENT AWARD:** Administration for Children and Families Head Start award  
**AWARD AMOUNT:** $9,177,614  
**AWARD DATE:** August 1, 2026  
**AWARD SOURCE:** https://www.usaspending.gov/award/ASST_NON_05CH013668_075/

**WHY NOW:** A recent public federal award makes a reviewable post-award reporting workflow timely; it does not establish that LCCAA has a reporting problem.

**EMAIL:** NOT ESTABLISHED  
**EMAIL PROVIDER:** Hunter primary — not configured for this run; Apollo fallback — not used  
**VERIFICATION STATUS:** CONTACT_NOT_ESTABLISHED  
**CONFIDENCE:** Not applicable until a provider returns and verifies a business email  
**EMAIL PROVENANCE:** None. No address was generated from a pattern or inferred from the lccaa.net domain.  
**SUPPRESSION STATUS:** UNKNOWN — the gate was not skipped. A verified email is required before the runtime can check hashed suppression history and existing-signup/customer records.  
**READY FOR HUMAN APPROVAL:** NO

**BLOCKERS:**

1. A Hunter API key has not been supplied to the private runtime through Secret Manager with an approved usage limit.
2. No provider-verified business email is available for Justin Paige.
3. Suppression/history cannot be checked until a verified direct email exists; any `UNKNOWN` result blocks readiness.

**SUBJECT:** Administration for Children and Families award reporting workflow for Lorain County Community Action Agency

**FULL FINAL EMAIL:**

Hi Justin,

We built GrantDeskHQ to take repetitive post-award reporting work off nonprofit finance teams. Our AI-powered workflow turns the grant agreement, accounting data, program updates, and supporting evidence into a reviewable funder-report draft, while your team keeps control of review and submission.

I saw Lorain County Community Action Agency's $9.18M Administration for Children and Families award beginning August 1, 2026, so the timing seemed relevant.

We're offering introductory Growth pricing to 25 nonprofit customers at $99/month, normally $199/month. Would you be open to trying it with one award for free?

Best,
Eli

## Prospect 2 — Great Lakes Community Action Partnership

**ORGANIZATION:** Great Lakes Community Action Partnership  
**CONTACT:** David Chimahusky  
**CURRENT TITLE:** Chief Financial Officer  
**TITLE SOURCE:** https://www.glcap.org/about/  
**DOMAIN:** glcap.org  
**DOMAIN SOURCE:** https://www.glcap.org/about/  
**RECENT AWARD:** Administration for Children and Families Head Start award  
**AWARD AMOUNT:** $6,885,299  
**AWARD DATE:** August 1, 2026  
**AWARD SOURCE:** https://www.usaspending.gov/award/ASST_NON_05HP000694_075/

**WHY NOW:** A recent public federal award makes a reviewable post-award reporting workflow timely; it does not establish that GLCAP has a reporting problem.

**EMAIL:** NOT ESTABLISHED  
**EMAIL PROVIDER:** Hunter primary — not configured for this run; Apollo fallback — not used  
**VERIFICATION STATUS:** CONTACT_NOT_ESTABLISHED  
**CONFIDENCE:** Not applicable until a provider returns and verifies a business email  
**EMAIL PROVENANCE:** None. No address was generated from a pattern or inferred from the glcap.org domain.  
**SUPPRESSION STATUS:** UNKNOWN — the gate was not skipped. A verified email is required before the runtime can check hashed suppression history and existing-signup/customer records.  
**READY FOR HUMAN APPROVAL:** NO

**BLOCKERS:**

1. A Hunter API key has not been supplied to the private runtime through Secret Manager with an approved usage limit.
2. No provider-verified business email is available for David Chimahusky.
3. Suppression/history cannot be checked until a verified direct email exists; any `UNKNOWN` result blocks readiness.

**SUBJECT:** Administration for Children and Families award reporting workflow for Great Lakes Community Action Partnership

**FULL FINAL EMAIL:**

Hi David,

We built GrantDeskHQ to take repetitive post-award reporting work off nonprofit finance teams. Our AI-powered workflow turns the grant agreement, accounting data, program updates, and supporting evidence into a reviewable funder-report draft, while your team keeps control of review and submission.

I saw Great Lakes Community Action Partnership's $6.89M Administration for Children and Families award beginning August 1, 2026, so the timing seemed relevant.

We're offering introductory Growth pricing to 25 nonprofit customers at $99/month, normally $199/month. Would you be open to trying it with one award for free?

Best,
Eli

## Pipeline and safety checks

| Check | Result |
| --- | --- |
| Hunter provider waterfall | Implemented; disabled without secret-backed runtime configuration |
| Hunter lookup / verification calls | 0 / 0 |
| Apollo fallback calls | 0 |
| Verified emails | 0 |
| Contact records promoted to human approval | 0 |
| Cached result refresh | Tested: unresolved records retry; verified records refresh after 30 days |
| Suppression bypass | Blocked by deterministic gate tests |
| Free-first-award deliverability | Supported by the existing Free First Report flow; no ongoing subscription is represented as free |
| Real prospect emails sent | 0 |

## Required human configuration before a live SHADOW lookup

Create a Hunter API key with a deliberately bounded budget sufficient for two Email Finder calls and any required Email Verifier calls; store only that value in Secret Manager as `grantdeskhq-hunter-api-key`; attach it to the GrantDeskHQ private runtime as `HUNTER_API_KEY`; and set `GTM_CONTACT_ENRICHMENT_ENABLED=true` plus `HUNTER_MAX_LOOKUPS_PER_RUN=2` on a zero-traffic candidate revision. Do not share the key in chat, source control, or a report. Apollo is optional and should be configured only if Hunter does not yield verified results.

The server-side runtime—not the VM CLI—will query the existing hashed `gtm/contact-suppressions` record and the `organizations.ownerEmail` account record. This removes the prior VM direct-Firestore-read limitation from the readiness decision. If the runtime cannot read either source, it returns `UNKNOWN`, which prevents `READY_FOR_HUMAN_APPROVAL`.

## Sources & coverage

- **Used:** LCCAA Board and Staff — current Justin Paige CFO title and official organization domain.
- **Used:** GLCAP About — current David Chimahusky CFO title and official organization domain.
- **Used:** USAspending public award records — the two award identifiers, amounts, and August 1, 2026 start dates.
- **Unavailable or limited:** Hunter and Apollo live provider credentials — no live email enrichment or verification was possible.
- **Coverage:** Exactly the two user-specified organizations; no broader lead discovery was performed.

Do not run any credit-consuming search, export, enrichment, or personal-contact access without the user's prior explicit approval.
