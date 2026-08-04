# GrantDesk interactive product prototype

GrantDesk is a polished, static React product demonstration for an AI-powered
post-award grant-reporting workflow used by fractional nonprofit CFO firms,
outsourced accounting practices, and nonprofit controller teams. The product
direction is designed to reduce repetitive assembly, catch missing evidence
earlier, and make professional review easier.

> Interactive prototype using synthetic demonstration data. GrantDesk outputs
> are drafts and suggested mappings that require professional human review.
> This repository contains no backend, database, external AI connection,
> accounting-system integration, or automatic funder submission.

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
| `/demo` | Stateful synthetic GrantDesk agency workspace |
| `/sample-report` | Print-ready funder-report review package |
| `/privacy` | Honest prototype and pilot data-handling boundaries |
| `/pilot` | $500 Founding Agency Pilot and contact enquiry |
| `*` | Accessible not-found page |

The demo includes Agency Overview, Source Package, Requirements, Financial
Mapping, Missing Inputs, Narrative Draft, Quality Review, and Export Package
screens. All interactive changes are deterministic local React state.

## Technical stack

- React 18 and TypeScript
- Vite 7
- Tailwind CSS 3 through PostCSS; no browser CDN
- React Router
- Lucide React icons
- Vitest, Testing Library, and jsdom
- `pdf-lib` for synthetic PDF generation
- `write-excel-file` for XLSX generation and `read-excel-file` for asset verification
- ESLint 9 flat configuration
- System font stack and no external images, fonts, analytics, or tracking

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
│   ├── lib/calculations.ts
│   ├── pages/
│   ├── test/
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
└── vercel.json
```

## Local setup and commands

Node 22.12 or newer is required.

```bash
npm ci
npm run generate:assets
npm run dev
```

Vite prints the local development URL. The interactive prototype requires no
environment variables.

Quality and production commands:

```bash
npm run lint
npm test
npm run build
npm run preview
npm audit --omit=dev
npm audit
```

- `npm run lint` checks the TypeScript, React, test, configuration, and
  generator sources with zero allowed warnings.
- `npm test` regenerates assets, then runs all deterministic calculation,
  route, interaction, accessibility-label, mobile-navigation, review-gate,
  asset-link, PDF, XLSX, and CSV tests.
- `npm run build` regenerates assets, runs strict TypeScript validation, and
  creates the production output in `dist/`, including direct-load entry files
  for every public application route.
- `npm run preview -- --host 127.0.0.1 --port 4173` serves the production
  build for runtime route and download verification.
- The current npm advisory database flags React Router's server/RSC action
  mode. GrantDesk is a static client-only application: it has no server
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

Verified result: lint passed with zero warnings, all 30 tests passed, and the
Vite production build completed. The two audit commands report only the same
upstream React Router RSC-mode advisory described above; no affected RSC or
server-action mode exists in this project.

Runtime checks should confirm HTTP 200 for:

```text
/
/demo
/sample-report
/privacy
/pilot
/samples/Synthetic_Grant_Agreement.pdf
/samples/Approved_Grant_Budget.xlsx
/samples/General_Ledger_Export.csv
/samples/Synthetic_Funder_Report_Draft.pdf
/samples/Transaction_Evidence_Schedule.xlsx
```

## GitHub Pages deployment

The production repository includes a Pages workflow. A push to `main` runs
installation, linting, tests, the production build, artifact upload, and Pages
deployment.

1. In GitHub, open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Confirm the custom domain is `grantdeskhq.com`.
4. Confirm DNS contains the four GitHub Pages apex A records and the `www`
   CNAME pointing to `johnnyappleseed818.github.io`.
5. Push a reviewed commit to `main`.
6. Wait for **Deploy GrantDesk to GitHub Pages** to pass.
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
5. Deploy.
6. Add `grantdeskhq.com` only after choosing Vercel instead of the existing
   GitHub Pages production target and updating DNS deliberately.

The checked-in `vercel.json` rewrites application routes to `index.html`.

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
4. Deploy.
5. Add the production domain only if Netlify is intentionally replacing
   GitHub Pages.

The checked-in `public/_redirects` file is copied to `dist/_redirects` and
provides the SPA fallback.

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
and Firefox before a paid pilot.

## Honest limitations

- This is an interactive static prototype, not a production AI system.
- Synthetic processing statuses and suggestions are deterministic local data.
- No real files are accepted, processed, stored, reconciled, or transmitted.
- No production security controls, certifications, integrations, accuracy
  measurements, or performance measurements are claimed.
- Questionnaire, assignment, due-date, mapping, and review controls update local
  browser state only.
- The contact form opens a prefilled message in the visitor's email app; the
  website does not submit, transmit, or store the form data itself. The static
  destination is configured in `src/pages/PilotPage.tsx` and is not displayed
  in the public interface.
- Generated outputs are synthetic drafts and cannot be used as accounting,
  legal, audit, or compliance advice.
- Human controller review remains required before any external use.
