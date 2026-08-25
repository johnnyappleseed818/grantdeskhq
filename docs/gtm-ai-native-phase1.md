# AI-Native GTM & Distribution Engine — Phase 1

## Current architecture audit

| Component | Current behavior | Decision |
| --- | --- | --- |
| Canonical GTM | Server-side readiness, prior-contact, suppression, and Instantly reconciliation determine Direct and Partner state. | **KEEP** as the only first-touch truth. |
| Direct discovery | Daily USAspending award scan plus bounded public award/hiring research; public evidence is retained. | **IMPROVE** by grouping signals into market events before founder review. |
| Contact resolution | Existing authoritative-public-email first and person-first enrichment fallback; canonical gates remain mandatory. | **KEEP**. Do not introduce Clay or guessed emails. |
| Partner discovery | Daily, inventory-aware public research for nonprofit accounting/CAS, CFO, and grants-advisory candidates. | **IMPROVE** with distribution leverage and partner-multiplier decisions. |
| Social research | Daily public Reddit/forum/LinkedIn-search research with durable Responded/Skipped state. | **KEEP** as a market-pain signal, never as a contact list. |
| Instantly | Provider for the controlled, founder-approved campaign execution and polling. | **KEEP** behind a founder approval boundary. |
| SEO & Content | Search Console, content opportunities, review workflow, voice QA, and manual distribution tasks. | **KEEP**; feed community and market-event themes into content decisions later. |
| Free First Award | `/assessment` starts the actual authenticated report workflow and retains attribution into billing. | **KEEP**; it is the current product-led conversion destination. |
| Report/readiness extraction | Existing real requirement and report compilation paths process private customer documents. | **REUSE** for the future free Reporting Requirements Analyzer; private content is excluded from GTM targeting without explicit consent. |
| Lifecycle and billing | Canonical funnel, Stripe webhook truth, billing portal, and non-sending nurture queue. | **KEEP**. |

## Current GTM flow

1. Existing daily jobs reconcile Instantly provider evidence before evaluating canonical Ready inventory.
2. When Direct inventory warrants it, bounded USAspending and public Direct discovery provide source-backed award and hiring candidates.
3. When Partner inventory is below its floor, bounded public research finds nonprofit-finance intermediaries before contact enrichment.
4. Canonical readiness applies role, email, verification, prior-contact, suppression, customer, and active-sequence controls.
5. Instantly is only used for explicitly approved controlled batches. It owns campaign delivery, replies, and follow-up state.
6. Social and SEO remain research/distribution queues; neither posts automatically.
7. `/assessment` takes an acquired visitor into the existing real Free First Award/report workflow rather than a mailto or demo request.

## Leverage bottleneck analysis

The main bottleneck was not a lack of scanners. It was that awards, hiring, partners, and community pain were presented as separate records. That forces the founder to recognize a market event manually and obscures routes that can reach multiple accounts.

Secondary bottlenecks are intentionally not solved by more scraping:

- Award evidence establishes timing and funding, not a confirmed reporting problem or buyer.
- A partner candidate can have a strong service fit without a public client-count claim. Client reach must remain unknown until evidenced.
- Existing Direct/Partner Ready inventory is a consumption buffer, not a campaign authorization.
- The product already has a real activation flow; a new free analyzer must reuse its extraction path rather than create a fake lead magnet.

## Phase-1 implementation

The new `gtmOpportunityEngine` is a durable, server-canonical decision layer over existing scans and canonical readiness.

### New entities

- **MarketSignal** — a source-backed award, hiring, partner, or community-pain event with Known/ Inferred/Estimated distinction.
- **OpportunityCluster** — organizations and signals that share a program, funder, hiring event, or repeated workflow pain.
- **DistributionNode** — a source-backed accounting/CAS, fractional-CFO, grant-consulting, or related intermediary.
- **GtmPlaybook** — a founder-approved recommendation; it cannot launch a campaign.
- **GtmExperiment** — a durable hypothesis/outcome container with a configurable minimum sample, ready for verified outcome attribution.

### Scoring

The centralized 100-point policy weighs ICP fit (20), urgency (20), reporting complexity (15), cluster size (15), buyer resolvability (10), distribution leverage (10), and commercial potential (10).

The engine distinguishes:

- **KNOWN** — directly supported by a saved public source;
- **INFERRED** — a constrained interpretation from retained facts;
- **ESTIMATED** — a clearly labeled unknown commercial estimate. ACV and ARR stay `null` until real data exists.

Distribution leverage uses public service fit, evidence, and a named contact. It never invents a firm's client count; absent direct relationship evidence, potential ICP reach is explicitly unknown.

### Founder workflow

The authenticated GTM command center now includes an **Opportunities** tab and a compact Today’s GTM Opportunities module on Overview. It shows at most ten score-ranked decisions, the reason-now, source evidence, buyer readiness, distribution route, recommended playbook, and an evidence drawer.

Founder actions are **Approve strategy**, **Snooze**, and **Reject**. They persist server-side. They only change the cluster review state. They do not create Instantly leads, add campaign membership, send email, post socially, or use uploaded documents.

### Runtime integration

The opportunity engine is reconciled at the end of the existing daily Direct/Social runtime and existing Partner reconciliation. No new scheduler job is required. Its reconciliation reads saved state only and does not perform discovery, enrichment, publishing, Instantly mutation, or delivery.

## Reuse plan

- Keep the canonical GTM model as the buyer/contact and prior-contact authority.
- Keep the inventory autopilot as the source-cost control.
- Keep Instantly as the delivery abstraction and require a separate founder-approved execution flow.
- Keep Search Console/content as the feedback and acquisition layer.
- Reuse the report/readiness compiler for the later free Reporting Requirements Analyzer/Calendar.

## Deprecate / stop investing in

- Treating raw prospect count as a principal GTM success metric.
- Giving a source scan or provisional enrichment result the semantics of a commercial opportunity.
- Partner “leverage” scores based on guessed client portfolios.
- Any browser-only founder decision state for market opportunities.
- Independent send logic outside the existing Instantly/canonical control plane.

## Priority matrix

| Work | Revenue impact | Learning speed | Effort | Confidence | Decision |
| --- | --- | --- | --- | --- | --- |
| Market-event clusters from awards/hiring | High | High | Low | High | Phase 1 now |
| Partner multiplier scoring/evidence | High | High | Low | Medium | Phase 1 now |
| Founder opportunity queue/playbook approval | High | High | Medium | High | Phase 1 now |
| Verified experiment outcome attribution | High | Medium | Medium | Medium | Next increment |
| Minimum viable partner referral offer | High | High | Medium | Medium | Phase 2 |
| Partner landing/referral attribution | High | Medium | Medium | Medium | Phase 2 |
| Free Reporting Requirements Analyzer/Calendar | High | Medium | Medium | High (reuse existing extraction) | Phase 3 |
| Collaborative sharing/export | Medium | Medium | Medium | Medium | Phase 3 |
| Automated campaign factory | Medium | Medium | High | Low without results | Phase 4 |
| Self-adjusting scoring | Medium | Low | High | Low without sample size | Phase 5 |

## Phase-2 and Phase-3 guardrails

Phase 2 will add a minimal partner proposition and referral attribution before any complex portal, reseller, or white-label work. Commission ranges remain configuration, not a public promise, until a founder-approved program exists.

Phase 3 will add the free Grant Reporting Requirement Analyzer/Calendar by reusing the existing requirement-extraction workflow. It must deliver standalone deadlines, reporting requirements, evidence checklist, risks, and exports without inventing requirements. Uploaded documents must remain private and cannot seed outbound research without explicit consent.

## Safety invariants

- `INSTANTLY_AUTO_HANDOFF_ENABLED=false` remains authoritative.
- No current controlled-batch lead, campaign member, sender, sequence, schedule, or follow-up is read or changed by the opportunity engine.
- No email, social post, article publication, Hunter lookup, or external campaign happens from a cluster decision.
- All meaningful facts retain source URLs and dates in the evidence drawer.
- Community signals remain anonymous research, not contact records.
