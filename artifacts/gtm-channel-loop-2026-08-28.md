# GrantDeskHQ channel-loop execution report — 2026-08-28 UTC

## Operational outcome

The Channel Results scan is now represented in the canonical production GTM datastore as 30 source-tagged organization seeds: 20 Direct and 10 Partner. The import is authenticated, idempotent, provider-free, and explicitly prevents those seeds from being treated as contactable prospects until independent verification occurs.

Production serves `grantdeskhq-prototype-00400-qug` at 100% traffic. `/api/health` returned HTTP 200 after promotion. Known-good rollback revision `grantdeskhq-prototype-00387-ker` is preserved.

The full outbound loop is **not operational**. All effective outbound flags are false and campaigns/reconciliation schedulers remain paused. Incident cleanup is now complete, but the replacement Instantly V2 key lacks the campaign-update and SuperSearch-preview permissions necessary for safe activation and provider-first enrichment.

## Seed import evidence

| Metric | Result |
| --- | --- |
| Seed source | `chatgpt_channel_scan_2026_08_28` |
| Source URL | `https://chatgpt.com/share/6a913e29-1c68-83ed-acc3-8c6e00423acb?ogimg=plain` |
| Direct organization seeds | 20 |
| Partner organization seeds | 10 |
| First authenticated import | 30 created |
| Immediate rerun | 0 created, 30 duplicate (idempotent) |
| Provider enrichment calls during import | 0 |
| Instantly leads/campaign enrollments during import | 0 |
| Emails sent during import | 0 |

Every record is `DISCOVERED` and retains explicit blockers: independent public organization/signal verification, resolved domain, named role-fit contact, and verified business email. The shared scan is not used as personalization or as proof of an award, grant need, role, or email.

## Implementation and deployment

- `src/lib/gtmChannelSeeds.ts`: deterministic 30-record manifest and non-contactable canonical mapping.
- `server/persistence.ts`: Firestore `currentDocument.exists=false` seed persistence and bounded read model access.
- `server/gtmCanonical.ts`: server-canonical dashboard composition includes persisted seeds.
- `server/cloudRun.ts`: scheduler-authenticated import endpoint. It makes no enrichment, Instantly, or delivery call.
- `.gcloudignore`: excludes `incident/`, `artifacts/`, and `.worktrees/` from Cloud Build uploads.

Build: `7d323080-5003-4fd6-b827-b57f93e45a08` — `SUCCESS`.

Image digest: `sha256:df33b33bebe6ab7dd2e39051e4a79ca06e5e77da48662005eabaa8b15d7e6b47`.

Revision: `grantdeskhq-prototype-00400-qug` — Ready and 100% traffic.

Structured logs contain two `GTM_CHANNEL_SEED_IMPORT` events: first run `30/0/30` (imported/duplicate/total), immediate rerun `0/30/30`. The promoted revision had no error-severity Cloud Run log entries for this run.

## Verification

| Gate | Result |
| --- | --- |
| Focused seed/idempotency plus final-handoff safety tests | PASS — 11 tests |
| Full test suite | PASS |
| TypeScript | PASS |
| ESLint | PASS |
| Production build | PASS |
| Candidate health | PASS |
| Authenticated Firestore seed import | PASS |
| Idempotent rerun | PASS |
| Production health after promotion | PASS |
| Provider-enrichment / verified contact stage | NOT RUN — seed records intentionally lack independently verified domains and signals |
| Instantly staging / scheduling / sending / reconciliation | BLOCKED — safety cleanup cannot be completed with current provider scope |

## Effective serving configuration and schedules

The serving revision reports all five delivery controls false: `OUTBOUND_EMAIL_ENABLED`, `INSTANTLY_OUTBOUND_ENABLED`, `INSTANTLY_AUTO_HANDOFF_ENABLED`, `DIRECT_INSTANTLY_ENABLED`, and `PARTNER_INSTANTLY_ENABLED`.

Paused: `grantdeskhq-instantly-reconciliation`, `grantdeskhq-daily-partner-reconciliation`, `grantdeskhq-direct-live-reconcile`, and the historical partner-live reconciliation job. Enabled and non-delivery: `grantdeskhq-daily-social-scan`, `grantdeskhq-seo-reconciliation`, and `grantdeskhq-daily-reliability-canary`.

## Incident safety gate

Incident reconciliation established 16 affected duplicate-email recipients. All 16 are internally suppressed; seven provider membership moves reached terminal background-job success. Nine historical recipients no longer have current campaign membership and must be provider-blocklisted rather than guessed or re-enrolled.

The replacement Instantly V2 key created and verified 16 provider block-list entries for the 16 internally suppressed incident recipients. Seven prior provider moves to the incident holding list had already reached terminal success. No affected recipient is eligible for re-enrollment.

Read-only V2 preflight is healthy for accounts, campaigns, lead lists, leads, email polling, and block-list reads. Both mapped GrantDeskHQ campaigns are paused and retain their weekday America/Detroit schedules, nonblank sequence subjects, reply stops, bounce protection, and disabled open/click tracking.

The key does not include the documented `campaigns:update` permission required to activate or patch either campaign. It also returned HTTP 401 request `917946528970865119` for documented SuperSearch preview, requiring `supersearch_enrichments:read`. The default workspace already returns the intended GrantDeskHQ campaigns; `workspaces:read` is not operationally required for this mapping, but its dedicated endpoint returned HTTP 401 request `1965603776546794708`.

## Required external action

Update the existing V2 API key so it retains its current scopes and adds `campaigns:update` and `supersearch_enrichments:read`; then replace the value at the existing Secret Manager reference `grantdeskhq-instantly-api-key`. No source code, Firebase, Cloud Run authentication, or campaign change is required. After the refreshed secret is deployed, the recovery can execute campaign-update preflight, Direct and Partner internal canaries, then provider-first enrichment and enrollment gates.

## Git

- Branch: `incident-recovery-2026-08-27`
- Seed-import commit: `eca4c4d`
- Cloud Build privacy exclusion: `b42e6c6`
- Both commits were pushed to `origin` (`https://github.com/johnnyappleseed818/grantdeskhq.git`).

Unrelated generated sample assets, `.worktrees/`, and local incident artifacts remain uncommitted and were preserved.
