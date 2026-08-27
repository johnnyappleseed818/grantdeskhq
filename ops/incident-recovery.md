# Incident recovery record — 2026-08-27

## 19:35–19:36 UTC: Instantly V2 authorization and membership evidence

- The documented V2 `POST /api/v2/leads/move` endpoint requires `leads:update` (or the documented broader equivalents) and returns a background job. Documentation was consulted before testing.
- A deliberately invalid destination returned HTTP 403 with `Access Denied: No access to this list` and request ID `8536881377151467713`; no lead ID was supplied.
- The actual mapped campaigns and the existing `GrantDeskHQ — Incident Hold 2026-08-27` list share organization ID `d8e61c1a-335b-42e9-9932-039e9ff6b05f`.
- A zero-record move from the mapped Direct campaign to that hold list created background job `6a9091b11eafe1c72b3de90e`; polling `GET /api/v2/background-jobs/{id}` reached `success` with progress 100.
- Read-only reconciliation found 16 duplicate-message lead IDs. Nine remain in the mapped campaigns; seven no longer belong to either mapped campaign. Cleanup must use each lead's current source container and must not assume the campaign recorded on an old email event is still valid.
- Both prospect campaigns remain paused. No prospect email was sent.

## 19:57–20:02 UTC: final-boundary safety candidate

- Checkpoint `c00f8449137c714be6926d11a51926f8b27dd7aa` adds the final guarded Instantly handoff, circuit-breaker state, verified-email gate, blank-content rejection, five-calendar-day first follow-up delay, and disables legacy direct prospect paths.
- Cloud Build `f80ebcd6-6bac-4e24-931a-19df1d2862af` succeeded with immutable digest `sha256:ee2c7b26d41a65fc77bb3759d4675ee656a24ae6d0539ed50b7278ea25d2c6a4`.
- Zero-traffic candidate `grantdeskhq-prototype-00396-kix` is Ready; its tagged health endpoint returned HTTP 200. It is not promoted.
- The cleanup route now resolves current lead membership per lead and waits for each documented Instantly background job terminal result. No cleanup or delivery has run on the candidate.
