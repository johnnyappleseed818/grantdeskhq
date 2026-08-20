import type { GtmOpportunity } from "./gtm";
import { initialOutreachEligibility, type OutreachRecord } from "./gtmOutreach";

export const PARTNER_ICP_TYPES = [
  "FRACTIONAL_CFO_ACCOUNTING",
  "GRANT_CONSULTANT",
  "CPA_CAS_ADVISORY",
  "FISCAL_SPONSOR",
  "COMMUNITY_FOUNDATION_FUNDER_INTERMEDIARY",
  "NONPROFIT_ASSOCIATION",
  "ACCOUNTING_IMPLEMENTATION_PARTNER",
  "NONPROFIT_OPERATIONS_COMPLIANCE_CONSULTANT",
  "AUDIT_CPA_REMEDIATION"
] as const;
export type PartnerIcpType = typeof PARTNER_ICP_TYPES[number];

export const NONPROFIT_VERTICALS = ["HUMAN_SERVICES", "WORKFORCE_DEVELOPMENT", "ENVIRONMENT", "FOOD_SECURITY", "COMMUNITY_HEALTH", "HOUSING", "EDUCATION_YOUTH", "ARTS", "RESEARCH", "OTHER"] as const;
export type NonprofitVertical = typeof NONPROFIT_VERTICALS[number];

export const CAMPAIGN_CATEGORIES = ["DIRECT_NONPROFIT", "FRACTIONAL_CFO_ACCOUNTING", "GRANT_CONSULTANT", "CPA_CAS_ADVISORY", "FISCAL_SPONSOR", "ASSOCIATION", "FUNDER_INTERMEDIARY", "IMPLEMENTATION_PARTNER"] as const;
export type CampaignCategory = typeof CAMPAIGN_CATEGORIES[number];

export const FULL_FUNNEL_STAGES = ["SIGNAL", "QUALIFY", "CONTACT_DISCOVERY", "EMAIL_VERIFICATION", "ORGANIZATION_DEDUPE", "EMAIL_DEDUPE", "SUPPRESSION", "PERSONALIZATION", "CAMPAIGN_ROUTING", "INITIAL_EMAIL", "FOLLOW_UP", "REPLY_CLASSIFICATION", "LANDING_PAGE", "SIGNUP", "FREE_FIRST_AWARD_STARTED", "AGREEMENT_UPLOADED", "ACCOUNTING_DATA_UPLOADED", "PROGRAM_DATA_SUPPLIED", "DRAFT_GENERATED", "REPORT_COMPLETED", "PAID", "EXPANSION_REFERRAL"] as const;
export type FullFunnelStage = typeof FULL_FUNNEL_STAGES[number];
export type EmailLane = "COLD_OUTREACH_INSTANTLY" | "TRANSACTIONAL_CUSTOMER";
export type ProductLedConversionStage = "LANDING_PAGE" | "SIGNUP" | "FREE_FIRST_AWARD_STARTED" | "AGREEMENT_UPLOADED" | "ACCOUNTING_DATA_UPLOADED" | "PROGRAM_DATA_SUPPLIED" | "DRAFT_GENERATED" | "REPORT_COMPLETED" | "PAID";

export interface ComplexitySignals {
  activeRecentAwardCount?: number;
  distinctFunderCount?: number;
  federalFunding?: boolean;
  verifiedAwardAmount?: number;
  reportingComplexity?: "LOW" | "MEDIUM" | "HIGH";
  recentGrantActivity?: boolean;
  grantFinanceHiring?: boolean;
  auditFinding?: boolean;
  financeCapacityConstraint?: boolean;
  newFinanceLeader?: boolean;
  renewalApproaching?: boolean;
  closeoutApproaching?: boolean;
  funderSpecificReportingComplexity?: boolean;
  contactability?: "VERIFIED" | "CONFIRMED" | "UNVERIFIED";
}

export interface OpportunityDecision {
  fit: number | null;
  pain: number | null;
  timing: number | null;
  contactability: number | null;
  total: number | null;
  decision: "EMAIL_NOW" | "VERIFY" | "WATCH" | "IGNORE";
  contributingSignals: string[];
  unknownInputs: string[];
}

const labels: Record<keyof ComplexitySignals, string> = {
  activeRecentAwardCount: "multiple active/recent awards", distinctFunderCount: "multiple funders", federalFunding: "federal funding", verifiedAwardAmount: "verified award size", reportingComplexity: "reporting complexity", recentGrantActivity: "recent grant activity", grantFinanceHiring: "grant or finance hiring", auditFinding: "public audit finding", financeCapacityConstraint: "finance capacity constraint", newFinanceLeader: "new finance leadership", renewalApproaching: "renewal approaching", closeoutApproaching: "closeout approaching", funderSpecificReportingComplexity: "funder-specific reporting complexity", contactability: "contactability"
};

/** Scores only supplied, verified inputs. Missing data stays unknown rather than scoring as zero. */
export function scoreGrantComplexity(signals: ComplexitySignals): OpportunityDecision {
  const contributingSignals: string[] = [];
  const unknownInputs: string[] = [];
  const known = <T>(key: keyof ComplexitySignals, value: T | undefined, score: number) => {
    if (value === undefined) { unknownInputs.push(labels[key]); return null; }
    if (value) contributingSignals.push(labels[key]);
    return score;
  };
  const fit = known("activeRecentAwardCount", signals.activeRecentAwardCount, signals.activeRecentAwardCount === undefined ? 0 : Math.min(25, signals.activeRecentAwardCount >= 3 ? 25 : signals.activeRecentAwardCount >= 2 ? 16 : 8));
  const painValues = [
    known("distinctFunderCount", signals.distinctFunderCount, signals.distinctFunderCount === undefined ? 0 : signals.distinctFunderCount >= 3 ? 12 : signals.distinctFunderCount >= 2 ? 8 : 0),
    known("federalFunding", signals.federalFunding, signals.federalFunding ? 8 : 0),
    known("verifiedAwardAmount", signals.verifiedAwardAmount, signals.verifiedAwardAmount === undefined ? 0 : signals.verifiedAwardAmount >= 250000 ? 10 : signals.verifiedAwardAmount >= 50000 ? 5 : 0),
    known("reportingComplexity", signals.reportingComplexity, signals.reportingComplexity === undefined ? 0 : signals.reportingComplexity === "HIGH" ? 20 : signals.reportingComplexity === "MEDIUM" ? 10 : 3),
    known("auditFinding", signals.auditFinding, signals.auditFinding ? 10 : 0),
    known("financeCapacityConstraint", signals.financeCapacityConstraint, signals.financeCapacityConstraint ? 8 : 0),
    known("funderSpecificReportingComplexity", signals.funderSpecificReportingComplexity, signals.funderSpecificReportingComplexity ? 7 : 0)
  ];
  const timingValues = [known("recentGrantActivity", signals.recentGrantActivity, signals.recentGrantActivity ? 12 : 0), known("grantFinanceHiring", signals.grantFinanceHiring, signals.grantFinanceHiring ? 10 : 0), known("renewalApproaching", signals.renewalApproaching, signals.renewalApproaching ? 8 : 0), known("closeoutApproaching", signals.closeoutApproaching, signals.closeoutApproaching ? 8 : 0), known("newFinanceLeader", signals.newFinanceLeader, signals.newFinanceLeader ? 6 : 0)];
  const contactability = known("contactability", signals.contactability, signals.contactability === "VERIFIED" ? 15 : signals.contactability === "CONFIRMED" ? 8 : 0);
  const sumKnown = (values: Array<number | null>) => { const knownValues = values.filter((value): value is number => value !== null); return knownValues.length ? knownValues.reduce((total, value) => total + value, 0) : null; };
  const pain = sumKnown(painValues);
  const timing = sumKnown(timingValues);
  for (const [key, value] of Object.entries(signals) as Array<[keyof ComplexitySignals, ComplexitySignals[keyof ComplexitySignals]]>) if (value !== undefined && (key === "distinctFunderCount" ? Number(value) >= 2 : key === "federalFunding" ? value === true : key === "verifiedAwardAmount" ? Number(value) > 0 : false)) contributingSignals.push(labels[key]);
  const total = fit === null && pain === null && timing === null ? null : (fit || 0) + (pain || 0) + (timing || 0);
  const decision = total === null ? "VERIFY" : total >= 45 ? "EMAIL_NOW" : total >= 20 ? "VERIFY" : total > 0 ? "WATCH" : "IGNORE";
  return { fit, pain, timing, contactability, total, decision, contributingSignals: [...new Set(contributingSignals)], unknownInputs: [...new Set(unknownInputs)] };
}

export interface FullFunnelRecord {
  organizationId: string; campaign: CampaignCategory; emailLane: EmailLane; currentStage: FullFunnelStage; vertical?: NonprofitVertical; partnerType?: PartnerIcpType; source?: string; signalType?: string; attribution?: { campaignId?: string; partnerOrganizationId?: string; referralSource?: string; };
}

/** Cold prospects never share the customer lifecycle lane; current campaign eligibility also preserves canonical dedupe. */
export function canRouteToColdCampaign(record: Pick<FullFunnelRecord, "emailLane" | "currentStage">, opportunity: Pick<GtmOpportunity, "organization" | "primaryContact">, outreach: OutreachRecord[]) {
  if (record.emailLane !== "COLD_OUTREACH_INSTANTLY" || record.currentStage !== "CAMPAIGN_ROUTING") return false;
  return initialOutreachEligibility(outreach, { organization: opportunity.organization, email: opportunity.primaryContact?.email }) === "ELIGIBLE_FOR_INITIAL_OUTREACH";
}

export const PRODUCT_LED_ABANDONMENT_ACTIONS: Record<Exclude<ProductLedConversionStage, "PAID" | "LANDING_PAGE">, string> = {
  SIGNUP: "Offer onboarding help when an authenticated user has not started an award.",
  FREE_FIRST_AWARD_STARTED: "Offer help completing the Free First Award workflow.",
  AGREEMENT_UPLOADED: "Prompt for accounting data only when a real incomplete workflow is recorded.",
  ACCOUNTING_DATA_UPLOADED: "Prompt for program data only when a real incomplete workflow is recorded.",
  PROGRAM_DATA_SUPPLIED: "Prompt for draft generation only when a real incomplete workflow is recorded.",
  DRAFT_GENERATED: "Surface a conversion review only when report generation is recorded and paid status is not.",
  REPORT_COMPLETED: "Offer a relevant upgrade or expansion path only when a completed report is recorded."
};

