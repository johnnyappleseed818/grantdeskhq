# Partner engine design — SHADOW only

## Shared pipeline
PARTNER ORGANIZATION → VERIFIED DOMAIN → BEST CURRENT PERSON → HUNTER → VERIFIER → OPTIONAL APOLLO FALLBACK → PROVENANCE → SUPPRESSION → PARTNER-SPECIFIC DRAFT → HUMAN APPROVAL

Partner records use the existing shared EnrichmentTarget with prospectChannel. They reuse provider adapters, caching, verification states, provenance, limits, and fail-closed suppression. No sender, delivery queue, Gmail, SMTP, Resend, contact form, or scheduler is part of this engine.

## Gate
Only VERIFIED business email plus CLEAR suppression can become READY_FOR_HUMAN_APPROVAL. Human approval never sends a message; outbound has no implementation path.

## Relationship guard
A = productivity multiplier; B = client enablement; C = possible replacement of billable service; D = unknown. C/D require explicit commercial review before any future action.

## Metrics
Track partner pipeline state, contacts, verification, suppression, human approval, conversations, activated partners, referred nonprofits, paid customers influenced, and ARR influenced. Google Analytics remains source of truth for web traffic; no custom traffic analytics is built.

## Cost controls
Hunter first, verifier only when Finder produces a candidate, Apollo only when Hunter is unresolved and configured/authorized. Cache results; do not guess patterns; bound usage and record provider status.

## Canonical factual inventory (2026-08-17)

The persisted `src/lib/partnerPipeline.ts` inventory is the ten-record public-source expansion in `overnight-partner-intelligence-20260817.md`, not a contact or delivery list.

| Metric | Factual count |
| --- | ---: |
| Researched organizations | 10 |
| A — productivity multiplier | 7 |
| B — client enablement | 2 |
| C — commercial review required | 1 |
| D — direct competitor/replacement risk | 0 |
| Direct business emails established | 0 |
| Suppression checks completed | 0 |
| Ready for human approval | 0 |
| Outbound actions | 0 |

`NOT_CHECKED`, `UNKNOWN`, and `BLOCKED` suppression states fail closed. A/B can reach `READY_FOR_HUMAN_APPROVAL` only after a direct business email is established and suppression is `CLEAR`; C/D stay in `COMMERCIAL_REVIEW_REQUIRED`. This status still does not send, schedule, export, or hand off a message.

## Current status
MODEL: PASS. DETERMINISTIC GATES: PASS after tests. LIVE PARTNER ENRICHMENT: NOT RUN. OUTBOUND: SHADOW-LOCKED.
