# Founder GTM overview hierarchy validation

Validated 2026-08-17 for `founder-gtm-overview-integrity-polish-20260817`.

- Overview is commercial-first: direct and partner funnels show only recorded values. Unsupported stages are omitted, and no `NOT_INSTRUMENTED` or `Not instrumented` copy appears in the Overview view.
- Commercial sends remain the confirmed manual-ledger totals: 5 direct, 5 partner, 10 total. Replies, positive replies, trials, and paid remain 0 because the ledger establishes no recorded outcomes.
- Leads and Partners render compact canonical actual/target inventory when supplied. Manual sent counts are retained as a single ledger count rather than added to canonical contacted counts.
- Partners consumes its canonical overview and manual-ledger props.
- Next Actions names the recorded action, organization/contact, reason, source, and only shows a due date when the ledger contains one. Each action opens the Outreach view.
- System Health remains the location for source, freshness, instrumentation, and queue-health detail.

Validation passed:

- `npx vitest run src/test/gtm.test.tsx src/test/gtmOverview.test.ts --disableConsoleIntercept` — 21 tests passed.
- `npm run build` — passed.
- `npm run lint` — passed.
- `git diff --check` — passed.
