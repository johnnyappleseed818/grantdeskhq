# Canonical outreach and feedback workflow

Status: PASS

- The private GTM dashboard now reads the outreach ledger from `gtm/outreach-ledger/records`. A read reconciles the ten immutable human-confirmed records by ID and writes the same ten canonical documents, making repeat imports idempotent. If durable storage cannot be read, the dashboard retains the factual local ledger as a safe no-data fallback.
- The ledger remains factual: five direct nonprofit sends, five partner sends, and ten total sends. Addresses remain null, no delivery/reply/trial/customer outcome is inferred, and source-backed Control Plane IDs remain linked while all others explicitly remain pending.
- GTM-admin-only feedback review supports NEW, REVIEWED, PLANNED, RESOLVED, and CLOSED with bounded admin notes. The server requires GTM authorization for both list and PATCH operations.
- Security and FAQ includes a Contact and feedback route. Notifications remain `NOT_CONFIGURED`; no destination or outbound mechanism was added.

Validation:

- `npx tsc --noEmit`
- `npx vitest run src/test/gtmOutreach.test.ts src/test/feedback.test.ts src/test/contactFeedbackExperience.test.tsx --disableConsoleIntercept` — 10 passed
- `npx eslint` on all modified workflow files — passed
- `git diff --check` — passed
