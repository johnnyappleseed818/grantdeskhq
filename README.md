# GrantDeskHQ AI Report Compiler

GrantDeskHQ is a private-beta AI-powered post-award grant-reporting workflow
used by nonprofit finance teams, fractional nonprofit
CFO firms, accounting practices, and controllers. It combines a guided React
interface with a server-side OpenAI Responses API compiler, an independent
obligation-completeness audit, and a separate evidence-verification pass.

> Sample workspaces use synthetic data. During private beta, the compiler accepts
> only synthetic or appropriately redacted files. All outputs are drafts,
> suggested mappings, and source-matched statements that require professional
> review. No report is submitted automatically.

Production domain: [grantdeskhq.com](https://grantdeskhq.com)

Cloud Run application: [grantdeskhq-prototype-me423s5k5a-uc.a.run.app](https://grantdeskhq-prototype-me423s5k5a-uc.a.run.app)

## Repository isolation

- Local Git root: `/home/eli_katz/grantdesk`
- Dedicated remote: `https://github.com/johnnyappleseed818/grantdeskhq.git`
- Dedicated GitHub Pages deployment workflow: `.github/workflows/deploy-pages.yml`
- Custom domain binding: `public/CNAME` and root `CNAME`
- No ZenLLM or RoyalStyle source, remote, cloud project, or deployment is used

## Product routes

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing page and AI Report Compiler positioning |
| `/demo` | Stateful synthetic GrantDeskHQ agency workspace |
| `/compile` | Guided working AI Report Compiler and evidence-validation workflow |
| `/login` | Managed account creation, sign-in, and password reset |
| `/workspace` | Account-isolated saved report workspace |
| `/readiness` | Free source-linked Grant Reporting Readiness Audit |
| `/gtm` | Administrator-only GTM command center, alert queue, source registry, and progress monitor |
| `/sample-report` | Print-ready funder-report review package |
| `/privacy` | Private-beta and test-file data-handling boundaries |
| `/pricing` | Founding Nonprofit and Founding Agency pricing |
| `/assessment` | Free-first-report founding access and contact enquiry |
| `/pilot` | Compatibility redirect to `/assessment` |
| `*` | Accessible not-found page |

The synthetic demo includes Agency Overview, Source Package, Requirements, Financial
Mapping, Missing Inputs, Narrative Draft, Quality Review, and Export Package
screens. The `/compile` route adds real file intake, structured AI output,
an independent verification pass, evidence coverage, and an export gate.
The `/readiness` route provides the lighter lead-magnet workflow: one award
agreement is required, while separate reporting instructions and the approved
budget are optional. The `/gtm` route keeps signal evidence, inference, suggested
actions, named contacts, email-source verification, human-reviewed drafts, and
browser-saved progress visibly separate. New award records remain research
candidates until a recipient and authoritative contact source are attached.

The landing page includes a touch-swipeable, keyboard-focusable carousel of
clearly labelled illustrative finance-team use cases. These are not customer
testimonials or endorsements and can be replaced with verified pilot quotes
when those are available.

## Technical stack

- React 18 and TypeScript
- Vite 7
- Tailwind CSS 3 through PostCSS; no browser CDN
- React Router
- Lucide React icons
- Vitest, Testing Library, and jsdom
- Vercel and Netlify serverless function adapters
- OpenAI Responses API with strict JSON Schema output and `store: false`
- Google Identity Platform and the Firebase web SDK for managed accounts
- Firestore for account-isolated report records and reviewer audit events
- Private Google Cloud Storage for persisted source files
- `pdf-lib` for synthetic PDF generation
- `write-excel-file` for XLSX generation and `read-excel-file` for asset verification
- ESLint 9 flat configuration
- Official USAspending API scanner for bounded federal nonprofit-award alerts
- Scheduled GitHub Actions refresh for the static GTM award feed
- Daily Google Cloud Scheduler trigger for bounded OpenAI web-search discovery across indexed Reddit and LinkedIn results
- System font stack and no external images or fonts
- Consent-aware Google Analytics and Microsoft Clarity on public marketing pages, with private application content masked or excluded

The private beta stores report records and audit events in Firestore and source
objects in a private, public-access-blocked Cloud Storage bucket. OpenAI and
browser-auth configuration remain in Secret Manager and are never committed to
the repository. The Firebase browser key is domain- and API-restricted; it is
configuration rather than an administrative credential.

## Accuracy and anti-hallucination controls

The beta does not treat a model response as a verified report. Its export gate
combines:

- strict JSON Schema output;
- an early grant-identity and reporting-period check that requires correction
  when verified setup facts conflict;
- an independent obligation-completeness audit that looks for source-cited
  reporting duties omitted by the first extraction;
- an independent evidence-verification model;
- exact source-name, locator, and excerpt completeness checks;
- deterministic CSV ledger parsing and transaction-ID matching;
- deterministic replacement of model dates, descriptions, and amounts with
  uploaded-ledger values;
- duplicate, fabricated, omitted, and amount-mismatch blocking;
- separate report-readiness, source-verification, missing-input, and
  unresolved-action indicators;
- explicit Verified, Needs review, Action required, and Not evaluated states;
- no successful status for a check that could not run because its source data
  was not supplied; and
- a saved audit event whenever a signed-in reviewer confirms an item.

The system must abstain or block when evidence is insufficient. AI verification
reduces risk but does not prove factual correctness; professional review remains
mandatory.

The GTM command center applies the same principle to sales signals. It requires
source URLs and excerpts, caps the visible Pain × Timing × Fit × Value score,
requires corroboration for a “very high intent” label, warns on stale evidence,
blocks unresolved or conflicting entities, and never invents a contact. Public
discussion signals remain market evidence until an organization is independently
resolved. No social action or email is sent from the dashboard.
The route is absent from customer navigation, and the browser must pass a
server-side administrator-email allowlist before any dashboard or daily-signal
API data is returned. Scheduler requests use a dedicated GrantDeskHQ service
account and independently verified Google OIDC token.

## Exact synthetic source model

The canonical data lives in `src/data/grantData.json`. Typed content,
requirements, program facts, and approved-content examples live in
`src/data/grantData.ts`.

The automated tests verify:

- Approved annual budget: **$150,000**
- Ledger: **20 transactions totaling $75,400**
- Initially mapped actuals: **$74,150**
- Initially unmapped: **UNM-001 for $1,250**
- Remaining mapped budget: **$75,850**
- Personnel: **8 transactions totaling $44,500**
- Program Supplies: **6 transactions totaling $14,850**
- Local Travel: **3 transactions totaling $9,800**
- Indirect Overhead: **2 transactions totaling $5,000**
- Local Travel above the 50% elapsed plan: **$2,300 / 30.67%**
- Youth served: **118 / 120, or 98.3%**
- Export disabled until all three required review items are resolved

## Generated sample assets

Run `npm run generate:assets` to deterministically create:

- `public/samples/Synthetic_Grant_Agreement.pdf`
- `public/samples/Approved_Grant_Budget.xlsx`
- `public/samples/General_Ledger_Export.csv`
- `public/samples/Synthetic_Funder_Report_Draft.pdf`
- `public/samples/Transaction_Evidence_Schedule.xlsx`

The agreement contains 14 pages and the report draft contains 7 pages. The
budget workbook contains Approved Budget, Six-Month BVA, and Reporting Rules
worksheets. The evidence workbook contains all 20 transactions, the travel
receipt checklist, and the source citation log. Every generated file includes
a synthetic-data disclosure.

## File structure

```text
grantdesk/
├── .github/workflows/deploy-pages.yml
├── api/compile-report.ts
├── server/
│   ├── compilerSchema.ts
│   ├── cloudRun.ts
│   ├── readinessCompiler.ts
│   ├── readinessSchema.ts
│   ├── gtmDailyScanner.ts
│   ├── gtmDailySchema.ts
│   ├── schedulerAuth.ts
│   └── reportCompiler.ts
├── netlify/functions/compile-report.ts
├── public/
│   ├── 404.html
│   ├── CNAME
│   ├── _redirects
│   ├── gtm/award-signals.json
│   └── samples/
├── src/
│   ├── components/
│   │   ├── demo/
│   │   ├── EvidenceDrawer.tsx
│   │   ├── Logo.tsx
│   │   ├── SiteLayout.tsx
│   │   └── StatusBadge.tsx
│   ├── data/
│   │   ├── grantData.json
│   │   ├── grantData.ts
│   │   └── gtmData.ts
│   ├── lib/
│   │   ├── calculations.ts
│   │   ├── gtm.ts
│   │   └── prototype.ts
│   ├── pages/
│   ├── test/
│   ├── types/prototype.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── index.html
├── Dockerfile
├── styles.css
├── script.js
├── scripts/create-spa-routes.js
├── scripts/gtm/scan-usaspending-awards.mjs
├── gtm/
├── PLAN.md
├── package.json
├── tailwind.config.js
├── vite.config.ts
├── vitest.config.ts
├── vercel.json
└── netlify.toml
```

## Local setup and commands

Node 22.12 or newer is required.

```bash
npm ci
npm run generate:assets
npm run dev
```

Create `.env.local` for server-side compiler execution:

```text
OPENAI_API_KEY=your_server_side_key
OPENAI_MODEL=gpt-5.6-terra
OPENAI_VERIFIER_MODEL=gpt-5.6-luna
OPENAI_GTM_MODEL=gpt-5.5
GTM_ADMIN_EMAILS=owner@example.com
GOOGLE_ANALYTICS_MEASUREMENT_ID=G-XXXXXXXXXX
CLARITY_PROJECT_ID=your_clarity_project_id
GTM_SCHEDULER_SERVICE_ACCOUNT=grantdeskhq-gtm-scheduler@grantdeskhq-proto-ek-2026.iam.gserviceaccount.com
GTM_SCHEDULER_AUDIENCE=https://grantdeskhq-prototype-me423s5k5a-uc.a.run.app
```

`GOOGLE_ANALYTICS_MEASUREMENT_ID` and `CLARITY_PROJECT_ID` are public
configuration values, not secrets. When either value is absent, that analytics
tool remains disabled. When configured, the browser still does not load either
vendor until the visitor selects **Allow analytics**. Google Analytics receives
manual page views for public marketing routes only; account, compiler,
readiness, workspace, and private GTM routes are excluded. The application root
is explicitly masked for Microsoft Clarity, and no account identifiers are sent
to either tool.

Before activating GA4, open the web data stream's **Enhanced measurement**
settings and disable **Page changes based on browser history events**. GA4 can
otherwise emit its own SPA history-change page views in addition to the
application's filtered manual events.

Vite by itself serves the frontend and synthetic demo. Use `vercel dev` or
`netlify dev` when testing the `/api/compile-report` serverless endpoint
locally. Never prefix the secret with `VITE_`; Vite-prefixed variables are
exposed to the browser.

Quality and production commands:

```bash
npm run lint
npm test
npm run build
npm run gtm:build
npm run gtm:test
# Refreshes public/gtm/award-signals.json from the official API:
npm run gtm:awards
npm run preview
npx vitest run
# Billable live accuracy and obligation-coverage release gates (>95% required):
npm run eval:ai
# Optional, billable live smoke test:
RUN_AI_SMOKE=1 npx vitest run src/test/compiler.integration.test.ts
npm audit --omit=dev
npm audit
```

- `npm run lint` checks the TypeScript, React, test, configuration, and
  generator sources with zero allowed warnings.
- `npm test` regenerates assets, then runs all deterministic calculation,
  route, interaction, accessibility-label, mobile-navigation, review-gate,
  asset-link, PDF, XLSX, CSV, wizard, request-validation, evidence-coverage,
  and export-gate tests. The live AI test is skipped unless explicitly enabled.
- `npm run build` regenerates assets, runs strict TypeScript validation, and
  creates the production output in `dist/`, including direct-load entry files
  for every public application route.
- `npm run gtm:awards` replaces only the generated
  `public/gtm/award-signals.json` feed after a successful, non-empty official
  USAspending response. It does not discover contacts or send messages.
- `npm run preview -- --host 127.0.0.1 --port 4173` serves the production
  build for runtime route and download verification.
- The current npm advisory database flags React Router's server/RSC action
  mode. GrantDeskHQ uses React Router only in the compiled browser application;
  it has no React Server Components, React Router server rendering, or React
  Router route actions. The custom Node compiler endpoint does not execute
  React Router code. The reported path is therefore not reachable in this
  deployment, but the dependency should be upgraded when the router project
  publishes a fixed current release.

## Verified implementation commands

The final QA cycle uses:

```bash
npm run generate:assets
npm run lint
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
npm audit --omit=dev
npm audit
```

Verified local result on August 8, 2026: lint passed with zero warnings; 85
tests passed with three opt-in live checks skipped; TypeScript and the Vite
production build passed. The billable live accuracy and coverage gate must be
rerun for every AI workflow release before production promotion. A
separate billable smoke test passed through the deployed Cloud Run endpoint in
48.89 seconds, exercising source upload, the compiler model, the independent
verifier model, and strict structured output. The audit commands report the
upstream React Router RSC-mode advisory described above; no affected RSC or
server-action mode exists in this project.

The authenticated private-beta smoke test also passed: a disposable Identity
Platform account compiled six synthetic sources, received 91% evidence
coverage with review items held open, retrieved the saved report through the
workspace API, and persisted all six sources to its account-isolated private
bucket path. The disposable QA account was disabled afterward.

Runtime checks should confirm HTTP 200 for:

```text
/
/demo
/compile
/readiness
/gtm
/sample-report
/privacy
/pricing
/assessment
/pilot
/samples/Synthetic_Grant_Agreement.pdf
/samples/Approved_Grant_Budget.xlsx
/samples/General_Ledger_Export.csv
/samples/Synthetic_Funder_Report_Draft.pdf
/samples/Transaction_Evidence_Schedule.xlsx
```

## GitHub Pages deployment

GitHub Pages hosts the marketing pages and browser application; the AI endpoint
runs separately in the isolated GrantDeskHQ Cloud Run project. The Pages build
injects `VITE_COMPILER_ENDPOINT` so `/compile` sends its request to that public
endpoint. Cloud Run allows browser requests only from `grantdeskhq.com` and
`www.grantdeskhq.com`; the API key remains server-side in Secret Manager.

The production repository includes a Pages workflow. A push to `main` runs
installation, linting, tests, the production build, artifact upload, and Pages
deployment.

1. In GitHub, open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Confirm the custom domain is `grantdeskhq.com`.
4. Confirm DNS contains the four GitHub Pages apex A records and the `www`
   CNAME pointing to `johnnyappleseed818.github.io`.
5. Push a reviewed commit to `main`.
6. Wait for **Deploy GrantDeskHQ to GitHub Pages** to pass.
7. Verify the apex, `www` redirect, all routes, assets, and HTTPS.

Generated route entry files make direct requests to each public route return
HTTP 200 on GitHub Pages. `public/404.html` remains a fallback for unknown
client-side paths.
`public/CNAME` preserves the production custom-domain setting in each build.

## Vercel deployment

The persistent private beta is currently supported on Cloud Run only. The
Vercel adapter remains useful for the earlier stateless compiler prototype but
does not implement Identity Platform, Firestore, private source storage, or the
saved review log.

### Dashboard

1. Import the dedicated `johnnyappleseed818/grantdeskhq` repository.
2. Select **Vite** as the framework preset.
3. Set **Build Command** to `npm run build`.
4. Set **Output Directory** to `dist`.
5. Add `OPENAI_API_KEY` as a Production and Preview environment variable.
6. Optionally set `OPENAI_MODEL` to `gpt-5.6-terra` and
   `OPENAI_VERIFIER_MODEL` to `gpt-5.6-luna`.
7. Deploy and test `/api/compile-report` with synthetic files.
8. Add `grantdeskhq.com` only after choosing Vercel instead of the existing
   GitHub Pages production target and updating DNS deliberately.

The checked-in `vercel.json` provides the SPA rewrite. The
`api/compile-report.ts` file is deployed as a serverless function automatically.

### CLI

```bash
npm install --global vercel
vercel
vercel --prod
```

Review the project and domain selections before the production command.

## Google Cloud Run preview

The checked-in `Dockerfile` builds the Vite application and starts the minimal
Node server in `server/cloudRun.ts`. Deploy only to the isolated GrantDeskHQ
project and inject `OPENAI_API_KEY` from Secret Manager; never place it in a
Docker build argument or committed file.

```bash
gcloud run deploy grantdeskhq-prototype \
  --source=. \
  --project=grantdeskhq-proto-ek-2026 \
  --region=us-central1 \
  --allow-unauthenticated \
  --service-account=grantdeskhq-runtime@grantdeskhq-proto-ek-2026.iam.gserviceaccount.com \
  --set-secrets=OPENAI_API_KEY=grantdeskhq-openai-key:latest,FIREBASE_WEB_API_KEY=grantdeskhq-firebase-web-key:latest \
  --set-env-vars=OPENAI_MODEL=gpt-5.6-terra,OPENAI_VERIFIER_MODEL=gpt-5.6-luna,OPENAI_GTM_MODEL=gpt-5.5,REPORT_FILES_BUCKET=grantdeskhq-proto-ek-2026-report-files,GTM_ADMIN_EMAILS=owner@example.com,GTM_SCHEDULER_SERVICE_ACCOUNT=grantdeskhq-gtm-scheduler@grantdeskhq-proto-ek-2026.iam.gserviceaccount.com,GTM_SCHEDULER_AUDIENCE=https://grantdeskhq-prototype-me423s5k5a-uc.a.run.app \
  --memory=1Gi \
  --cpu=1 \
  --timeout=180 \
  --concurrency=4 \
  --min=0 \
  --max=2
```

The deployed service is `grantdeskhq-prototype` in
`grantdeskhq-proto-ek-2026`; the current verified revision is
`grantdeskhq-prototype-00012-987`. It scales to zero when idle and is capped at
two instances. Its `/api/health`, `/gtm`, and `/readiness` routes returned HTTP
200 in the final audit; an unauthenticated request to
`/api/readiness-assessment` correctly returned HTTP 401. Domain mapping and DNS
changes are deliberately separate release steps.

The `grantdeskhq-daily-social-scan` Cloud Scheduler job runs at 13:35 UTC.
It invokes `/api/gtm/daily-scan` with the dedicated
`grantdeskhq-gtm-scheduler` identity. The endpoint runs one bounded OpenAI
Responses API web-search workflow, accepts only Reddit or LinkedIn post URLs
present in the returned search-source list, deduplicates them, marks every item
research-only, and saves the latest scan in Firestore. The first live run
completed with HTTP 200 on August 6, 2026.

## Netlify deployment

The Netlify function is also the earlier stateless prototype adapter. Use the
isolated Cloud Run deployment for accounts and persisted client workspaces.

### Dashboard

1. Import the dedicated `johnnyappleseed818/grantdeskhq` repository.
2. Set **Build Command** to `npm run build`.
3. Set **Publish Directory** to `dist`.
4. Set the functions directory to `netlify/functions` (also configured in
   `netlify.toml`).
5. Add `OPENAI_API_KEY` and optionally `OPENAI_MODEL` and
   `OPENAI_VERIFIER_MODEL` in environment variables.
6. Deploy and test `/api/compile-report` with synthetic files.
7. Add the production domain only if Netlify is intentionally replacing
   GitHub Pages.

`netlify.toml` routes `/api/compile-report` to the serverless function before
applying the SPA fallback.

### CLI

```bash
npm install --global netlify-cli
netlify deploy --dir dist
netlify deploy --dir dist --prod
```

## Accessibility and responsive behavior

- Semantic headings, landmarks, tables, labels, status text, and disclosure text
- Skip link and visible keyboard focus
- Keyboard-operable navigation, evidence drawer, mapping controls, and review gate
- Escape closes the mobile menu and evidence drawer
- Horizontally scrollable financial tables with named focus regions
- Responsive demo navigation: select control on mobile and persistent sidebar
  on desktop
- Reduced-motion support
- Print stylesheet for the sample report
- No color-only critical status: every state includes readable text

Automated tests cover mobile-menu behavior and accessible control names. A
headless browser binary is not available in the current Cloud Shell, so final
cross-browser visual review should also be performed in current Safari, Chrome,
and Firefox before a paid assessment.

## Questionnaire and GTM engine

The questionnaire builder is stored at
`outreach/GrantDeskHQ_Google_Form_Builder.gs`. The published ten-question
workflow assessment is linked from `/assessment`; it creates a linked response
spreadsheet and includes an explicit email-consent question.

The complete research and demand workflow is documented in `gtm/README.md`.
It includes the nonprofit-finance ICP, ten reviewed Reddit pain signals, a
human-reviewed LinkedIn engagement queue, a structured 27-person nonprofit
research list, a four-week launch cycle, and a permission-based Resend
Broadcast workflow.

Build and test the GTM artifacts:

```bash
npm run gtm:build
npm run gtm:test
```

Preview the current opt-in email without contacting Resend:

```bash
npm run outreach:preview
```

The utility reads `outreach/GrantDeskHQ_Resend_OptIn_Only_Template.csv` by
default. It excludes unsubscribed rows and refuses any row without a valid
email, `consent_status=opted_in`, consent source, and ISO consent date. When
authorized, it creates a dedicated Resend Segment, verifies the exact contact
count, and creates a Broadcast using Resend's managed unsubscribe URL. It never
sends unless the exact eligible count, campaign ID, and send confirmation are
all supplied.
Do not use the 30 researched public contacts in the validation workbook for a
Resend campaign; they do not contain recorded opt-in consent.

`outreach/VERIFIED_PRIORITY_A_SHORTLIST.md` records 27 current finance, CFO,
grants, and compliance leaders verified against their organizations' official
staff pages. Three older workbook records are separated as unverified and
excluded. All profiles are research records rather than Resend subscribers.

LinkedIn and Reddit participation remains manual. A once-daily OpenAI
web-search pass can discover recent indexed post or thread URLs, but it does
not crawl profiles or platform pages and never posts, comments, messages,
discovers contacts, or emails anyone. The separate optional Reddit Data API
monitor remains disabled unless approved commercial API access is documented.
See `gtm/COMPLIANCE.md` for the current provider and legal boundaries.

## Honest limitations

- The synthetic `/demo` route remains deterministic local data. The `/compile`
  route is a private-beta AI workflow, not a production accounting system.
- Uploaded files are sent to the configured OpenAI API project for
  processing. Use only synthetic or appropriately redacted test files. Provider
  terms and retention settings apply.
- A second AI verification pass materially improves traceability, but cannot
  guarantee that every AI error is eliminated. Source evidence and professional
  review remain mandatory.
- No production security certification, accounting integration, accuracy
  measurement, or performance statistic is claimed.
- Managed accounts, persistent reports, private source objects and reviewer
  audit events are implemented. The beta currently creates one owner workspace
  per account; team invitations and granular reviewer roles are not yet built.
- Email verification is not yet mandatory, and there is not yet a self-service
  source-download, retention, or account-deletion workflow. Those controls are
  required before accepting unredacted production client data.
- CSV ledgers receive deterministic row-level validation. XLSX ledger uploads
  still rely on AI extraction and verification and therefore remain higher
  risk until deterministic workbook parsing is added.
- The contact form opens a prefilled message in the visitor's email app; the
  website does not submit, transmit, or store the form data itself. The static
  destination is configured in `src/pages/PilotPage.tsx` and is not displayed
  in the public interface.
- Generated outputs are drafts and cannot be used as accounting,
  legal, audit, or compliance advice.
- Human controller review remains required before any external use.
- Daily social results depend on third-party search indexes, which may omit,
  delay, or misdate posts. Results remain research-only until reviewed.
