# GrantDeskHQ channel-loop execution report — 2026-08-28 UTC

## Operational outcome

The August 28 Channel Results are represented in canonical Firestore as 30 idempotent, source-tagged organization seeds (20 Direct and 10 Partner). The serving production revision remains `grantdeskhq-prototype-00402-zuv` at 100% traffic. The latest candidate, `grantdeskhq-prototype-00409-yed`, is healthy at 0% traffic and uses image digest `sha256:955a0f8fbdbd7c1b7c2a20277b8a15e70879a66fe63928f4e020b2b0a1b6980f` from commit `f384c2e`.

The final Secret Manager reference is `grantdeskhq-instantly-api-key:latest`. Its V2 API access was exercised successfully for account reads, lead-list reads, SuperSearch preview/enrichment, and email-verification creation. The documented verification flow was corrected: Instantly returns 404 until verification is created; the candidate now reads an existing job or creates it before accepting any result.

Outbound is deliberately still disabled. `OUTBOUND_EMAIL_ENABLED`, `INSTANTLY_OUTBOUND_ENABLED`, `INSTANTLY_AUTO_HANDOFF_ENABLED`, `DIRECT_INSTANTLY_ENABLED`, and `PARTNER_INSTANTLY_ENABLED` are all false on the serving service. No campaign enrollment, scheduling, or email delivery occurred during this run.

## Seed lifecycle evidence

| Metric | Result |
| --- | --- |
| Manifest source | `chatgpt_channel_scan_2026_08_28` |
| Source organizations | 30 (20 Direct, 10 Partner) |
| Latest authenticated idempotent import | 0 new, 29 duplicate, 1 independently evidenced upgrade |
| Independently evidenced Partner organizations submitted to SuperSearch | 5 |
| Partner SuperSearch preview matches | 3 |
| Provider contacts returned to Partner list | 3 |
| Partner canonical provider-verified contacts | 2 |
| Partner contacts rejected during canonical reconciliation | 1 |
| Partner seeds still pending provider contact/verification | 3 |
| Independently evidenced Direct organization submitted to SuperSearch | 1 (Mama's Kitchen) |
| Direct SuperSearch preview matches | 0 |
| Direct canonical provider-verified contacts | 0 |
| Remaining organization-only seeds requiring independent evidence | 24 |
| Instantly campaign enrollments from this run | 0 |
| Provider-confirmed sends from this run | 0 |

The two canonical Partner contacts were accepted only after Instantly returned a role-fit contact and its dedicated verifier returned `verified` and non-catch-all. The rejected provider contact is stored as `ENRICHMENT_FAILED` with a non-PII rejection reason. It is not eligible for handoff.

## Safety and incident preservation

- The 16 recipients affected by the August 27 duplicate-email incident remain internally suppressed and provider block-listed.
- Direct and Partner campaigns remain paused. No affected recipient was re-enrolled.
- The candidate cannot enroll or send because all final delivery switches remain false.
- The provider list-enrichment and canonical reconciliation endpoints are no-send paths; they do not map a contact to a campaign.
- Known-good rollback revision `grantdeskhq-prototype-00387-ker` remains preserved.

## Candidate verification

| Gate | Result |
| --- | --- |
| Candidate health | PASS — HTTP 200, revision `00409-yed` |
| Candidate error logs after final reconciliation | PASS — no ERROR entries observed |
| Partner reconciliation | PASS — 2 canonical verified, 1 rejected, 3 pending; no sends |
| Direct reconciliation | PASS — 0 verified / 1 pending after a zero-match preview; no sends |
| Instantly verification flow regression | PASS — create-on-404 coverage added |
| Focused Instantly, seed, and contact tests | PASS — 42 tests |
| ESLint | PASS |
| Production build | PASS |
| Direct canary | NOT RUN — no verified Direct contact exists |
| Partner canary | NOT RUN — no approved internal Partner-canary recipient exists; prospects are not used as canaries |
| Delivery flags / recurring handoff jobs | NOT ENABLED — canary and evidence gates are incomplete |

## Current blocker and safe continuation

This is **not** an API-key scope or workspace blocker. The active limitation is evidence quality: 24 seed organizations retain only the ChatGPT scan reference and cannot be sent to credit-consuming enrichment under the production evidence contract. In addition, there is no independently verified Direct contact and no approved internal two-segment canary pair. The automated loop must remain disabled until those gates have real, documented inputs.

## Git

- Branch: `incident-recovery-2026-08-27`
- Latest source commit: `f384c2e48843a06517147c9edf76582656236688` (`fix: create missing Instantly verification jobs`)
- Previous checkpoint: `e34aec5273d9b43df1c80ae59d4dacf5a7437195` (`fix: fail closed per seed reconciliation`)
- Remote: `https://github.com/johnnyappleseed818/grantdeskhq.git`
- Remote branch proof: `f384c2e48843a06517147c9edf76582656236688 refs/heads/incident-recovery-2026-08-27`

Unrelated sample assets, `.worktrees/`, and `incident/` remain uncommitted and preserved.
