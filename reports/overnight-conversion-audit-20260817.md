# Public acquisition conversion audit — 2026-08-17

Scope: homepage, pricing, How It Works, sample output, resources and blog, Free First Award, signup, contact, and responsive navigation. This was a source-and-route audit only: no forms were submitted, no email was sent, and no Stripe or production traffic action was taken.

## Prioritized findings and disposition

1. **P1 — inconsistent primary offer language and destination — fixed.** The anonymous header sent visitors to account creation while homepage, pricing fallback, assessment, footer, and resource CTAs used several variants of “Free First Report,” “analyze your first report,” and “try one award.” This obscured the approved primary conversion path. The anonymous header and homepage now use **Free First Award** and route directly to `/assessment`; pricing fallback, footer, blog, and assessment labels use the same offer. Signed-in users retain the existing New report route.
2. **P2 — email-form expectation was understated — fixed.** The assessment form opens a local email draft rather than submitting a web form. Its CTA now says “Open a Free First Award email draft,” matching the existing nearby disclosure. The questionnaire link remains the immediate no-file intake route.
3. **P2 — secondary-path complexity — retained deliberately.** Readiness, sample output, resources, pricing, and account creation remain available as secondary evaluative paths. Removing them would hide useful product proof or change approved pricing behavior; the primary anonymous header and homepage CTA now make the intended next step unambiguous.
4. **P3 — proof and pricing safety — pass.** The reviewed public copy maintains source-linked output, professional review, synthetic/redacted evaluation-file guidance, and no unsupported accuracy, certification, or customer-proof claims. Approved list pricing and pricing logic were not changed. The public rendered pricing labels do not use founding-program language; the existing limited-time pricing presentation remains unchanged.

## Mobile and route evidence

- The header has a labelled menu control, closes on Escape and route change, and has a focused mobile navigation test. The one primary anonymous CTA remains in that menu, avoiding a duplicate mobile offer link.
- Public route coverage renders `/`, `/pricing`, `/sample-report`, `/resources`, `/assessment`, `/readiness`, `/login`, and related acquisition routes. Route tests now verify the navigation CTA points to `/assessment` and the assessment email-draft disclosure remains explicit.

## Validation

- `npm exec vitest -- run src/test/app.test.tsx src/test/blog.test.tsx src/test/pricing.test.ts --disableConsoleIntercept` — 42 passing.
- `npm run lint` — passed.
- `npm run build` — passed.
- `git diff --check` — passed.

No production deployment, traffic shift, Stripe change, form submission, or outbound email was performed.
