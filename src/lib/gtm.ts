export type SignalKind = "grant_award" | "job_posting" | "excel_pain" | "competitor_intent";
export type SourceAuthority = "official" | "employer" | "professional" | "community" | "review_platform";
export type OpportunityStage = "new" | "reviewing" | "ready" | "contacted" | "replied" | "converted" | "dismissed";
export type SocialPlatform = "reddit" | "linkedin";

export interface DailySocialSignal {
  id: string;
  platform: SocialPlatform;
  title: string;
  url: string;
  author: string;
  publishedAt: string;
  observedAt: string;
  evidenceSummary: string;
  observedPain: string;
  painThemes: string[];
  whyRelevant: string;
  status: "research_only";
}

export interface DailySocialScan {
  generatedAt: string;
  windowDays: number;
  queryCount: number;
  sourceCount: number;
  coverage: string;
  items: DailySocialSignal[];
  limitations: string[];
}

export interface GtmEvidence {
  id: string;
  title: string;
  url: string;
  observedAt: string;
  authority: SourceAuthority;
  excerpt: string;
  supports: string[];
}

export interface GtmContact {
  name: string;
  title: string;
  email: string;
  emailKind: "direct" | "organization_inbox";
  roleSourceUrl: string;
  emailSourceUrl: string;
  verifiedAt: string;
  note: string;
}

export interface OpportunityScoringInput {
  pain: number;
  timing: number;
  fit: number;
  value: number;
}

export interface GtmOpportunity {
  id: string;
  organization: string;
  organizationUrl?: string;
  signalKind: SignalKind;
  headline: string;
  observedAt: string;
  amount?: number;
  awardStartDate?: string;
  funder?: string;
  location?: string;
  evidence: GtmEvidence[];
  score: OpportunityScoringInput;
  entityVerified: boolean;
  nonprofitVerified: boolean;
  conflicts: string[];
  unknowns: string[];
  recommendedRoles: string[];
  whyNow: string;
  recommendedAngle: string;
  primaryContact?: GtmContact;
  emailSubject: string;
  draftMessage: string;
}

export interface OpportunityAccuracy {
  score: number;
  label: "very_high" | "high" | "medium" | "research_only" | "blocked";
  confidence: "high" | "medium" | "low";
  readyForAction: boolean;
  blockers: string[];
  warnings: string[];
}

const MAX_COMPONENTS: OpportunityScoringInput = { pain: 30, timing: 25, fit: 25, value: 20 };

export function scoreOpportunity(input: OpportunityScoringInput) {
  return (Object.keys(MAX_COMPONENTS) as Array<keyof OpportunityScoringInput>).reduce((total, key) => {
    const value = Number.isFinite(input[key]) ? input[key] : 0;
    return total + Math.max(0, Math.min(MAX_COMPONENTS[key], Math.round(value)));
  }, 0);
}

export function assessOpportunityAccuracy(opportunity: GtmOpportunity, today = "2026-08-06"): OpportunityAccuracy {
  const score = scoreOpportunity(opportunity.score);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const validSources = opportunity.evidence.filter((source) => source.url.startsWith("https://") && source.excerpt.trim());
  const authoritativeSources = validSources.filter((source) => source.authority === "official" || source.authority === "employer");
  const age = daysBetween(opportunity.observedAt, today);

  if (!opportunity.entityVerified) blockers.push("Organization identity has not been resolved.");
  if (!opportunity.nonprofitVerified) blockers.push("Nonprofit status has not been verified.");
  if (!validSources.length) blockers.push("No usable source evidence is attached.");
  if (opportunity.conflicts.length) blockers.push(...opportunity.conflicts.map((conflict) => `Conflicting evidence: ${conflict}`));
  if (!opportunity.primaryContact?.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(opportunity.primaryContact.email)) blockers.push("A named recipient and verified email have not been attached.");
  if (opportunity.primaryContact && (!opportunity.primaryContact.roleSourceUrl.startsWith("https://") || !opportunity.primaryContact.emailSourceUrl.startsWith("https://"))) blockers.push("The recipient role and email require authoritative source links.");
  if (!opportunity.emailSubject?.trim() || !opportunity.draftMessage?.trim()) blockers.push("The outreach subject and draft are incomplete.");
  if (!opportunity.recommendedRoles.length) warnings.push("No supported buyer role has been identified.");
  if (opportunity.unknowns.length) warnings.push(...opportunity.unknowns);
  if (age > 45) warnings.push("Signal is older than 45 days and should be rechecked.");
  if (validSources.length < 2) warnings.push("Only one source supports this opportunity; corroboration is still needed.");
  if (!authoritativeSources.length) warnings.push("No official or employer-controlled source is attached.");

  const readyForAction = blockers.length === 0 && authoritativeSources.length > 0 && age <= 45;
  const confidence: OpportunityAccuracy["confidence"] = blockers.length
    ? "low"
    : authoritativeSources.length > 0 && validSources.length > 1
      ? "high"
      : "medium";

  let label: OpportunityAccuracy["label"] = "research_only";
  if (blockers.length) label = "blocked";
  else if (!readyForAction) label = "research_only";
  else if (score >= 90 && validSources.length >= 2) label = "very_high";
  else if (score >= 75) label = "high";
  else if (score >= 55) label = "medium";

  return { score, label, confidence, readyForAction, blockers, warnings };
}

export function findDuplicateOpportunities(opportunities: GtmOpportunity[]) {
  const seen = new Map<string, string>();
  const duplicates: Array<{ duplicateId: string; originalId: string }> = [];
  for (const opportunity of opportunities) {
    const key = `${normalizeEntity(opportunity.organization)}|${opportunity.signalKind}|${opportunity.observedAt}`;
    const original = seen.get(key);
    if (original) duplicates.push({ duplicateId: opportunity.id, originalId: original });
    else seen.set(key, opportunity.id);
  }
  return duplicates;
}

export function canMoveToContacted(stage: OpportunityStage, accuracy: OpportunityAccuracy) {
  return (stage === "ready" || stage === "contacted" || stage === "replied" || stage === "converted") && accuracy.readyForAction;
}

export function labelForSignal(kind: SignalKind) {
  return ({
    grant_award: "New grant",
    job_posting: "Hiring signal",
    excel_pain: "Manual-work signal",
    competitor_intent: "Competitor signal"
  } as const)[kind];
}

export function formatOpportunityScore(label: OpportunityAccuracy["label"]) {
  return ({
    very_high: "Very high intent",
    high: "High intent",
    medium: "Medium intent",
    research_only: "Research first",
    blocked: "Blocked"
  } as const)[label];
}

function normalizeEntity(value: string) {
  return value.toLowerCase().replace(/\b(inc|incorporated|corp|corporation|foundation|the)\b/g, "").replace(/[^a-z0-9]/g, "");
}

function daysBetween(from: string, to: string) {
  const fromDate = Date.parse(`${from}T00:00:00Z`);
  const toDate = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromDate) || !Number.isFinite(toDate)) return Number.POSITIVE_INFINITY;
  return Math.floor((toDate - fromDate) / 86_400_000);
}
