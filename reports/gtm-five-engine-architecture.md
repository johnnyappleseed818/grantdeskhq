# GrantDeskHQ five-engine GTM architecture

## 1. Market intelligence

Buyer-language observations remain source-linked and aggregate into recurring themes; no fabricated quotes or automatic homepage rewrites.

## 2. Prospect intelligence

The GTM Control Plane is canonical for direct nonprofit opportunities. Explainable priority uses fit, intent, timing, contactability, and procurement friction. The pipeline remains DISCOVERED through PAID with suppression always overriding progression.

## 3. Outreach

Signal-aware, human-review-only drafts select the opening from verified award, hiring, partner, or attributable pain signals. Outbound remains permanently disabled in this implementation.

## 4. Conversion

Private conversion-learning records retain the received reply, deterministic classification, extracted objection category, suppression result, and a human-recorded open/won/lost outcome. Deterministic labels are suggestions only: a reviewer must complete review before an outcome leaves the review queue. `NO_AUTO_RESPONSE` is a model invariant, and this implementation exposes no send or response endpoint. A blocked suppression result or unsubscribe classification produces `SUPPRESSED` regardless of any recorded win/loss state.

## 5. Acquisition optimization

Recommendations require real, completed human-reviewed `WON` or `LOST` conversion outcomes and an explanation; absent evidence produces no recommendation. The bounded channel-review primitive requires at least three such outcomes in each compared channel, identifies every persisted conversion record used, shows win/loss counts and rates for both channels, and labels confidence from the reviewed sample size. It excludes unreviewed, suppressed, open, unknown, malformed, and non-terminal records.

The output is a human-review suggestion only. It cannot update prospect scores, rank opportunities, alter draft language, create a follow-up, or send a message. The follow-up queue continues to exclude suppressed/replied contacts.

## Command Center status

A zero-traffic candidate adds factual Control Plane current/target/gap KPIs, freshness, enrichment health, and the no-send funnel. Partner research is intentionally shown as not instrumented until a canonical persisted partner source is added; actuals are not manufactured. Google Analytics remains web-traffic source of truth.
