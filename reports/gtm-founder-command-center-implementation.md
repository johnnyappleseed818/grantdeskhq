# Founder GTM Command Center implementation

## Scope completed

- Reoriented the private GTM workspace around commercial operating questions.
- Primary navigation is now Overview, Outreach, Leads, Partners, Feedback, and System Health.
- Overview renders the confirmed manual ledger: 5 Direct, 5 Partner, 10 Sent; awaiting reply is derived from records with no reply; replies, positive replies, trials or Free First Awards, paid, and MRR remain zero when no canonical outcome exists.
- Added compact direct and partner funnels and a next-actions list based only on canonical `AWAIT_RESPONSE` records. The ledger has no follow-up dates, so none were invented.
- Added contact-level Outreach search and direct/partner filters while retaining provenance, canonical-link, and outcome details.
- Preserved lead inventory, partner inventory, the existing feedback-review route, and technical/supporting views. Infrastructure, freshness, source, automation-lock, and accuracy information is now under System Health.

## Safety boundary

Automated outbound remains visibly locked. This change adds no send action, email address, delivery inference, commercial configuration, or payment behavior.

## Validation

- `npm run lint`
- `npm run build`
- `npm exec vitest -- run src/test/gtm.test.tsx src/test/gtmOutreach.test.ts src/test/contactFeedbackExperience.test.tsx --disableConsoleIntercept` — 23 passed
- `git diff --check`
