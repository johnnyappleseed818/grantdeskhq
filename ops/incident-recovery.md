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

## 20:06–20:23 UTC: incident quarantine and provider permission boundary

- Authenticated candidate remediation derived 16 duplicate recipients from the bounded provider evidence window and wrote internal `duplicate_contact` suppressions for all 16.
- Seven membership-reconciled provider moves reached terminal background-job success. Nine lead IDs have no current campaign membership and were deliberately left unresolved rather than moved using stale historical campaign evidence.
- The V2 key successfully read the documented provider block-list endpoint, then the documented create operation returned HTTP 401 with request ID `6966065546653089158`. No provider block-list entry was created by that failed request.
- Campaigns and reconciliation schedulers remain paused. Candidate `grantdeskhq-prototype-00399-mol` is zero traffic; known-good production `grantdeskhq-prototype-00387-ker` remains at 100%.

## 2026-08-28 08:26–08:35 UTC: canonical Channel Results seed import

- Commit `eca4c4d` adds an idempotent, scheduler-authenticated import for the 20 Direct and 10 Partner organization seeds from `chatgpt_channel_scan_2026_08_28`. The shared scan is retained only as a source pointer; it does not establish domain, nonprofit status, pain, person, title, email, or delivery eligibility.
- Commit `b42e6c6` excludes local `incident/`, `artifacts/`, and historical `.worktrees/` paths from Cloud Build uploads. This prevents the local incident CSV from entering a build source archive.
- Cloud Build `7d323080-5003-4fd6-b827-b57f93e45a08` built immutable image digest `sha256:df33b33bebe6ab7dd2e39051e4a79ca06e5e77da48662005eabaa8b15d7e6b47`.
- Candidate `grantdeskhq-prototype-00400-qug` passed health at zero traffic. Authenticated scheduler import returned `imported: 30`, `duplicate: 0`, `providerCalls: 0`, `sends: 0`; the immediate idempotency rerun returned `imported: 0`, `duplicate: 30`.
- Structured Cloud Run logs recorded both import runs. No candidate error-severity log was present after the import.
- The candidate was promoted to 100% production traffic after full source tests, TypeScript, lint, production build, candidate health, and import idempotency checks. `grantdeskhq-prototype-00387-ker` remains available as the verified rollback revision.
- All effective outbound flags remain false on the serving revision. No Instantly lead creation, campaign enrollment, or email delivery occurred in this phase.

## 2026-08-28 08:43–09:00 UTC: replacement-key scope verification and provider block-list cleanup

- Revision `grantdeskhq-prototype-00402-zuv` was created with the existing `INSTANTLY_API_KEY` Secret Manager reference at `latest`, then promoted to 100% traffic after health passed. It changes no application code or authentication configuration.
- Documented read-only V2 calls established that the replacement key reaches the correct GrantDeskHQ workspace directly: campaign list, account list, lead-list read, lead read, email polling read, and provider block-list read all returned HTTP 200. The healthy production sender is the configured Eli mailbox; the two GrantDeskHQ campaigns remain paused.
- Provider incident remediation succeeded: all 16 internally suppressed duplicate-email recipients were added to the provider block list. A bounded readback returned exactly 16 provider block-list entries. No email, campaign activation, or new lead creation occurred.
- Campaign readback: both campaigns retain America/Detroit weekday 09:00–17:00 schedules, tracking disabled, reply/auto-reply stops enabled, bounce protection enabled, nonblank subjects, and a four-day first follow-up delay. Template variables are limited to `firstName`, `openingLine`, and (Partner only) `subjectLine`; the guarded handoff supplies those values before enrollment.
- Remaining provider scope boundary: `GET /api/v2/workspaces/current` returned HTTP 401 request `1965603776546794708` requiring `workspaces:read`; this is not needed because the default context reads the mapped GrantDeskHQ campaigns. A documented non-mutating SuperSearch preview returned HTTP 401 request `917946528970865119` requiring `supersearch_enrichments:read`. The key also lacks the documented `campaigns:update` scope required to patch, pause, or activate campaigns. Delivery flags and reconciliation schedulers remain disabled rather than bypassing those constraints.

## 2026-08-28 09:55–10:15 UTC: final-key seed reconciliation

- The `INSTANTLY_API_KEY` Cloud Run secret reference remains pinned to `latest`; a fresh candidate therefore received the replacement key version without changing application environment values.
- V2 preflights succeeded for account/list reads, SuperSearch preview and list-only enrichment, and verification creation. The previously observed 404 from `GET /email-verification/{email}` was documented provider behavior for an email with no verification job, not a scope denial.
- Commit `f384c2e` implements the documented read-existing-or-create verification flow. Its focused Instantly, seed, and contact suite passed 42 tests; lint and the production build passed.
- Candidate `grantdeskhq-prototype-00409-yed` is ready at 0% traffic with image digest `sha256:955a0f8fbdbd7c1b7c2a20277b8a15e70879a66fe63928f4e020b2b0a1b6980f`; health passed and no post-reconciliation ERROR log was observed.
- Candidate reconciliation persisted two Provider-verified Partner contacts, blocked one provider contact on the canonical business-email/evidence contract, and left three Partner seeds pending. The independently evidenced Direct seed returned zero SuperSearch role matches and remains pending. No campaign enrollment or delivery occurred.
- Delivery remains paused because a verified Direct canary contact and independent evidence for the remaining 24 organization-only seeds do not exist. This is an evidence-quality gate, not an API-key scope boundary.
