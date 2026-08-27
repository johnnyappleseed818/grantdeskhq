# Incident recovery record — 2026-08-27

## 19:35–19:36 UTC: Instantly V2 authorization and membership evidence

- The documented V2 `POST /api/v2/leads/move` endpoint requires `leads:update` (or the documented broader equivalents) and returns a background job. Documentation was consulted before testing.
- A deliberately invalid destination returned HTTP 403 with `Access Denied: No access to this list` and request ID `8536881377151467713`; no lead ID was supplied.
- The actual mapped campaigns and the existing `GrantDeskHQ — Incident Hold 2026-08-27` list share organization ID `d8e61c1a-335b-42e9-9932-039e9ff6b05f`.
- A zero-record move from the mapped Direct campaign to that hold list created background job `6a9091b11eafe1c72b3de90e`; polling `GET /api/v2/background-jobs/{id}` reached `success` with progress 100.
- Read-only reconciliation found 16 duplicate-message lead IDs. Nine remain in the mapped campaigns; seven no longer belong to either mapped campaign. Cleanup must use each lead's current source container and must not assume the campaign recorded on an old email event is still valid.
- Both prospect campaigns remain paused. No prospect email was sent.
