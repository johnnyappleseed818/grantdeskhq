# Contact and feedback implementation

## Delivered

- Added the public `/contact` route, footer link, category validation, bounded message fields, and an invisible honeypot.
- Added a permanent Workspace feedback entry point with authenticated name/email prefill. When a signed-in user submits, the server verifies the Firebase token and records the trusted user ID and identity rather than trusting browser-provided identity values.
- Added a five-submissions-per-source-per-hour in-memory guard, server validation, Firestore persistence, and the GTM-admin-only `/gtm/feedback` review route.
- Records include creation time, user ID, category, source page, status, admin notes, linked customer ID, and notification status.
- Notifications are intentionally `NOT_CONFIGURED`; no destination is inferred and this implementation sends no email or other message.
- Added only allowlisted conversion events: `contact_opened`, `feedback_started`, and `feedback_submitted`. They contain the fixed event name plus a non-personal surface value only.

## Validation

- `npx tsc --noEmit`
- `npx vitest run src/test/feedback.test.ts` (3 passing)
- Targeted ESLint for the feedback, route, persistence, analytics, and UI files
- `git diff --check`

## Operational note

The per-source limit is process-local, which is intentionally a basic abuse control. A multi-instance deployment that needs a durable shared limit should add a deliberately configured rate-limiting store; it must not alter the notification boundary.
