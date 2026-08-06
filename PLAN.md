# GrantDeskHQ private-beta implementation plan

## Completed product foundation

1. [x] Add a four-step onboarding wizard for report details, source files, preflight validation, and compilation.
2. [x] Implement a server-side AI Report Compiler using strict structured output and small-file validation.
3. [x] Add an independent evidence-verification pass, evidence coverage, visible citations, contradiction and unsupported states, and a mandatory review gate.
4. [x] Keep the synthetic product demo and exact financial calculations as a safe evaluation path.
5. [x] Replace the $500 assessment and high subscription tiers with a free first report plus $49 nonprofit and $149 agency founding plans.
6. [x] Support Vercel, Netlify, and isolated Google Cloud Run deployment without exposing the API key to the browser.
7. [x] Run deterministic tests, public synthetic API smoke testing, lint, TypeScript, production build, route checks, and deletion audits; document results and honest limitations.

## Private beta

1. [x] Add managed email/password accounts and persistent browser sessions.
2. [x] Add account-isolated organizations, saved report summaries, source inventories, results and reviewer audit events.
3. [x] Store uploaded source files in a private Cloud Storage bucket with public access prevention.
4. [x] Add deterministic ledger checks that override model arithmetic and block fabricated, duplicate, missing or mismatched transactions.
5. [x] Add saved-workspace and account onboarding screens optimized for desktop and mobile.
6. [x] Deploy and verify the authenticated beta end to end in the isolated GrantDeskHQ project.

## GTM research and demand engine

1. [x] Replace account-page feature copy with a value-led promise grounded in the validated post-award reporting workflow.
2. [x] Define the nonprofit finance ICP, discovery questions, disqualifiers, pain themes, positioning, and entry offer.
3. [x] Review and code a bounded set of relevant Reddit threads with direct links, evidence summaries, and product implications.
4. [x] Create a human-reviewed LinkedIn community and comment queue without prohibited scraping or automated engagement.
5. [x] Structure the 27 verified nonprofit finance and grants leaders as a research list with visible qualification gaps and no invented contact data.
6. [x] Build a deterministic GTM artifact generator and tests for scoring, consent gates, messaging, and unsupported-claim prevention.
7. [x] Build a Resend Broadcast workflow that accepts documented opt-ins only, verifies the exact segment, creates drafts by default, and uses Resend-managed unsubscribe links.
8. [x] Add an optional approved Reddit Data API monitor with an explicit commercial-access guard; do not scrape or automate posts/comments.

## GTM command center and signal engines

1. [x] Add a private, mobile-responsive GTM command center with a daily hot list, alert filters, evidence review, human-approved actions, and pipeline progress.
2. [x] Add transparent Pain × Timing × Fit × Value scoring with source-quality gates, corroboration rules, stale-data checks, conflict flags, and no invented contacts.
3. [x] Add a federal grant-winner scanner backed by the official USAspending API and a scheduled GitHub Actions refresh.
4. [x] Add job, Excel-pain, competitor-intent, Reddit, and LinkedIn lanes with honest connection states and manual-review boundaries where automation is restricted or not configured.
5. [x] Add accountant and grant-consultant referral work queues, draft-only partner messaging, and funnel progress tracking.
6. [x] Add a free Grant Reporting Readiness Audit entry point that extracts source-linked obligations, deadlines, financial requirements, program metrics, and missing evidence for review.
7. [x] Add deterministic tests for signal scoring, qualification gates, duplicate and contradiction detection, safe outreach states, route accessibility, and the readiness workflow.
8. [x] Run all GTM and application tests, lint, production build, route checks, deletion audit, and deployment verification.
