// Cloud Run loads this module through Node's TypeScript stripper, which requires
// an explicit source extension for runtime imports.
import { initialOutreachEligibility, type InitialOutreachCandidate, type OutreachRecord } from "./gtmOutreach.ts";

/** Canonical, factual partner-acquisition research pipeline. No delivery integration exists here. */
export const PARTNER_PIPELINE_MODE = "SHADOW" as const;
export const PARTNER_STAGES = ["RESEARCHED", "FIT_REVIEW", "COMMERCIAL_REVIEW_REQUIRED", "PERSON_RESEARCH_OPTIONAL", "SUPPRESSED", "ALREADY_CONTACTED", "READY_FOR_HUMAN_APPROVAL", "ACTIVATED_PARTNER", "CLOSED"] as const;
export type PartnerPipelineStage = typeof PARTNER_STAGES[number];
export type PartnerRelationshipClass = "A" | "B" | "C" | "D";
export type PartnerSuppressionStatus = "NOT_CHECKED" | "CLEAR" | "BLOCKED" | "UNKNOWN";

export interface PartnerResearchRecord {
  id: string; organization: string; officialSourceUrl: string; evidenceSummary: string;
  relationshipClass: PartnerRelationshipClass; classRationale: string; stage: PartnerPipelineStage;
  suppression: PartnerSuppressionStatus; directBusinessEmailEstablished: boolean; humanApprovalReady: boolean;
}

const records = [
  ["bookr", "Bookr", "https://www.bookr.inc/", "Outsourced accounting, payroll, grant fiscal compliance, funder/grant invoicing, and program data management for nonprofits.", "A", "Productivity multiplier; retains accounting judgment and client delivery."],
  ["bpm", "BPM", "https://www.bpm.com/services/accounting/outsourced-accounting/nonprofit/", "Nonprofit outsourced accounting includes contract/grant management, project and fund accounting, and financial reporting.", "A", "Productivity multiplier for repetitive grant/accounting evidence packaging."],
  ["hfco", "hfco", "https://hfco.com/nonprofit-accounting-advisory-services/", "Nonprofit accounting advisory includes grant reporting, expense-allocation review, supporting-document review, and audit preparation.", "A", "Productivity multiplier; professional review remains with the advisor."],
  ["sprchrgr", "SPRCHRGR", "https://sprchrgr.com/who-we-serve/nonprofit", "Nonprofit services include outsourced accounting, fractional CFO, board reporting, grantor trust, and audit readiness.", "B", "Client-enablement fit; validate systems/process-consulting overlap."],
  ["ncheng", "NCheng LLP", "https://www.ncheng.com/non-profit-financial-services/", "Nonprofit financial services include outsourced accounting, fractional CFO, grants/contracts management, reconciliation, and funder reporting.", "A", "Productivity multiplier for grant reconciliation and evidence packaging."],
  ["acclarity", "Acclarity", "https://www.acclaritygroup.com/nonprofit/", "Nonprofit services include outsourced accounting, interim/fractional leadership, grant budgeting, tracking, and reporting.", "A", "Productivity multiplier during finance-leadership gaps."],
  ["anderson", "Anderson & Associates CPA", "https://andersonacpa.com/service/nonprofit-accounting/", "Nonprofit accounting includes outsourced CFO/controller work and grant reporting by restrictions, programs, and reporting periods.", "A", "Productivity multiplier; CPA oversight remains in place."],
  ["fohrman", "Fohrman & Fohrman", "https://fohrman.com/", "Nonprofit accounting services include outsourced CFO, grant management, reporting/allocations, compliance, and audit preparation.", "A", "Productivity multiplier for repeatable post-award assembly."],
  ["eisneramper", "EisnerAmper", "https://www.eisneramper.com/services/outsourcing/industry-operations/not-for-profit/", "Not-for-profit outsourcing includes restricted revenue tracking, grant accounting/compliance, and CFO-level guidance.", "C", "Broad outsourced-finance and technology capabilities need commercial review for overlap."],
  ["vasquez", "Vasquez & Company LLP", "https://resources.vasquez.cpa/wp-content/uploads/2026/03/Finance-and-Accounting-Outsourcing-FAO-Brochure-vMarch-2026.pdf", "Public outsourcing brochure identifies nonprofit coverage and grant management/reporting.", "B", "Client-enablement fit; confirm managed-service overlap."]
] as const;

/** The 2026-08-17 public-source inventory; no record has an email or contact action. */
export const canonicalPartnerResearch: readonly PartnerResearchRecord[] = records.map(([id, organization, officialSourceUrl, evidenceSummary, relationshipClass, classRationale]) => ({
  id: `partner_${id}`, organization, officialSourceUrl, evidenceSummary, relationshipClass, classRationale,
  stage: relationshipClass === "C" ? "COMMERCIAL_REVIEW_REQUIRED" : "RESEARCHED",
  suppression: "NOT_CHECKED", directBusinessEmailEstablished: false, humanApprovalReady: false
}));

export function partnerMayAdvanceToHumanApproval(record: Pick<PartnerResearchRecord, "relationshipClass" | "suppression" | "directBusinessEmailEstablished">) {
  return (record.relationshipClass === "A" || record.relationshipClass === "B") && record.directBusinessEmailEstablished && record.suppression === "CLEAR";
}

/** Fail closed: C/D require commercial review and an absent/unknown suppression check never permits advancement. */
export function nextPartnerStage(record: Pick<PartnerResearchRecord, "relationshipClass" | "suppression" | "directBusinessEmailEstablished">): PartnerPipelineStage {
  if (record.suppression === "BLOCKED") return "SUPPRESSED";
  if (record.relationshipClass === "C" || record.relationshipClass === "D") return "COMMERCIAL_REVIEW_REQUIRED";
  return partnerMayAdvanceToHumanApproval(record) ? "READY_FOR_HUMAN_APPROVAL" : "RESEARCHED";
}

/** A rediscovered contacted firm may be enriched, but cannot become a new first-touch candidate. */
export function partnerStageWithOutreachHistory(record: Pick<PartnerResearchRecord, "relationshipClass" | "suppression" | "directBusinessEmailEstablished">, candidate: InitialOutreachCandidate, outreachHistory: readonly OutreachRecord[]): PartnerPipelineStage {
  const eligibility = initialOutreachEligibility([...outreachHistory], candidate);
  if (eligibility === "SUPPRESSED_DO_NOT_CONTACT") return "SUPPRESSED";
  if (eligibility === "DO_NOT_SEND_NEW_INITIAL_OUTREACH") return "ALREADY_CONTACTED";
  return nextPartnerStage(record);
}

export function summarizePartnerPipeline(partners: readonly PartnerResearchRecord[] = canonicalPartnerResearch) {
  const relationshipClasses = Object.fromEntries((["A", "B", "C", "D"] as const).map((classification) => [classification, 0])) as Record<PartnerRelationshipClass, number>;
  const stages = Object.fromEntries(PARTNER_STAGES.map((stage) => [stage, 0])) as Record<PartnerPipelineStage, number>;
  for (const partner of partners) { relationshipClasses[partner.relationshipClass]++; stages[partner.stage]++; }
  return { mode: PARTNER_PIPELINE_MODE, researchedOrganizations: partners.length, relationshipClasses, stages, directBusinessEmailsEstablished: partners.filter((partner) => partner.directBusinessEmailEstablished).length, suppressionNotChecked: partners.filter((partner) => partner.suppression === "NOT_CHECKED").length, readyForHumanApproval: partners.filter((partner) => partner.humanApprovalReady && partnerMayAdvanceToHumanApproval(partner)).length, outboundActions: 0 };
}
