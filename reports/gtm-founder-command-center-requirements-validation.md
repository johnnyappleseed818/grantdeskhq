# Founder GTM command center requirements validation

- Separate top KPIs: 10 sent, 10 awaiting reply, 0 replies, 0 positive replies, 0 trials/free first awards, 0 paid, and $0 MRR.
- Direct and partner funnel stages show canonical 5-send counts; unsupported stages are explicitly not instrumented.
- Outreach supports search and all requested daily filters; unknown email, due date, and outcomes remain not recorded.
- Feedback links to the existing authenticated review queue; automated outbound remains locked.

Validation: npm run build; npm test -- src/test/gtm.test.tsx src/test/gtmOutreach.test.ts (20 passed).
