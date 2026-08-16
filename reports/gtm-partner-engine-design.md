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

## Current status
MODEL: PASS. DETERMINISTIC GATES: PASS after tests. LIVE PARTNER ENRICHMENT: NOT RUN. OUTBOUND: SHADOW-LOCKED.
