# Founder-pricing public copy validation

Date: 2026-08-17

## Result

PASS — the public pricing workflow now uses the approved terminology without changing billing, checkout, subscription, or coupon behavior.

## Verified customer-facing copy

- Headline: `Choose the GrantDeskHQ workflow that fits your reporting needs.`
- Subheading: `Choose the plan that fits your current grant workload and scale as your reporting needs grow.`
- Offer label: `LIMITED-TIME PRICING`
- Offer body: `Lock in your current price for as long as your subscription remains active.`
- Authenticated retained-price status: `Current price retained`
- Price data remains Starter $99 to $49 monthly, Growth $199 to $99 monthly, and Agency $499 to $299 monthly.

The pricing cards no longer include a per-plan promotional checkout note. Public pricing and workspace messages no longer expose Stripe, server, or coupon implementation explanations. The root metadata remains free of those terms.

## Preserved implementation

Existing internal identifiers, including `foundingMonthly`, `foundingPricingActive`, and `foundingPricingApplied`, remain unchanged. No payment configuration, API route, checkout flow, subscription delivery behavior, or traffic setting was altered.

## Validation

- `npm test -- --run src/test/pricing.test.ts src/test/workspaceReports.test.tsx src/test/app.test.tsx` — 36 tests passed.
- `npm run build` — passed; regenerated the direct-load `/pricing` route bundle.
- Affected public-source terminology scan for standalone founder/founding, Stripe, coupon, and server terms — no matches.
- Generated bundle scan — required pricing strings present; removed commercial explanations absent.
