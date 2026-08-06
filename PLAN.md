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
6. [ ] Deploy and verify the authenticated beta end to end in the isolated GrantDeskHQ project.
