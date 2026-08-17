# Founder dashboard zero-traffic candidate validation

Validated 2026-08-17 for `founder-gtm-zero-traffic-candidate-20260817` from `feature/outreach-feedback-tracking` at source commit `640f7a9`.

## Candidate and rollback

- Candidate revision: `grantdeskhq-prototype-foundergtm0817`
- Tag and candidate URL: `founder-gtm-0817` — `https://founder-gtm-0817---grantdeskhq-prototype-me423s5k5a-uc.a.run.app`
- Candidate traffic: no percentage is allocated (tag-only / 0%).
- Live rollback target: `grantdeskhq-prototype-00164-dug` (`stripe-live-0817`), still receiving 100% traffic.
- Candidate revision is Ready; its container-health condition is True.

## Candidate checks

- `GET /api/health` returned HTTP 200 with `status: ok` and deployment revision `grantdeskhq-prototype-foundergtm0817`.
- `GET /pricing` and `GET /resources` returned HTTP 200. A headless browser rendered their expected headings.
- The rendered public pricing page contains no `founding`, `coupon`, `Stripe`, or server-implementation terminology.
- Unauthenticated `GET /api/gtm/access` and `GET /api/gtm/outreach` each returned HTTP 401. A browser visit to `/gtm` redirected to `/login?next=/gtm`.
- At a 390px viewport, the public navigation opens and exposes the Resources link.
- Focused coverage passed: 69 tests across founder GTM, totals, pricing, workspace, public routes, and billing. The ledger asserts 5 direct, 5 partner, and 10 total manual sends; 10 awaiting response; and zero replies, trials, paid customers, and MRR. Dashboard coverage asserts automated outbound is locked and has no `mailto:` delivery action.
- `npm run lint` and `git diff --check` passed. The non-secret runtime configuration (service account, concurrency, timeout, resources, port, and environment-variable names) matches the live revision. The only pre-existing working-tree change before this task was the task record in `ops/codex-work-queue.json`; no commercial configuration file changed.

## Readiness

PASS — candidate is ready for human-controlled follow-up. No production traffic was allocated, no live service configuration was changed, and no outreach or other external delivery action was performed.
