# Founder-pricing terminology and outreach-ledger audit

Date: 2026-08-17  
Scope: public website source and committed generated build paths; canonical human-confirmed outreach ledger. No application code was changed.

## Result

The customer-facing commercial founder/founding terminology is limited to the pricing experience and the authenticated workspace plan-status label. The committed `/pricing` build route loads the same current application bundle, so its commercial copy is generated from `src/pages/PricingPage.tsx`. Root metadata and the generated route HTML contain no founder/founding commercial terminology.

## Terminology classification

| Location | Classification | Finding / action |
| --- | --- | --- |
| `src/pages/PricingPage.tsx:100,104,109-110` | PUBLIC | Commercial founding terminology and customer-visible Stripe/server implementation explanation. Change as listed below. |
| `dist/pricing/index.html` -> `dist/assets/index-tA3JOs0g.js` | PUBLIC GENERATED | The `/pricing` route loads this bundle, which contains the compiled current pricing copy. Regenerate the build after changing the source; do not hand-edit the bundle. |
| `src/pages/WorkspacePage.tsx:62` | PUBLIC (authenticated) | Customer-facing plan status says `Founding pricing applied`; replace it with neutral retained-price wording (for example, `Current price retained`). |
| `src/content/pricing.ts:8,22,33,45` | INTERNAL | `foundingMonthly` is a pricing-data and display-selection identifier. Preserve it while the billing behavior remains validated. |
| `server/billing.ts`, `server/cloudRun.ts`, `server/persistence.ts` | INTERNAL | Founding-window, coupon, checkout metadata, API/config, and persistence behavior. Preserve; these are not public copy. |
| `scripts/configure-stripe-pricing.mjs`, `README.md` | INTERNAL | Stripe configuration, environment-variable names, and operator documentation. Preserve. |
| `src/test/app.test.tsx`, `src/test/pricing.test.ts`, `src/test/billing.test.ts` | INTERNAL | Regression coverage and internal terminology. Update only where public-copy assertions need to validate the cleanup. |
| `src/pages/GtmDashboardPage.tsx` | INTERNAL / NONCOMMERCIAL | `Founder` describes an internal GTM operating view, not a customer commercial price. No pricing-copy change required. |

## Exact public-copy changes for the follow-up implementation

In `src/pages/PricingPage.tsx`:

1. Change the headline to: `Choose the GrantDeskHQ workflow that fits your reporting needs.`
2. Replace the self-service subheading with: `Choose the plan that fits your current grant workload and scale as your reporting needs grow.`
3. Change the offer label to: `LIMITED-TIME PRICING`.
4. Replace the offer body with: `Lock in your current price for as long as your subscription remains active.`
5. Remove the customer-visible explanation about server enforcement, Stripe confirmation, and qualifying Stripe discounts.
6. Replace the per-plan customer text `Founding pricing is applied securely in Checkout.` with neutral current-price wording; it must not mention founding/founder, Stripe, server enforcement, or coupons.

In `src/pages/WorkspacePage.tsx`, replace `Founding pricing applied` with neutral current-price wording. After source changes, run the normal build so `dist/pricing/index.html` continues to point at a bundle containing the cleaned copy. `index.html` metadata needs no change because it has no commercial founder/founding terms.

## Confirmed-human outreach reconciliation

Canonical ledger: `src/lib/gtmOutreach.ts:35-45`.

| Measure | Result |
| --- | ---: |
| Direct nonprofit sent | 5 |
| Partner sent | 5 |
| Total sent | 10 |
| Missing from expected total | 0 |
| Duplicate immutable IDs | 0 |

All ten records have `sentAt`, `lastContactAt`, `createdAt`, and `updatedAt` set to `2026-08-17T00:00:00.000Z`, with `sentTimePrecision: "DATE_CONFIRMED"`; this is a date-only confirmation, not a fabricated delivery timestamp. Each record has a null email address, `status: "SENT"`, `replied: false`, `replySentiment: "NONE"`, `trial: false`, `customer: false`, and no follow-up due date. The ledger therefore records confirmed manual sends only and does not infer delivery, reply, trial, or conversion outcomes.

`src/test/gtmOutreach.test.ts` independently asserts the 5/5/10 totals, zero inferred downstream outcomes, and immutable-ID replay deduplication.
