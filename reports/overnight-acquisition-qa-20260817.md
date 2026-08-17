# Acquisition-path QA and performance audit — 2026-08-17

## Scope and safety boundary

This bounded audit covered public acquisition flows, mobile navigation, 404 behavior, sitemap and robots, SEO metadata and structured data, contact access, signup and workspace contracts, analytics instrumentation, static Stripe controls, and public-page performance. No form was submitted, account was created, email was sent, analytics consent was granted, Stripe endpoint was called, payment was attempted, production traffic was changed, or outbound action was performed.

## Result

PASS. Two low-risk candidate repairs were made and validated.

1. The direct-load route generator now includes `contact`, producing `dist/contact/index.html` for static and GitHub Pages consumers.
2. Cloud Run now serves `404.html` with HTTP 404 for an unknown static path. Before this candidate repair, it returned the normal SPA shell with HTTP 200, creating a soft-404 condition.

## QA evidence

- Focused acquisition regression after repairs: `src/test/app.test.tsx` — 30 passed.
- Targeted acquisition, contact, workspace, SEO, analytics, pricing, blog, and mocked Stripe suite — 64 passed.
- Major application regression suite under `src/test` — 346 passed; 4 guarded integration tests skipped.
- Queue controller native suite — 42 passed.
- Lint passed.
- TypeScript, Vite, and static-route build passed. It generated 20 direct-load routes; `dist/contact/index.html`, `dist/404.html`, `dist/robots.txt`, and `dist/sitemap.xml` are present.
- Stripe PCI static audit scanned 184 source files and found 0 violations. Billing tests mock `fetch`; no Stripe request or payment occurred.
- Secret-pattern scan found no matching source file paths.

## Public path and analytics coverage

Regression tests render `/`, `/pricing`, `/sample-report`, `/resources`, `/assessment`, and `/login`; contact is tested as an explicit public form route. Signup validation is limited to route and field contracts, without creating an account. Workspace is covered with mocked authenticated data, without accessing a real account.

The consent-gated analytics manager is tested for pre-consent blocking, post-consent GA and Clarity initialization, one public page view, allowlisted conversion events, and private-route exclusion. Source coverage confirms all 11 declared conversion names are wired: Free First Award, signup start and completion, report start/upload/generated, pricing/checkout/subscription, and contact/feedback lifecycle. Properties are fixed allowlisted values; uploaded files, report data, form entries, account details, and payment details are excluded.

## SEO, mobile, and performance evidence

- Candidate `robots.txt` permits crawling and names `https://grantdeskhq.com/sitemap.xml`.
- Candidate sitemap contains 10 canonical public URLs: home, pricing, resources, blog index, and six published articles.
- Structured-data tests validate factual Organization and WebSite JSON-LD and exclude review/rating/price/citation claims.
- Blog and Resources tests validate unique client-rendered canonical/OpenGraph/Article metadata. Route-specific tags remain post-hydration; prerendering was deliberately left outside this bounded repair.
- Read-only live evidence before deployment showed `/qa-nonexistent-path` returning the old HTTP 200 SPA shell. The candidate now returns static `404.html` at HTTP 404 in Cloud Run. No deployment or traffic change was made.
- A local 390 × 844 headless Chromium inspection covered home, direct `/contact`, and an unknown route: it verified the labelled mobile menu expands, direct contact is reachable, and the React NotFound screen renders. No form interaction was submitted.

The production build completed in 7.67 seconds. Gzip output totals 242.19 kB across entry CSS and JavaScript chunks. The largest chunk is `index-4XwUJd0e.js` at 107.63 kB gzip, followed by React at 58.87 kB and Firebase at 31.68 kB. This is the candidate performance baseline, not a Core Web Vitals score.

| URL | HTTP | Body | TTFB | Total |
| --- | ---: | ---: | ---: | ---: |
| `/` | 200 | 1,870 B | 153.561 ms | 154.335 ms |
| `/pricing` | 200 | 1,870 B | 67.099 ms | 67.201 ms |
| `/resources` | 200 | 1,870 B | 58.353 ms | 58.452 ms |
| `/robots.txt` | 200 | 68 B | 58.898 ms | 59.010 ms |
| `/sitemap.xml` | 200 | 857 B | 59.400 ms | 59.495 ms |

These are single read-only cache/network samples suitable for detecting obvious regressions, not field-performance scores. The 107.63 kB application chunk is the only performance follow-up: split or defer non-critical code before setting a lower initial-JS budget. No performance code change was made because it would exceed this bounded QA scope.

## Deployment follow-up

The live site was not changed. The two candidate repairs need the normal reviewed deployment path before public contact and unknown-path HTTP behavior change. Raw HTML route metadata and article content remain a separately scoped prerendering issue.
