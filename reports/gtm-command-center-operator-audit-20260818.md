# GTM Command Center operator audit — 2026-08-18

Scope: the authenticated GTM operator workspace and the navigation that exposes it. This review uses canonical human-confirmed outreach data only; it does not infer replies, opens, follow-up dates, trials, or revenue.

## Findings and dispositions

| Surface / element | Disposition | Operator rationale |
| --- | --- | --- |
| Product header | CHANGE | Keep normal product links and a visible `Contact Us` link. Hide GTM from non-operators; remove duplicate Feedback review and Reliability links. |
| Footer | KEEP / CHANGE | Retain one visible `Contact & Feedback` path and one operator-only GTM entry. Remove the duplicate Reliability dashboard entry. |
| GTM header | CHANGE | State the real operating mode: manual outreach is active; Instantly is warming and automation is paused. |
| Overview KPI row | CHANGE | Lead with sent events, unique contacted, awaiting reply, replies, positive replies, trials, paid, and actual MRR. Technical inventory is not a commercial KPI. |
| Next Actions | CHANGE | Place it directly below KPIs. Empty state is factual: no cadence, replies, trials, customer issues, or feedback action is recorded. |
| Direct / partner funnels | CHANGE | Use compact, drill-down-oriented funnels. Keep direct and partner acquisition distinct. |
| Outreach | CHANGE | Make this the canonical daily ledger with precise filters, human-confirmed manual sends, unknown dates shown as `Date not recorded`, and no external-send control. |
| Leads | MOVE / KEEP | Retain upstream inventory and signal intelligence. Keep it separate from contacted-outreach history; scanner state belongs in System Health. |
| Partners | CHANGE | Replace strategy-heavy cards with an actual contacted-partner funnel/table. Keep channel hypotheses compact and secondary. |
| Feedback | KEEP / MOVE | Keep the existing authenticated feedback review workflow as the canonical queue, linked from GTM rather than duplicating records or fabricating counts. |
| System Health / Reliability | MOVE / CONSOLIDATE | Technical scanner, enrichment, reconciliation, source, and automation details live here, not in the commercial Overview. |
| Targets / gap tables | MOVE | Inventory targets remain secondary to actual pipeline states and are not primary Overview KPIs. |
| Legacy `Identify 10 firms` instruction | CHANGE | Replaced with a derived, dedupe-safe pipeline action; it must not remain after the contacted-partner baseline exists. |

## Data-integrity result

- Direct organizations already contacted: **7**
- Partner organizations already contacted: **10**
- Unique organizations already contacted: **17**
- Missing / unaccounted: **0**
- Duplicate initial send guard: organization, domain/alias, recipient email, prior initial-outreach history, suppression, and future Instantly state are all checked before initial-send eligibility.

## Five-second acceptance test

- **Overview:** factual commercial outcomes, then exact next action / nothing-due state.
- **Outreach:** who was contacted, their current response state, and whether any action is due.
- **Leads:** upstream qualified inventory, not a second outreach ledger.
- **Partners:** partner funnel and actual organization-level status.
- **Feedback:** one canonical feedback-review destination.
- **System Health:** technical conditions are available without masking sales operations.

## Explicit non-claims

No reply, delivery/open/click, follow-up date, trial, paid customer, MRR, scanner run, or email event is invented. Manual email events are represented as human-confirmed facts; no email was sent by code.
