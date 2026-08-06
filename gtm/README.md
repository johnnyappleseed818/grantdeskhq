# GrantDeskHQ GTM engine

This directory turns the validated post-award reporting problem into a repeatable research, messaging, qualification, content, and permission-based email workflow.

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

## What is intentionally not automated

- LinkedIn scraping, comments, likes, connection requests, or messages
- Reddit posts, comments, or direct messages
- Email to scraped, purchased, or merely public addresses
- Inventing email addresses, job titles, grant volume, accounting software, or buying intent
- Sending any campaign without an exact recipient count and explicit confirmation

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

## Commands

Generate the working artifacts:

```bash
npm run gtm:build
```

Run the standalone GTM tests:

```bash
npm run gtm:test
```

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

## Sources and coverage

- **Used:** public Reddit threads, public LinkedIn posts/company pages, official organization staff pages, G2 review pages, official Resend policy/docs, official LinkedIn policy, official Reddit developer terms, and FTC CAN-SPAM guidance.
- **Unavailable or limited:** no configured Sales Intelligence provider, CRM, LinkedIn API, or approved Reddit commercial API credentials. Organization-level grant volume, current process, budget, accounting software, and purchase intent remain unknown.
- **Coverage:** ten qualitative Reddit signals, eight LinkedIn research/engagement items, and 27 previously verified nonprofit leaders. This is a bounded research set, not exhaustive market coverage and not a qualified pipeline.
