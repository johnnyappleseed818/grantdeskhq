import { GTM_INVENTORY_POLICY, inventoryDecision } from "./gtmInventoryPolicy.ts";

export type ContentOpportunityStatus = "OPPORTUNITY" | "DRAFTING" | "READY_FOR_REVIEW" | "APPROVED" | "PUBLISHED" | "SKIPPED" | "REFRESH";
export type DistributionStatus = "READY" | "POSTED" | "SKIPPED";
export type DistributionPlatform = "MEDIUM" | "REDDIT" | "QUORA" | "LINKEDIN" | "FORUM";

export interface ContentOpportunity {
  id: string;
  topic: string;
  workingTitle: string;
  primaryUserProblem: string;
  icp: string;
  funnelStage: string;
  sourceOfIdea: string[];
  socialSignalCount: number;
  searchEvidence: string;
  existingContentOverlap: string;
  differentiation: string;
  productRelevance: string;
  commercialIntent: "HIGH" | "MEDIUM" | "LOW";
  evergreenValue: "HIGH" | "MEDIUM" | "LOW";
  recommendedFormat: string;
  recommendedAction: "NEW" | "EXPAND_EXISTING";
  priorityScore: number;
  status: ContentOpportunityStatus;
  relatedUrls: string[];
}

export interface ContentDraft {
  id: string;
  opportunityId: string;
  title: string;
  slug: string;
  metaDescription: string;
  canonicalUrl: string;
  body: string;
  internalLinksFrom: string[];
  internalLinksTo: string[];
  ctaUrl: string;
  ctaCopy?: string;
  status: "READY_FOR_REVIEW" | "APPROVED" | "PUBLISHED" | "SKIPPED";
  updatedAt: string;
}

export interface DistributionTask {
  id: string;
  platform: DistributionPlatform;
  contentId: string;
  sourceOrCommunity: string;
  targetUrl: string | null;
  whyRelevant: string;
  distributionFormat: string;
  draftText: string;
  canonicalArticleUrl: string;
  status: DistributionStatus;
}

export interface ContentEngineState {
  enabled: boolean;
  autoPublishEnabled: false;
  generatedAt: string;
  cadence: string;
  opportunities: ContentOpportunity[];
  drafts: ContentDraft[];
  distributionTasks: DistributionTask[];
  sourceSummary: { socialThemes: string[]; directThemes: string[]; searchConsole: string; contentInventory: string; publicResearch: string; };
}

const assessment = "https://grantdeskhq.com/assessment";
const now = () => new Date().toISOString();

const initialOpportunities: ContentOpportunity[] = [
  { id: "content-supporting-evidence", topic: "Grant evidence / supporting documentation", workingTitle: "What documents do you need for a funder report? A practical evidence checklist", primaryUserProblem: "Teams lose time chasing evidence after a report deadline approaches.", icp: "Nonprofit finance, grants, and program teams", funnelStage: "Problem aware", sourceOfIdea: ["Existing post-award workflow content gap", "Canonical Social pain taxonomy: supporting documentation"], socialSignalCount: 0, searchEvidence: "Search Console query data is currently sparse; no volume claim is made.", existingContentOverlap: "Existing articles discuss report workflow but not a dedicated evidence checklist.", differentiation: "A source-linked, owner-based checklist rather than a generic attachment list.", productRelevance: "Explains the evidence inputs and human review workflow GrantDeskHQ supports.", commercialIntent: "HIGH", evergreenValue: "HIGH", recommendedFormat: "Checklist and workflow guide", recommendedAction: "NEW", priorityScore: 91, status: "READY_FOR_REVIEW", relatedUrls: ["/blog/post-award-grant-reporting-checklist", "/sample-report", "/assessment"] },
  { id: "content-reporting-ownership", topic: "Post-award responsibility / ownership", workingTitle: "Who should own post-award grant reporting? A nonprofit operating model", primaryUserProblem: "Finance, program, development, and grants teams can each assume someone else owns the report.", icp: "Nonprofit finance and grants leaders", funnelStage: "Problem aware", sourceOfIdea: ["Canonical Social pain taxonomy: who owns grant reporting", "Existing grant-progress workflow gap"], socialSignalCount: 1, searchEvidence: "No query-volume claim while Search Console query rows remain limited.", existingContentOverlap: "Existing workflow guide covers preparation, not decision rights and handoffs.", differentiation: "Defines accountable owner, contributors, review and evidence responsibilities.", productRelevance: "Clarifies the human-review boundary around source-linked drafting.", commercialIntent: "HIGH", evergreenValue: "HIGH", recommendedFormat: "Practical operating guide", recommendedAction: "NEW", priorityScore: 89, status: "READY_FOR_REVIEW", relatedUrls: ["/blog/grant-progress-report-workflow", "/blog/post-award-grant-reporting-checklist", "/assessment"] },
  { id: "content-reporting-calendar", topic: "Reporting calendars / deadlines", workingTitle: "How to build a grant reporting calendar that finance and program teams can use", primaryUserProblem: "Reporting deadlines and dependencies are tracked in separate calendars, inboxes, and spreadsheets.", icp: "Teams managing several active awards", funnelStage: "Solution aware", sourceOfIdea: ["Existing SEO queue content gap", "Direct research theme: reporting timing"], socialSignalCount: 0, searchEvidence: "No material query evidence yet.", existingContentOverlap: "No dedicated reporting-calendar article published.", differentiation: "Connects funder dates to source collection, review owners, and open evidence gaps.", productRelevance: "Useful pre-work for a Free First Award.", commercialIntent: "MEDIUM", evergreenValue: "HIGH", recommendedFormat: "Template-led guide", recommendedAction: "NEW", priorityScore: 84, status: "OPPORTUNITY", relatedUrls: ["/blog/post-award-grant-reporting-checklist", "/assessment"] },
  { id: "content-quickbooks-grants", topic: "QuickBooks + grant reporting", workingTitle: "Grant reporting with QuickBooks: what still has to happen outside QBO", primaryUserProblem: "Accounting data alone does not assemble program updates, evidence, or funder-specific narrative requirements.", icp: "Nonprofit finance teams using QuickBooks", funnelStage: "Solution aware", sourceOfIdea: ["Canonical Social pain taxonomy: QBO grants", "Direct research theme: budget-to-actual"], socialSignalCount: 0, searchEvidence: "No meaningful query evidence yet.", existingContentOverlap: "Budget-to-actual guide overlaps on financial mapping only.", differentiation: "Separates accounting exports from the remaining reporting workflow.", productRelevance: "Grounded explanation of GrantDeskHQ inputs without unsupported product claims.", commercialIntent: "HIGH", evergreenValue: "HIGH", recommendedFormat: "Comparison / workflow guide", recommendedAction: "NEW", priorityScore: 83, status: "OPPORTUNITY", relatedUrls: ["/blog/budget-to-actual-grant-reporting-workflow", "/demo"] },
  { id: "content-spreadsheets-refresh", topic: "Grant reporting software vs spreadsheets", workingTitle: "Grant reporting software vs spreadsheets: when a shared workbook stops being enough", primaryUserProblem: "Manual spreadsheets make multi-source review, evidence tracking, and handoffs hard to audit.", icp: "Teams with repeated post-award reporting", funnelStage: "Solution comparison", sourceOfIdea: ["Canonical Social pain taxonomy: manual reporting and spreadsheets", "Existing article overlap analysis"], socialSignalCount: 1, searchEvidence: "Search Console has page data but no query-level opportunity sufficient for a refresh task.", existingContentOverlap: "Substantially overlaps /blog/post-award-grant-management-software.", differentiation: "Expand the existing primary URL with a concrete spreadsheet decision framework.", productRelevance: "High; supports a self-serve assessment without a demo-first CTA.", commercialIntent: "HIGH", evergreenValue: "HIGH", recommendedFormat: "Expand existing guide", recommendedAction: "EXPAND_EXISTING", priorityScore: 81, status: "REFRESH", relatedUrls: ["/blog/post-award-grant-management-software", "/assessment"] },
  { id: "content-finance-program", topic: "Finance + program reconciliation", workingTitle: "How finance and program teams reconcile a grant report before submission", primaryUserProblem: "Finance and program data often disagree or arrive too late to create a reviewable report.", icp: "Finance, program, and grants teams", funnelStage: "Problem aware", sourceOfIdea: ["Canonical Social pain taxonomy: program/finance reconciliation", "Existing content-gap analysis"], socialSignalCount: 0, searchEvidence: "No query-level claim.", existingContentOverlap: "Related to grant-progress-report-workflow; use the same primary URL unless a distinct workflow proves necessary.", differentiation: "Add a handoff and exception-resolution section.", productRelevance: "Explains source-linked review and open-evidence gaps.", commercialIntent: "MEDIUM", evergreenValue: "HIGH", recommendedFormat: "Expand existing guide", recommendedAction: "EXPAND_EXISTING", priorityScore: 79, status: "REFRESH", relatedUrls: ["/blog/grant-progress-report-workflow", "/sample-report"] },
  { id: "content-multi-grant", topic: "Multi-grant management", workingTitle: "How to manage reporting across multiple grants without losing the evidence trail", primaryUserProblem: "Multiple awards create overlapping deadlines, budgets, and evidence requests.", icp: "Nonprofits with multiple active grants", funnelStage: "Problem aware", sourceOfIdea: ["Canonical Social pain taxonomy: multiple grants", "Direct grant-award research themes"], socialSignalCount: 0, searchEvidence: "No material query evidence yet.", existingContentOverlap: "No dedicated multi-grant operating guide.", differentiation: "Focuses on operating structure and review rather than generic grant finding.", productRelevance: "High post-award fit.", commercialIntent: "HIGH", evergreenValue: "HIGH", recommendedFormat: "Workflow guide", recommendedAction: "NEW", priorityScore: 77, status: "OPPORTUNITY", relatedUrls: ["/blog/post-award-grant-reporting-checklist", "/assessment"] }
];

const evidenceDraft = `# What documents do you need for a funder report?\n\nA funder report is easier to prepare when the team builds an evidence packet as work happens instead of reconstructing it at the deadline. The award agreement and the funder’s instructions remain the controlling source; this is a practical operating checklist, not legal or compliance advice.\n\n## Start with the report requirements\n\nRead the executed award agreement, amendments, approved budget, reporting portal instructions, and any funder templates. List every required financial schedule, narrative answer, outcome measure, certification, and attachment. For each requirement, record the due date, responsible owner, source document, and reviewer.\n\n## Keep financial evidence reviewable\n\nUse the accounting export that covers the reporting period, then map it to the approved budget categories. Preserve the calculation behind each reported number, any allocation method, and any explanation for a material variance. A budget-to-actual table is more useful when the underlying ledger detail can be traced rather than recreated from memory.\n\n## Gather program and supporting evidence\n\nThe program narrative should point to dated records: activity logs, attendance exports, deliverables, case-management summaries, or other evidence appropriate to the award. Keep invoices, payroll support, contracts, correspondence, and approvals with the related financial or narrative claim. If an item is missing, record it as an open evidence gap instead of smoothing over it in the draft.\n\n## Review before submission\n\nConfirm the reporting period, funder-specific definitions, budget restrictions, match requirements, amendment conditions, and certifications against the primary award documents. A person responsible for the award should review the completed report and make the final submission.\n\nGrantDeskHQ helps teams assemble award terms, accounting data, program updates, and supporting evidence into a source-linked first draft for human review. You can try the workflow with one award at https://grantdeskhq.com/assessment.`;
const ownershipDraft = `# Who should own post-award grant reporting?\n\nPost-award grant reporting works best when one person is accountable for the reporting calendar and final review, while finance, program, and grants contributors have explicit evidence responsibilities. The answer is not the same at every nonprofit, but unclear ownership is a predictable cause of late or incomplete reports.\n\n## Name one accountable owner\n\nThe accountable owner keeps the reporting calendar, confirms requirements from the executed agreement, coordinates inputs, and makes sure the right reviewer sees the completed draft. This may be a grants leader, finance leader, controller, or another operating owner depending on the organization’s structure. It should not be inferred only from a job title.\n\n## Separate contribution from approval\n\nFinance should own ledger-backed financial schedules and explanations for budget variances. Program staff should own program updates, outcome data, and supporting records. Grants or compliance staff may coordinate funder instructions, amendments, deadlines, and certifications. Final submission authority should be clear and funder-specific.\n\n## Make gaps visible early\n\nA useful workflow records what is known, what source supports it, and what still requires human follow-up. That prevents a report from becoming an email chase during the final week. It also makes it easier to hand off work when a staff member is unavailable.\n\n## Use technology for preparation, not unreviewed submission\n\nSoftware can reduce repetitive preparation by assembling approved inputs into a source-linked draft and flagging missing evidence. People remain responsible for checking award terms, resolving exceptions, and submitting to the funder.\n\nGrantDeskHQ is designed for that reviewable preparation workflow. Try it with one award at https://grantdeskhq.com/assessment.`;

export function buildInitialContentEngineState(generatedAt = now()): ContentEngineState {
  const drafts: ContentDraft[] = [
    { id: "draft-supporting-evidence", opportunityId: "content-supporting-evidence", title: initialOpportunities[0].workingTitle, slug: "funder-report-supporting-evidence-checklist", metaDescription: "A practical checklist for gathering financial, program, and supporting evidence for a funder report.", canonicalUrl: "https://grantdeskhq.com/blog/funder-report-supporting-evidence-checklist", body: evidenceDraft, internalLinksFrom: ["/blog/post-award-grant-reporting-checklist", "/resources"], internalLinksTo: ["/blog/post-award-grant-reporting-checklist", "/blog/budget-to-actual-grant-reporting-workflow", "/sample-report", "/assessment"], ctaUrl: assessment, status: "READY_FOR_REVIEW", updatedAt: generatedAt },
    { id: "draft-reporting-ownership", opportunityId: "content-reporting-ownership", title: initialOpportunities[1].workingTitle, slug: "who-owns-post-award-grant-reporting", metaDescription: "A practical nonprofit operating model for assigning post-award grant reporting responsibilities.", canonicalUrl: "https://grantdeskhq.com/blog/who-owns-post-award-grant-reporting", body: ownershipDraft, internalLinksFrom: ["/blog/grant-progress-report-workflow", "/resources"], internalLinksTo: ["/blog/grant-progress-report-workflow", "/blog/post-award-grant-reporting-checklist", "/assessment"], ctaUrl: assessment, status: "READY_FOR_REVIEW", updatedAt: generatedAt }
  ];
  const distributionTasks: DistributionTask[] = [
    { id: "distribution-medium-evidence", platform: "MEDIUM", contentId: drafts[0].id, sourceOrCommunity: "Medium manual distribution", targetUrl: null, whyRelevant: "A founder-reviewed adaptation can preserve the GrantDeskHQ article as the original source.", distributionFormat: "Condensed canonical-source adaptation", draftText: "A grant report is easier to prepare when the evidence packet is built before the deadline. This checklist explains how to assign owners for award terms, accounting detail, program updates, and supporting records.", canonicalArticleUrl: drafts[0].canonicalUrl, status: "READY" },
    { id: "distribution-linkedin-evidence", platform: "LINKEDIN", contentId: drafts[0].id, sourceOrCommunity: "Founder manual post", targetUrl: null, whyRelevant: "Educational founder post; no automated publishing.", distributionFormat: "Short practical observation", draftText: "A reporting deadline is a bad time to discover that the evidence lives across five different systems. A useful post-award workflow names the source, owner, reviewer, and open gap for every material report item.", canonicalArticleUrl: drafts[0].canonicalUrl, status: "READY" },
    { id: "distribution-medium-ownership", platform: "MEDIUM", contentId: drafts[1].id, sourceOrCommunity: "Medium manual distribution", targetUrl: null, whyRelevant: "Useful operating-model guidance for nonprofit leaders.", distributionFormat: "Condensed canonical-source adaptation", draftText: "Grant reports become fragile when finance, program, and grants teams assume someone else owns the next step. A clear owner-plus-contributor model makes the evidence trail reviewable before the deadline.", canonicalArticleUrl: drafts[1].canonicalUrl, status: "READY" },
    { id: "distribution-linkedin-ownership", platform: "LINKEDIN", contentId: drafts[1].id, sourceOrCommunity: "Founder manual post", targetUrl: null, whyRelevant: "Educational founder post; a meeting or product claim is not required.", distributionFormat: "Short practical observation", draftText: "Post-award reporting does not need one team to do every task. It does need one accountable owner, clear contributors for finance and program data, and a review process that makes gaps visible early.", canonicalArticleUrl: drafts[1].canonicalUrl, status: "READY" }
  ];
  return { enabled: true, autoPublishEnabled: false, generatedAt, cadence: "Twice weekly through the existing Search Console reconciliation runtime", opportunities: initialOpportunities.map((item) => ({ ...item })), drafts, distributionTasks, sourceSummary: { socialThemes: ["grant reporting", "manual reporting", "spreadsheets", "post-award ownership", "supporting documentation"], directThemes: ["budget-to-actual", "reporting timing", "post-award workflow"], searchConsole: "Existing-page actions remain evidence-gated; limited query data does not block content opportunities.", contentInventory: "Six published articles cover core workflows; gaps are deduped against those primary URLs.", publicResearch: "Bounded public/community themes only; no private prospect details are used." } };
}

export function reconcileContentEngine(existing: ContentEngineState | null, generatedAt = now()): ContentEngineState {
  if (!existing) return buildInitialContentEngineState(generatedAt);
  const starter = buildInitialContentEngineState(generatedAt);
  const merge = <T extends { id: string }>(base: readonly T[], persisted: readonly T[]) => {
    const values = new Map(base.map((item) => [item.id, item]));
    for (const item of persisted) values.set(item.id, item);
    return [...values.values()];
  };
  return { ...starter, generatedAt, opportunities: merge(starter.opportunities, existing.opportunities), drafts: merge(starter.drafts, existing.drafts), distributionTasks: merge(starter.distributionTasks, existing.distributionTasks), sourceSummary: existing.sourceSummary || starter.sourceSummary };
}

/** Adds only a small number of high-fit, non-duplicate NEW-topic drafts when
 * founder-review inventory is below its floor. It never publishes or revives a
 * skipped draft/opportunity. */
export function reconcileContentInventory(existing: ContentEngineState | null, generatedAt = now()) {
  const state = reconcileContentEngine(existing, generatedAt);
  const active = state.drafts.filter((draft) => draft.status === "READY_FOR_REVIEW");
  const decision = inventoryDecision("content", active.length);
  if (active.length >= GTM_INVENTORY_POLICY.content.floor) return { state, decision, generated: 0, supplyConstrained: false, bottleneck: "Founder review inventory is at or above the operating floor." };
  const existingOpportunityIds = new Set(state.drafts.map((draft) => draft.opportunityId));
  const candidates = state.opportunities
    .filter((opportunity) => opportunity.status === "OPPORTUNITY" && opportunity.recommendedAction === "NEW" && !existingOpportunityIds.has(opportunity.id))
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, Math.max(0, Math.min(decision.desired, GTM_INVENTORY_POLICY.content.ceiling - active.length)));
  const drafts = candidates.map((opportunity) => inventoryDraft(opportunity, generatedAt));
  if (!drafts.length) return { state, decision, generated: 0, supplyConstrained: true, bottleneck: "No non-duplicate NEW content opportunity cleared the existing quality and overlap gates." };
  const candidateIds = new Set(candidates.map((item) => item.id));
  return {
    state: { ...state, generatedAt, opportunities: state.opportunities.map((item) => candidateIds.has(item.id) ? { ...item, status: "READY_FOR_REVIEW" as const } : item), drafts: [...state.drafts, ...drafts] },
    decision,
    generated: drafts.length,
    supplyConstrained: active.length + drafts.length < GTM_INVENTORY_POLICY.content.floor,
    bottleneck: active.length + drafts.length < GTM_INVENTORY_POLICY.content.floor ? "The bounded eligible opportunity set was smaller than the review floor." : "High-quality non-duplicate drafts were prepared for founder review."
  };
}

function inventoryDraft(opportunity: ContentOpportunity, updatedAt: string): ContentDraft {
  const slug = opportunity.workingTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 90);
  const body = `# ${opportunity.workingTitle}\n\n${opportunity.primaryUserProblem} The useful starting point is the real award agreement and the records your team already uses—not a generic reporting template.\n\n## Start with the requirement, not last quarter's spreadsheet\n\nWrite down what the funder asked for, the reporting period, who owns each input, and what will support the final number or narrative. That makes the work visible early, while there is still time to fix a gap.\n\n## Build the report from sources people can review\n\nFor a budget line, keep the ledger detail and calculation that explain the number. For a program update, keep the dated export, activity record, or other source that supports it. If something is missing, flag it instead of trying to write around it.\n\nFor example, a report might show $18,750 in contracted services with the related ledger transactions and vendor invoices available for review. The final report still needs a person who knows the award to check the result and submit it.\n\n## Give finance, program, and grants teams a clear handoff\n\nOne person should coordinate the reporting calendar. Finance can confirm the numbers; program staff can confirm outcomes; grants or compliance staff can check the funder's instructions. The goal is a report that is easier to review, not an unreviewed automated submission.\n\n### Try your first award free\n\nGrantDeskHQ brings the award agreement, accounting data, program updates, and supporting evidence together into a source-linked first draft for your team to review. Try the workflow on one real award at no cost.\n\n[Try your first award free](${assessment})`;
  return { id: `draft-${opportunity.id.replace(/^content-/, "")}`, opportunityId: opportunity.id, title: opportunity.workingTitle, slug, metaDescription: opportunity.primaryUserProblem.slice(0, 155), canonicalUrl: `https://grantdeskhq.com/blog/${slug}`, body, internalLinksFrom: ["/resources"], internalLinksTo: [...new Set([...opportunity.relatedUrls, "/assessment"])].slice(0, 5), ctaUrl: assessment, ctaCopy: "Try your first award free", status: "READY_FOR_REVIEW", updatedAt };
}

export function updateContentEngineState(state: ContentEngineState, input: { kind: "opportunity" | "draft" | "distribution"; id: string; status: string }): ContentEngineState {
  const updatedAt = now();
  if (input.kind === "opportunity") {
    const valid: ContentOpportunityStatus[] = ["OPPORTUNITY", "DRAFTING", "READY_FOR_REVIEW", "APPROVED", "PUBLISHED", "SKIPPED", "REFRESH"];
    if (!valid.includes(input.status as ContentOpportunityStatus)) throw new Error("Invalid content opportunity status.");
    if (!state.opportunities.some((item) => item.id === input.id)) throw new Error("Content opportunity was not found.");
    return { ...state, generatedAt: updatedAt, opportunities: state.opportunities.map((item) => item.id === input.id ? { ...item, status: input.status as ContentOpportunityStatus } : item) };
  }
  if (input.kind === "draft") {
    const valid: ContentDraft["status"][] = ["READY_FOR_REVIEW", "APPROVED", "PUBLISHED", "SKIPPED"];
    if (!valid.includes(input.status as ContentDraft["status"])) throw new Error("Invalid content draft status.");
    if (!state.drafts.some((item) => item.id === input.id)) throw new Error("Content draft was not found.");
    if (input.status === "PUBLISHED") throw new Error("Content publication is disabled; founder approval remains required.");
    return { ...state, generatedAt: updatedAt, drafts: state.drafts.map((item) => item.id === input.id ? { ...item, status: input.status as ContentDraft["status"], updatedAt } : item) };
  }
  const valid: DistributionStatus[] = ["READY", "POSTED", "SKIPPED"];
  if (!valid.includes(input.status as DistributionStatus)) throw new Error("Invalid distribution status.");
  if (!state.distributionTasks.some((item) => item.id === input.id)) throw new Error("Distribution task was not found.");
  return { ...state, generatedAt: updatedAt, distributionTasks: state.distributionTasks.map((item) => item.id === input.id ? { ...item, status: input.status as DistributionStatus } : item) };
}

export function editContentDraft(state: ContentEngineState, id: string, input: Partial<Pick<ContentDraft, "title" | "metaDescription" | "body" | "ctaCopy">>): ContentEngineState {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) throw new Error("Content draft was not found.");
  if (draft.status === "PUBLISHED") throw new Error("Published content cannot be edited from the review queue.");
  const title = input.title === undefined ? draft.title : input.title.trim();
  const metaDescription = input.metaDescription === undefined ? draft.metaDescription : input.metaDescription.trim();
  const body = input.body === undefined ? draft.body : input.body.trim();
  const ctaCopy = input.ctaCopy === undefined ? draft.ctaCopy || "Try GrantDeskHQ with one award" : input.ctaCopy.trim();
  if (!title || title.length > 140) throw new Error("Article title must be between 1 and 140 characters.");
  if (!metaDescription || metaDescription.length > 180) throw new Error("Meta description must be between 1 and 180 characters.");
  if (body.length < 300) throw new Error("Article body must remain substantive before review.");
  if (!ctaCopy || ctaCopy.length > 120) throw new Error("CTA copy must be between 1 and 120 characters.");
  const updatedAt = now();
  return { ...state, generatedAt: updatedAt, drafts: state.drafts.map((item) => item.id === id ? { ...item, title, metaDescription, body, ctaCopy, updatedAt } : item) };
}
