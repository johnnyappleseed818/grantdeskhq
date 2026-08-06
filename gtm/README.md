# GrantDeskHQ GTM engine

This directory turns the validated post-award reporting problem into a repeatable research, messaging, qualification, content, alerting, and permission-based email workflow. The signed-in UI lives at `/gtm`.

## Core promise

> Turn your grant budget, accounting export, program updates, and funder form into a review-ready report draft—without replacing your accounting system.

The entry point is not broad grant management. It is the repetitive work between accurate accounting records and the funder's required report: budget-line mapping, budget-versus-actual schedules, missing-input collection, variance explanations, funder-template assembly, evidence links, and professional review.

## What is automated

- Deterministic pain-theme coding and signal summaries
- Transparent research-fit scoring for verified nonprofit roles
- A prioritized research CSV with visible evidence gaps
- LinkedIn response drafts for human review
- Value-led opt-in email previews
- Exact consent checks before a contact can enter the Resend workflow
- A dedicated Resend segment, exact recipient-count verification, and Broadcast creation
- Resend-managed unsubscribe links
- Optional metadata-only Reddit monitoring through approved Data API access
- Daily federal nonprofit-award discovery through the official USAspending API
- A source-backed daily hot list with transparent Pain × Timing × Fit × Value scoring
- Browser-saved review, ready, contacted, replied, converted, and dismissed states
- Draft-only outreach and partner-channel actions
- A free, AI-assisted Grant Reporting Readiness Audit at `/readiness`

## What is intentionally not automated

- LinkedIn scraping, comments, likes, connection requests, or messages
- Reddit posts, comments, or direct messages
- Email to scraped, purchased, or merely public addresses
- Inventing email addresses, job titles, grant volume, accounting software, or buying intent
- Sending any campaign without an exact recipient count and explicit confirmation
- Treating a public award, job, comment, or review as proof of pain
- Giving anonymous or unresolved public discussions a contactable lead status

## Files

- `config.json` — ICP, pain taxonomy, value pillars, qualification, and offer
- `data/reddit-signals.json` — ten reviewed public Reddit threads
- `data/linkedin-engagement.json` — five public discussions and three professional communities
- `data/nonprofit-prospects.csv` — 27 verified nonprofit finance/grants leaders, with no invented contact data
- `GTM_STRATEGY.md` — positioning, funnel, operating cadence, and success metrics
- `MESSAGING.md` — approved message hierarchy and persona angles
- `LINKEDIN_PLAYBOOK.md` — manual community discovery and contribution workflow
- `COMPLIANCE.md` — channel rules and implementation boundaries
- `generated/` — refreshed summaries, queues, scoring, and email preview
- `../public/gtm/award-signals.json` — generated official-source alert feed consumed by the dashboard
- `../src/data/gtmData.ts` — reviewed starter opportunities and signal-source registry
- `../src/lib/gtm.ts` — deterministic scoring, corroboration, freshness, duplicate, conflict, and action gates

## Commands

Generate the working artifacts:

```bash
npm run gtm:build
```

Run the standalone GTM tests:

```bash
npm run gtm:test
```

Refresh the federal award-alert feed from USAspending:

```bash
npm run gtm:awards
```

The deployment workflow also runs this scanner once per day. It searches a
bounded recent window for federal assistance records classified by USAspending
as nonprofit recipients, then writes only records with usable recipient,
amount, and award identifiers. The record is a timely research trigger—not
evidence that the recipient is dissatisfied or currently struggling.

Preview the permission-based email without contacting Resend:

```bash
npm run outreach:preview
```

Create a Resend Broadcast draft after opted-in rows have been added to the CSV:

```bash
RESEND_API_KEY=... \
QUESTIONNAIRE_URL=https://... \
CONFIRM_ELIGIBLE_COUNT=3 \
node scripts/gtm/resend-opt-in-broadcast.mjs --create-draft
```

Sending requires two additional exact confirmations:

```bash
CONFIRM_RESEND_SEND=YES \
CONFIRM_CAMPAIGN_ID=grantdeskhq-post-award-workflow-v2 \
node scripts/gtm/resend-opt-in-broadcast.mjs --send
```

Do not run the send command until the exact message, eligible recipients, sending domain, reply-to workflow, and Resend account are reviewed. The current research list has no recorded opt-ins and is therefore ineligible.

## Signal refresh

The optional monitor uses Reddit OAuth rather than scraping. Reddit's current terms say commercial Data API access may require a separate agreement, so the script refuses to run unless that approval is explicitly acknowledged:

```bash
REDDIT_COMMERCIAL_API_APPROVAL=YES \
REDDIT_CLIENT_ID=... \
REDDIT_CLIENT_SECRET=... \
REDDIT_USER_AGENT='GrantDeskHQSignalResearch/1.0 contact@example.com' \
npm run gtm:reddit
```

The monitor writes metadata to `/tmp` by default. A person must open and review every promising thread before adding an evidence summary or participating.

## Dashboard action model

1. A scanner or reviewed research file creates an observed signal.
2. Entity resolution keeps the organization separate from anonymous discussion.
3. The deterministic score displays Pain (30), Timing (25), Fit (25), and Value (20).
4. Source authority, conflicts, unknowns, recency, and corroboration determine whether action is allowed.
5. A human reviews evidence and explicitly marks the opportunity ready.
6. The dashboard can copy a draft and record progress, but it cannot send it.

“Very high intent” requires a score of at least 90 and at least two usable
sources. Missing nonprofit identity, unresolved organization identity, missing
evidence, or conflicting facts block action. Signals older than 45 days are
warned and should be rechecked.

## Sources and coverage

- **Used:** public Reddit threads, public LinkedIn posts/company pages, official organization staff pages, G2 review pages, official Resend policy/docs, official LinkedIn policy, official Reddit developer terms, and FTC CAN-SPAM guidance.
- **Used:** official USAspending API, public Reddit threads, public LinkedIn posts/company pages, employer-controlled or public job pages, official organization pages, G2 review pages, official Resend policy/docs, official LinkedIn policy, official Reddit developer terms, IRS nonprofit data documentation, and FTC CAN-SPAM guidance.
- **Unavailable or limited:** no configured Sales Intelligence provider, CRM, job-feed API, permissioned web-search API, LinkedIn API, or approved Reddit commercial API credentials. Organization-level grant volume, current process, budget, accounting software, named buyer, and purchase intent remain unknown until verified.
- **Coverage:** a bounded recent federal-award feed, five reviewed starter opportunities, ten qualitative Reddit signals, eight LinkedIn research/engagement items, and 27 previously verified nonprofit leaders. This is not exhaustive market coverage or a qualified sales pipeline.
