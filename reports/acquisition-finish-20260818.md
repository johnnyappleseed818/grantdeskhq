# GrantDeskHQ acquisition finish — 2026-08-18

## Final status

**PASS.** The requested GA4 candidate validation, targeted safety gates, production promotion, and post-promotion live validation completed for `grantdeskhq-prototype-00177-bec`.

## Deployment

- Production service: `grantdeskhq-prototype` (`us-central1`, project `grantdeskhq-proto-ek-2026`)
- Previous 100% revision: `grantdeskhq-prototype-foundergtm0817`
- Promoted revision: `grantdeskhq-prototype-00177-bec`
- Production traffic after promotion: **100%** to `grantdeskhq-prototype-00177-bec`
- Rollback preserved: `grantdeskhq-prototype-foundergtm0817` retained at zero traffic with the `rollback-foundergtm0817` tag.
- No candidate was rebuilt and no Stripe, IAM, billing, secrets, GTM, outreach, or external-account settings were changed.

## Real GA4 browser/network evidence

Both zero-traffic candidate and live production were validated with Playwright against actual Google Analytics collection requests after analytics consent.

| Gate | Result |
| --- | --- |
| GA script | Pass — exactly one `gtag/js` load |
| Measurement ID | Pass — `G-P6N5EME81J` only |
| `/pricing` page view | Pass — exactly one |
| Duplicate page views | Pass — none |
| `pricing_view` | Pass — exactly one on `/pricing` |
| `free_first_report_click` | Pass — exactly one on `/pricing` |
| SPA route tracking | Pass — one page view each for `/`, `/pricing`, and `/assessment` |
| CSP | Pass — permits the required Google tag and collection endpoints |
| Sensitive GA payload data | Pass — no email, credentials, tokens, or authorization data detected |
| Duplicate initialization | Pass — one GA script element/source/configuration |

The existing validator initially summarized only the first event from batched GA4 payloads. The final read-only browser trace parsed both URL-query and batched event frames and established the exact route-level evidence above; no application revision was changed.

## Targeted checks

- Candidate `/api/health`: HTTP 200, healthy.
- Candidate site/static checks: `/`, `/pricing`, `/resources`, `/blog`, `/contact`, `/demo`, `/sitemap.xml`, and `/robots.txt` all returned HTTP 200 with expected static/canonical content.
- `npm run test:seo-static`: passed (9 public routes).
- `npx vitest run src/test/billing.test.ts src/test/pricing.test.ts src/test/analytics.test.tsx --disableConsoleIntercept`: passed (3 files, 18 tests).
- `npm run audit:stripe-pci`: passed (196 files, no raw-card-handling violations).
- Scoped secret-signature scan: 0 unsafe matches; 4 `sk_test_` fixture matches in `src/test/billing.test.ts` only.

## Post-promotion production checks

Live `https://grantdeskhq.com` returned HTTP 200 with expected title, canonical, and static SEO content for:

- `/`, `/pricing`, `/resources`, `/blog`, `/contact`, `/demo`
- `/blog/post-award-grant-reporting-checklist`
- `/blog/budget-to-actual-grant-reporting-workflow`
- `/blog/turn-grant-agreement-into-reporting-plan`
- `/blog/grant-progress-report-workflow`
- `/blog/grant-closeout-checklist`
- `/blog/post-award-grant-management-software`
- `/sitemap.xml` and `/robots.txt`

The live sitemap includes every checked canonical public route and `robots.txt` references `https://grantdeskhq.com/sitemap.xml`.

## Budget result

- Routed task class/model: `HIGH_RISK` / `gpt-5.6-terra` / `xhigh`.
- Scope: only queued task `ga4-production-promotion-20260818` and its necessary validation/reporting subtasks.
- Budget override: not used.
- Full-regression runs: 0; targeted tests only.
- Result: all required gates passed; no unresolved blockers.
