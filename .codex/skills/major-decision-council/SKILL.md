---
name: major-decision-council
description: "Deliberate consequential GrantDeskHQ decisions with independent expert perspectives when strategy, GTM, product, architecture, security, cost, or irreversible commitments have multiple credible options; skip routine execution and clear incident recovery."
---

# Major Decision Council

Use this workflow for a consequential decision, or when the user explicitly invokes `$major-decision-council`. It is deliberation, not execution.

## When to use it

Invoke automatically when a decision has multiple credible options and meaningful uncertainty or consequence for GrantDeskHQ's strategy, ICP, positioning, pricing, packaging, GTM-channel allocation, product roadmap, build-versus-buy choice, architecture, vendor, infrastructure, data model, security, compliance, cost, customer revenue, reliability, or reversibility.

Do not invoke it for routine coding, testing, deployment, monitoring, debugging, status/factual questions, minor reversible implementation choices, a known fix with one established path, or an active incident whose approved rollback or containment action is already clear. Do not let deliberation delay that safe incident action.

## Deliberation

1. Frame the decision, objective, constraints, deadline, reversibility, credible options, and missing facts. Separate verified facts from assumptions, estimates, preferences, and unknowns.
2. Use current authoritative evidence when time-sensitive external facts affect the choice. Preserve citations and label inferences.
3. Spawn three independent reviewers by default. Increase only to four or five when the decision's stakes and genuinely distinct expertise justify it. Choose roles for the decision, such as strategy operator, customer/GTM specialist, technical/reliability specialist, financial analyst, security/compliance reviewer, or skeptic.
4. Give each initial reviewer the decision packet but not another reviewer's conclusion. Require: recommendation, supporting evidence, key assumptions, material risks, disconfirming evidence, confidence, and the safest reversible test when useful.
5. Red-team the leading recommendation after the independent reviews. Reuse a reviewer when practical. Do not decide by majority vote or manufacture consensus.
6. Chair a concise synthesis. Ask one focused question only when an unknown user preference would materially change the recommendation; otherwise make the best evidence-backed recommendation.

## Safety and boundary

Council work is read-only. Do not send messages, alter production, spend money, contact prospects, modify campaigns, publish content, or make other external changes merely because the Council recommends them. Execution still requires authority already present in the user's request or separate approval.

## Decision record

Return: decision and objective; options considered; evidence and important assumptions; Council positions; a weighted decision matrix when it materially helps; recommended option and rationale; strongest dissent; principal risks and mitigations; confidence; facts that would change the decision; a reversible validation step or pilot; clear next action and owner; and the execution/approval boundary. Avoid false numerical precision and state weak evidence plainly.
