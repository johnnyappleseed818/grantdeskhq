# GA4 live audit — 2026-08-17

## Scope and safety

Audited GA4 measurement ID G-P6N5EME81J on the public Cloud Run runtime. Browser validation intercepted and aborted Google Analytics endpoints, so no GA4 collection request was sent and no production traffic split was changed.

## Public runtime evidence

Headless Chromium opened https://grantdeskhq-prototype-me423s5k5a-uc.a.run.app on 2026-08-17.

| Check | Result |
| --- | --- |
| GET / | 200 |
| GET /api/config | 200; returned measurement ID G-P6N5EME81J |
| Consent before action | Analytics dialog visible; no GA script and no dataLayer commands |
| Consent after Allow analytics | One attempted GET to gtag.js for G-P6N5EME81J, intercepted locally |
| Public page views | Exactly one manual page_view for / and one after SPA navigation to /pricing |
| Duplicate automatic page views | Prevented by send_page_view: false and documented manual page-view tracking |
| Conversion coverage | /pricing emitted pricing_view with only page_type: pricing |
| Response security headers before repair | Referrer-Policy was set; Content-Security-Policy was absent |

The event payloads captured in the browser contained only a fixed event name, public route, title, origin, page_type, and consent/config controls. The allowlisted event type cannot accept email, account IDs, uploaded file names, grant contents, form text, or payment details. Private prefixes (/compile, /gtm, /login, /readiness, and /workspace) are excluded from GA4 page views.

## Repair

Added a CSP at the Cloud Run application layer. It permits scripts only from the app, Google Tag Manager, and Clarity; it permits connections only to the app, GA4 collection, Clarity, and required Firebase browser APIs. The policy also blocks plugins and framing. Local built-candidate browser validation confirmed the header is present, analytics remains absent before consent, and consented / → /pricing navigation retains exactly two manual page views plus the non-sensitive pricing_view event. GA endpoints were again intercepted and aborted.

## Validation

- npm exec vitest -- run src/test/analytics.test.tsx --disableConsoleIntercept — 6 passing.
- npm run lint — passed.
- npm run build — passed.
- npm run test:grantdesk-regression — passed.
- git diff --check — passed.

## Remaining operational prerequisite

GA4 Enhanced Measurement's Page changes based on browser history events must be disabled in the Google Analytics web data-stream console before any traffic promotion. This is an external console setting requiring a human with GA4 access; it was not changed in this audit. No Stripe, billing, email, or outbound behavior was changed.


## Zero-traffic Cloud Run candidate

Two project-scoped gcloud run deploy --source . --no-traffic --tag ga4-audit-0817 attempts reached source upload but exited before Cloud Build or a new revision was created. The two newest Cloud Build entries were empty and the newest ready Cloud Run revision remained grantdeskhq-prototype-foundergtm0817. Therefore no cloud candidate URL was available to validate, and no traffic changed. This is recorded as an environmental deployment-control-plane blocker; the built local candidate validation above passed.
