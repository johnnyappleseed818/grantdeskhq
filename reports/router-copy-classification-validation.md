# Router copy-classification validation

Date: 2026-08-17

## Change

The cost router now treats billing, payment, and retained-transaction wording in clearly public copy or UI work as descriptive context when no protected operation is requested. Explicit high-risk flags, protected allowed actions, and affirmative configuration, credential, data, or traffic operations still select the high-risk route.

## Regression coverage

- Public UI billing copy mentioning retained customer transaction records routes to STANDARD / Terra medium.
- Public help-center billing copy mentioning retained customer transaction records routes to ROUTINE / Luna low.
- Public copy paired with inspection of live Stripe checkout configuration remains HIGH_RISK / Terra xhigh.
- Public copy paired with a customer-data retention change remains HIGH_RISK / Terra xhigh.
- Existing protected routing cases remain in the deterministic scenario suite: Stripe, IAM, Secret Manager, production deployment, Cloud Run traffic, and production security configuration.

## Verification

Run `node --test scripts/codex-project-runner/model-router.test.mjs`.
