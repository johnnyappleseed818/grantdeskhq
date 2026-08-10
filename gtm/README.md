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
- Daily federal nonprofit-award discovery through the official USAspending API, with core, emerging, and adjacent research tiers
- One bounded daily OpenAI web-search check for recent indexed Reddit and LinkedIn post URLs
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
- `../public/gtm/award-signals.json` — generated official-source feed for static deployments and local review
- `../src/data/gtmData.ts` — reviewed starter opportunities and signal-source registry
- `../src/lib/gtm.ts` — deterministic scoring, corroboration, freshness, duplicate, conflict, and action gates
- `../server/gtmAwardScanner.ts` — paginated official-source federal award discovery used by the private production dashboard
- `../server/gtmDailyScanner.ts` — source-validated daily social discovery with no platform interaction

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

The default search covers the previous 90 days, federal grant award types
02–05, nonprofit recipients, awards of at least $25,000, up to four 100-record
pages, and up to 100 candidates. Environment variables can narrow or broaden
those bounds without changing code: `GTM_AWARD_WINDOW_DAYS`,
`GTM_SCAN_START_DATE`, `GTM_MINIMUM_AWARD`, `GTM_AWARD_PAGE_SIZE`,
`GTM_AWARD_MAX_PAGES`, and `GTM_AWARD_MAX_CANDIDATES`. The scanner classifies
$25,000–$99,999 awards as emerging, $100,000–$9,999,999 awards as core, and
higher-education, healthcare, research, or very large recipients as adjacent.
Adjacent records stay visible for fit review instead of being silently
discarded.

The production scheduler saves the latest scan to the private Firestore GTM
record. Static deployments can refresh `public/gtm/award-signals.json` using
the command above. An award record is a timely research trigger—not evidence
that the recipient is dissatisfied, has a difficult reporting workflow, or
intends to buy.

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

The production daily social monitor is separate from that optional Data API
script. Google Cloud Scheduler calls the private server endpoint once per day.
The server uses OpenAI hosted web search with Reddit and LinkedIn domain filters,
validates every model-returned URL against the API's source list, rejects search
pages and unsupported hostnames, deduplicates results, and persists only
research-only items. It does not scrape either platform or automate engagement.

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

## Approval-based outreach automation

The private dashboard now separates discovery, contact verification, message
approval, and delivery. Federal-award candidates appear immediately, but the
action gate remains closed until a named current recipient and authoritative
role and email sources are attached. Action-ready drafts can be marked ready
and exported as an approved CSV queue.

To enable server-side delivery safely, add a permissioned contact-data provider
or manually verified contacts, then connect Resend Broadcasts with:

1. a server-only API key and verified GrantDeskHQ sending domain;
2. a suppression list and managed unsubscribe link;
3. idempotency keys so a retry cannot duplicate a send;
4. delivery, bounce, complaint, and unsubscribe webhooks;
5. a daily cap and a single automated follow-up maximum; and
6. a final per-recipient human approval recorded in the audit log.

The repository does not enable unsolicited automatic sending. LinkedIn and
Reddit engagement remains manual. Creating an enrichment account, consuming
provider credits, accessing personal-contact data, or turning on a send job
requires separate explicit approval.

## Sources and coverage

- **Used:** official USAspending API, public Reddit threads, public LinkedIn posts/company pages, employer-controlled or public job pages, official organization pages, G2 review pages, official Resend policy/docs, official LinkedIn policy, official Reddit developer terms, IRS nonprofit data documentation, and FTC CAN-SPAM guidance.
- **Unavailable or limited:** no configured Sales Intelligence provider, CRM, job-feed API, LinkedIn API, or approved Reddit commercial API credentials. OpenAI web search supplies bounded indexed-result discovery, not complete platform coverage. Organization-level grant volume, current process, budget, accounting software, named buyer, and purchase intent remain unknown until verified.
- **Coverage:** a bounded daily Reddit/LinkedIn indexed-result check, up to 100 recent federal-award research candidates from a paginated official-source scan, five reviewed starter opportunities, ten qualitative Reddit signals, eight LinkedIn research/engagement items, and 27 previously verified nonprofit leaders. This is not exhaustive market coverage or a qualified sales pipeline.
