# GrantDeskHQ AI report-compiler prototype

GrantDeskHQ is a working early-stage prototype for an AI-powered post-award
grant-reporting workflow used by nonprofit finance teams, fractional nonprofit
CFO firms, accounting practices, and controllers. It combines a guided React
interface with a server-side OpenAI Responses API compiler and a separate
evidence-verification pass.

> The public demo uses synthetic data. The working compiler accepts only
> synthetic or appropriately redacted test files. All outputs are drafts,
> suggested mappings, and source-matched statements that require professional
> review. No report is submitted automatically.

Production domain: [grantdeskhq.com](https://grantdeskhq.com)

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
| `/sample-report` | Print-ready funder-report review package |
| `/privacy` | Honest prototype and test-file data-handling boundaries |
| `/pricing` | Founding Nonprofit and Founding Agency pricing |
| `/assessment` | Free-first-report founding access and contact enquiry |
| `/pilot` | Compatibility redirect to `/assessment` |
| `*` | Accessible not-found page |

The synthetic demo includes Agency Overview, Source Package, Requirements, Financial
Mapping, Missing Inputs, Narrative Draft, Quality Review, and Export Package
screens. The `/compile` route adds real file intake, structured AI output,
an independent verification pass, evidence coverage, and an export gate.

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
- `pdf-lib` for synthetic PDF generation
- `write-excel-file` for XLSX generation and `read-excel-file` for asset verification
- ESLint 9 flat configuration
- System font stack and no external images, fonts, analytics, or tracking

No database is used. The API key stays in the server environment and is never
included in the browser bundle.

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
│   └── reportCompiler.ts
├── netlify/functions/compile-report.ts
├── public/
│   ├── 404.html
│   ├── CNAME
│   ├── _redirects
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
│   │   └── grantData.ts
│   ├── lib/
│   │   ├── calculations.ts
│   │   └── prototype.ts
│   ├── pages/
│   ├── test/
│   ├── types/prototype.ts
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── styles.css
├── script.js
├── scripts/create-spa-routes.js
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
```

Vite by itself serves the frontend and synthetic demo. Use `vercel dev` or
`netlify dev` when testing the `/api/compile-report` serverless endpoint
locally. Never prefix the secret with `VITE_`; Vite-prefixed variables are
exposed to the browser.

Quality and production commands:

```bash
npm run lint
npm test
npm run build
npm run preview
npx vitest run
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
- `npm run preview -- --host 127.0.0.1 --port 4173` serves the production
  build for runtime route and download verification.
- The current npm advisory database flags React Router's server/RSC action
  mode. GrantDeskHQ is a static client-only application: it has no server
  rendering, React Server Components, route actions, backend, or action
  endpoints. The finding is therefore not reachable in this deployment, but
  the dependency should be upgraded when the router project publishes a fixed
  release.

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

Verified result: lint passed with zero warnings, all 33 tests passed, and the
Vite production build completed. The two audit commands report only the same
upstream React Router RSC-mode advisory described above; no affected RSC or
server-action mode exists in this project.

Runtime checks should confirm HTTP 200 for:

```text
/
/demo
/compile
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

GitHub Pages can host the marketing pages and synthetic demo, but it cannot run
the serverless AI endpoint. The working `/compile` workflow should be deployed
to Vercel or Netlify before it is offered publicly.

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

### Dashboard

1. Import the dedicated `johnnyappleseed818/grantdeskhq` repository.
2. Select **Vite** as the framework preset.
3. Set **Build Command** to `npm run build`.
4. Set **Output Directory** to `dist`.
5. Add `OPENAI_API_KEY` as a Production and Preview environment variable.
6. Optionally set `OPENAI_MODEL` to `gpt-5.6-terra`.
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

## Netlify deployment

### Dashboard

1. Import the dedicated `johnnyappleseed818/grantdeskhq` repository.
2. Set **Build Command** to `npm run build`.
3. Set **Publish Directory** to `dist`.
4. Set the functions directory to `netlify/functions` (also configured in
   `netlify.toml`).
5. Add `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in environment variables.
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

## Questionnaire and consent-based Resend email

The questionnaire builder is stored at
`outreach/GrantDeskHQ_Google_Form_Builder.gs`. The published ten-question
workflow assessment is linked from `/assessment`; it creates a linked response
spreadsheet and includes an explicit email-consent question.

The approval copy is in `outreach/RESEND_EMAIL_PREVIEW.md`. Preview the send
utility without contacting anyone:

```bash
npm run outreach:preview
```

The utility reads `outreach/GrantDeskHQ_Resend_OptIn_Only_Template.csv` by
default. It excludes unsubscribed rows and refuses any row without an email,
consent source, consent date, and HTTPS unsubscribe URL. It never sends unless
`--send` and the exact confirmation environment variable are both supplied.
Do not use the 30 researched public contacts in the validation workbook for a
Resend campaign; they do not contain recorded opt-in consent.

`outreach/VERIFIED_PRIORITY_A_SHORTLIST.md` records 27 current finance, CFO,
grants, and compliance leaders verified against their organizations' official
staff pages. Three older workbook records are separated as unverified and
excluded. All profiles are research records rather than Resend subscribers.

## Honest limitations

- The synthetic `/demo` route remains deterministic local data. The `/compile`
  route is a working AI prototype, not a production accounting system.
- Uploaded prototype files are sent to the configured OpenAI API project for
  processing. Use only synthetic or appropriately redacted test files. Provider
  terms and retention settings apply.
- A second AI verification pass materially improves traceability, but cannot
  guarantee that every AI error is eliminated. Source evidence and professional
  review remain mandatory.
- No production security certification, accounting integration, accuracy
  measurement, or performance statistic is claimed.
- Reviewer resolutions update local browser state only; no user accounts or
  application database exist yet.
- The contact form opens a prefilled message in the visitor's email app; the
  website does not submit, transmit, or store the form data itself. The static
  destination is configured in `src/pages/PilotPage.tsx` and is not displayed
  in the public interface.
- Generated outputs are drafts and cannot be used as accounting,
  legal, audit, or compliance advice.
- Human controller review remains required before any external use.
