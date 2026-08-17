# Founder GTM dashboard production validation

Validated on 2026-08-17 after the authorized promotion of the exact zero-traffic candidate.

## Release

- Production revision: `grantdeskhq-prototype-foundergtm0817` at 100% traffic.
- Validated source commit: `640f7a9a316b4f56ce0e9ae10191709a8c625d62`.
- Preserved rollback revision: `grantdeskhq-prototype-00164-dug` (`stripe-live-0817`).
- Stripe configuration, pricing objects, coupons, webhook configuration, and billing behavior were not changed.


## Live checks

- `/api/health` returned HTTP 200 and identified `grantdeskhq-prototype-foundergtm0817`.
- Public routes `/`, `/pricing`, `/resources`, `/how-it-works`, `/sample-output`, `/free-first-report`, and `/security` returned HTTP 200.
- Desktop pricing showed the approved headline, subheading, limited-time banner, and $99 ₞ $49, $199₆ $99, and $499₞ $299 prices.
- Public pricing rendered no commercial `founding` language and no Stripe, coupon, server, or discount-efforcement implementation language.
- At a 390px viewport, the public navigation exposed and opened Resources correctly.
- Unauthenticated requests to protected GTM routes returned HTTP 401; the GTM UI redirected to login.

## Commercial data integrity

- Direct nonprofit emails sent: 5.
- Partner emails sent: 5.
- Total human-confirmed manual emails sent: 10.
- Awaiting reply: 10; replies, trials, paid customers, and MRR remain 0 because no downstream activity was recorded.
- Automated outbound remains locked. No send action was executed during this release.
- Canonical manual-send reconciliation reports missing/unaccounted: 0.

## Validation

- 69 focused pricing, GTM, ledger, app, workspace, and billing tests passed.
- Lint and `git diff --check` passed.
- Candidate and live smoke checks passed.
- Static secret safety scan passed; no credential material was added to source or reports.

## Remaining non-release action

Contact & Feedback is live with public access, authenticated feedback access, persistence, and GTM-admin review. Email notification remains intentionally unconfigured until a monitored GrantDeskHQ mailbox and approved transactional sender are supplied through `CONTACT_FEEDBACK_EMAIL` and the existing zero-traffic validation process.
