import type { AwardDiscoveryScan, DailySocialScan, DirectDiscoveryScan, GtmEvidence, GtmOpportunity } from "./gtm";
import type { CanonicalGtmModel } from "./gtmCanonical";

/**
 * The opportunity engine is deliberately a decision layer, not a second lead
 * database. It groups source-backed market events and proposes a playbook. A
 * founder decision never adds someone to Instantly or sends a message.
 */
export const GTM_OPPORTUNITY_SCORING_POLICY = {
  icpFit: 20,
  urgency: 20,
  reportingComplexity: 15,
  clusterSize: 15,
  buyerResolvability: 10,
  distributionLeverage: 10,
  commercialPotential: 10
} as const;

export type EvidenceConfidence = "KNOWN" | "INFERRED" | "ESTIMATED";
export type MarketSignalType = "RECENT_FEDERAL_AWARD" | "GRANT_FINANCE_HIRING" | "PARTNER_MULTIPLIER" | "COMMUNITY_PAIN";
export type OpportunityClusterStatus = "REVIEW" | "APPROVED" | "SNOOZED" | "REJECTED";
export type OpportunityRecommendation = "ATTACK" | "REVIEW" | "WATCH";
export type ExperimentRecommendation = "INSUFFICIENT_EVIDENCE" | "SCALE" | "MODIFY" | "KILL";
export type GtmOutcomeSource = "INSTANTLY" | "PRODUCT" | "STRIPE";
export type GtmOutcomeType = "EMAIL_SENT" | "REPLY_RECEIVED" | "POSITIVE_REPLY" | "NOT_INTERESTED" | "BOUNCE" | "UNSUBSCRIBE" | "FREE_FIRST_AWARD_STARTED" | "REPORT_GENERATED" | "CHECKOUT_STARTED" | "PAID";
export type GtmPlaybookKey = "NEW_FEDERAL_AWARD" | "GRANT_FINANCE_HIRING" | "CAS_MULTIPLIER" | "COMMUNITY_INSIGHT";

export interface OpportunityEvidence extends Pick<GtmEvidence, "id" | "title" | "url" | "observedAt" | "authority" | "excerpt" | "supports"> {
  confidence: EvidenceConfidence;
}

export interface MarketSignal {
  id: string;
  type: MarketSignalType;
  organization: string | null;
  organizationDomain: string | null;
  observedAt: string;
  sourceDate: string | null;
  funder: string | null;
  fundingProgram: string | null;
  awardAmount: number | null;
  reportingDeadline: string | null;
  reportingCadence: string | null;
  summary: string;
  urgency: number;
  reportingComplexity: number;
  evidence: OpportunityEvidence[];
}

export interface DistributionNode {
  id: string;
  organization: string;
  domain: string | null;
  type: "ACCOUNTING_CAS" | "FRACTIONAL_CFO" | "GRANT_CONSULTANT" | "NONPROFIT_ADVISOR" | "OTHER";
  namedContact: string | null;
  contactTitle: string | null;
  potentialIcpReach: number | null;
  relationshipConfidence: EvidenceConfidence;
  incentivePotential: "HIGH" | "MEDIUM" | "UNKNOWN";
  evidence: OpportunityEvidence[];
  leverageScore: number;
  rationale: string[];
}

export interface OpportunityScore {
  total: number;
  components: Record<keyof typeof GTM_OPPORTUNITY_SCORING_POLICY, number>;
  reasons: string[];
}

export interface GtmPlaybook {
  key: GtmPlaybookKey;
  thesis: string;
  primaryOffer: string;
  primaryCta: "FREE_FIRST_AWARD" | "REPORTING_REQUIREMENT_ANALYZER" | "FOUNDER_REVIEW";
  channels: Array<"DIRECT" | "PARTNER" | "FREE_TOOL" | "CONTENT" | "COMMUNITY">;
  execution: "FOUNDER_APPROVAL_REQUIRED";
}

export interface OpportunityCluster {
  id: string;
  name: string;
  type: MarketSignalType;
  status: OpportunityClusterStatus;
  recommendation: OpportunityRecommendation;
  score: OpportunityScore;
  signalIds: string[];
  accountCount: number;
  reachableDecisionMakers: number;
  distributionPartnerIds: string[];
  commonReasonNow: string;
  commercialRationale: string;
  estimates: {
    likelyAcv: null;
    potentialClusterArr: null;
    confidence: EvidenceConfidence;
    note: string;
  };
  playbook: GtmPlaybook;
  performance: { delivered: number; replies: number; positiveReplies: number; analyzerActivations: number; reportsGenerated: number; paid: number; attributedEventCount: number; };
  updatedAt: string;
}

export interface GtmExperiment {
  id: string;
  clusterId: string;
  hypothesis: string;
  audienceDescription: string;
  status: "PROPOSED" | "APPROVED" | "RUNNING" | "SCALE" | "MODIFY" | "KILL";
  minimumSample: number;
  outcomes: { delivered: number; replies: number; positiveReplies: number; meetings: number; analyzerActivations: number; reportsGenerated: number; paid: number; };
  recommendation: ExperimentRecommendation;
  decision: string | null;
  evidenceCount: number;
}

/** A source-attributed, immutable observation. It is not a guessed outcome;
 * the source event id is also the idempotency key in durable storage. */
export interface GtmOutcomeEvent {
  id: string;
  source: GtmOutcomeSource;
  sourceEventId: string;
  type: GtmOutcomeType;
  occurredAt: string;
  organization: string | null;
  canonicalOrganizationId: string | null;
  instantlyLeadId: string | null;
  evidence: { source: string; reference: string; confidence: "KNOWN"; };
}

export const GTM_EXPERIMENT_EVIDENCE_POLICY = {
  minimumDelivered: 20,
  minimumPositiveRepliesForScale: 3,
  scalePositiveReplyRate: 0.1
} as const;

export interface GtmOpportunityEngineState {
  generatedAt: string;
  signals: MarketSignal[];
  clusters: OpportunityCluster[];
  distributionNodes: DistributionNode[];
  experiments: GtmExperiment[];
  outcomeEvents: GtmOutcomeEvent[];
  radar: { newSignals: number; highIntentAccounts: number; verifiedBuyers: number; highLeveragePartners: number; attackClusters: number; };
  safeguards: { instantlyAutoHandoff: false; campaignExecution: "FOUNDER_APPROVAL_REQUIRED"; uploadedDocumentTargeting: "CONSENT_REQUIRED"; };
}

export interface PartnerDiscoveryLike {
  opportunities: Array<{
    id: string;
    organization: string;
    organizationDomain: string;
    observedAt: string;
    partnerType: string;
    whyFit: string;
    organizationUrl: string;
    sourceUrl: string;
    contact: { fullName: string; title: string; titleSourceUrl: string };
  }>;
}

export interface GtmOpportunityEngineInput {
  awards: AwardDiscoveryScan | null;
  direct: DirectDiscoveryScan | null;
  partners: PartnerDiscoveryLike | null;
  social: DailySocialScan | null;
  canonical: CanonicalGtmModel;
  prior?: GtmOpportunityEngineState | null;
  outcomes?: GtmOutcomeEvent[];
  now?: string;
}

const norm = (value: string | null | undefined) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const unique = <T>(values: T[]) => [...new Set(values)];
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));

function evidenceFrom(source: GtmEvidence, confidence: EvidenceConfidence = "KNOWN"): OpportunityEvidence {
  return { ...source, confidence };
}

function awardSignal(opportunity: GtmOpportunity): MarketSignal {
  const program = opportunity.assistanceListing || null;
  const fit = opportunity.fitSignals || [];
  return {
    id: `signal:${opportunity.id}`,
    type: "RECENT_FEDERAL_AWARD",
    organization: opportunity.organization,
    organizationDomain: null,
    observedAt: opportunity.observedAt,
    sourceDate: opportunity.awardStartDate || opportunity.observedAt,
    funder: opportunity.funder || null,
    fundingProgram: program,
    awardAmount: opportunity.amount || null,
    reportingDeadline: null,
    reportingCadence: null,
    summary: opportunity.headline,
    urgency: opportunity.awardStartDate ? 15 : 12,
    reportingComplexity: clamp(6 + fit.length * 2 + (opportunity.amount && opportunity.amount >= 500_000 ? 2 : 0), 15),
    evidence: opportunity.evidence.map((item) => evidenceFrom(item))
  };
}

function directSignal(opportunity: GtmOpportunity): MarketSignal {
  const hiring = opportunity.signalKind === "job_posting";
  return {
    id: `signal:direct:${opportunity.id}`,
    type: hiring ? "GRANT_FINANCE_HIRING" : "RECENT_FEDERAL_AWARD",
    organization: opportunity.organization,
    organizationDomain: null,
    observedAt: opportunity.observedAt,
    sourceDate: opportunity.observedAt,
    funder: opportunity.funder || null,
    fundingProgram: opportunity.assistanceListing || null,
    awardAmount: opportunity.amount || null,
    reportingDeadline: null,
    reportingCadence: null,
    summary: opportunity.headline,
    urgency: hiring ? 17 : 12,
    reportingComplexity: clamp(5 + (opportunity.fitSignals || []).length * 2, 15),
    evidence: opportunity.evidence.map((item) => evidenceFrom(item))
  };
}

function socialSignals(scan: DailySocialScan | null): MarketSignal[] {
  return (scan?.items || []).filter((item) => item.status === "ACTIONABLE").map((item) => ({
    id: `signal:${item.id}`,
    type: "COMMUNITY_PAIN" as const,
    organization: null,
    organizationDomain: null,
    observedAt: item.observedAt,
    sourceDate: item.publishedAt === "unknown" ? null : item.publishedAt,
    funder: null,
    fundingProgram: item.painThemes.slice().sort().join(", ") || null,
    awardAmount: null,
    reportingDeadline: null,
    reportingCadence: null,
    summary: item.observedPain,
    urgency: 8,
    reportingComplexity: 8,
    evidence: [{ id: item.id, title: item.title, url: item.url, observedAt: item.observedAt, authority: "community", excerpt: item.evidenceSummary, supports: item.painThemes, confidence: "KNOWN" }]
  }));
}

function distributionType(partnerType: string): DistributionNode["type"] {
  const value = partnerType.toLowerCase();
  if (/cas|accounting|controller/.test(value)) return "ACCOUNTING_CAS";
  if (/cfo/.test(value)) return "FRACTIONAL_CFO";
  if (/grant/.test(value)) return "GRANT_CONSULTANT";
  if (/nonprofit|fiscal/.test(value)) return "NONPROFIT_ADVISOR";
  return "OTHER";
}

export function scoreDistributionLeverage(input: { potentialIcpReach: number | null; partnerType: string; namedContact: boolean; sourceCount: number; }): Pick<DistributionNode, "leverageScore" | "rationale"> {
  const reach = input.potentialIcpReach === null ? 0 : clamp(input.potentialIcpReach * 2, 50);
  const partnerFit = /accounting|cas|cfo|grant|fiscal|nonprofit/.test(input.partnerType.toLowerCase()) ? 25 : 10;
  const relationshipConfidence = clamp(input.sourceCount * 8 + (input.namedContact ? 10 : 0), 25);
  const incentivePotential = /accounting|cas|cfo|grant/.test(input.partnerType.toLowerCase()) ? 15 : 8;
  const rationale = [
    input.potentialIcpReach === null ? "Potential nonprofit-client reach is unknown and is not inferred." : `${input.potentialIcpReach} publicly evidenced ICP relationship${input.potentialIcpReach === 1 ? "" : "s"}.`,
    `Partner fit reflects the public ${input.partnerType} service evidence.`,
    input.namedContact ? "A named decision maker is publicly evidenced." : "A named decision maker still needs resolution."
  ];
  return { leverageScore: clamp(reach + partnerFit + relationshipConfidence + incentivePotential, 100), rationale };
}

function distributionNodes(partners: PartnerDiscoveryLike | null): DistributionNode[] {
  return (partners?.opportunities || []).map((partner) => {
    const evidence = [
      { id: `${partner.id}:firm`, title: partner.organization, url: partner.sourceUrl, observedAt: partner.observedAt, authority: "professional" as const, excerpt: partner.whyFit, supports: ["partner service fit"], confidence: "KNOWN" as const },
      { id: `${partner.id}:contact`, title: `${partner.contact.fullName} · ${partner.contact.title}`, url: partner.contact.titleSourceUrl, observedAt: partner.observedAt, authority: "professional" as const, excerpt: `${partner.contact.fullName} is publicly listed as ${partner.contact.title}.`, supports: ["named decision maker"], confidence: "KNOWN" as const }
    ];
    const score = scoreDistributionLeverage({ potentialIcpReach: null, partnerType: partner.partnerType, namedContact: Boolean(partner.contact.fullName), sourceCount: evidence.length });
    return {
      id: `distribution:${partner.id}`,
      organization: partner.organization,
      domain: partner.organizationDomain || null,
      type: distributionType(partner.partnerType),
      namedContact: partner.contact.fullName || null,
      contactTitle: partner.contact.title || null,
      potentialIcpReach: null,
      relationshipConfidence: "KNOWN",
      incentivePotential: /accounting|cas|cfo|grant/.test(partner.partnerType.toLowerCase()) ? "HIGH" : "MEDIUM",
      evidence,
      ...score
    };
  });
}

function clusterKey(signal: MarketSignal): string {
  if (signal.type === "RECENT_FEDERAL_AWARD") return `award:${norm(signal.fundingProgram || signal.funder || signal.organization)}`;
  if (signal.type === "GRANT_FINANCE_HIRING") return `hiring:${norm(signal.organization)}`;
  if (signal.type === "COMMUNITY_PAIN") return `community:${norm(signal.fundingProgram || signal.summary).slice(0, 80)}`;
  return `signal:${norm(signal.organization || signal.id)}`;
}

function playbookFor(type: MarketSignalType): GtmPlaybook {
  if (type === "RECENT_FEDERAL_AWARD") return { key: "NEW_FEDERAL_AWARD", thesis: "Recent award recipients may be translating award terms into financial, program, and evidence reporting work.", primaryOffer: "Reporting requirements analysis or Free First Award", primaryCta: "REPORTING_REQUIREMENT_ANALYZER", channels: ["DIRECT", "PARTNER", "FREE_TOOL", "CONTENT"], execution: "FOUNDER_APPROVAL_REQUIRED" };
  if (type === "GRANT_FINANCE_HIRING") return { key: "GRANT_FINANCE_HIRING", thesis: "A grant/finance hire can signal reporting workload, but it does not prove a buying problem.", primaryOffer: "Free First Award", primaryCta: "FREE_FIRST_AWARD", channels: ["DIRECT", "CONTENT"], execution: "FOUNDER_APPROVAL_REQUIRED" };
  if (type === "PARTNER_MULTIPLIER") return { key: "CAS_MULTIPLIER", thesis: "A nonprofit finance intermediary may serve several eligible organizations and can be evaluated as a distribution route.", primaryOffer: "Partner review", primaryCta: "FOUNDER_REVIEW", channels: ["PARTNER", "FREE_TOOL"], execution: "FOUNDER_APPROVAL_REQUIRED" };
  return { key: "COMMUNITY_INSIGHT", thesis: "Repeated public workflow pain can guide content and free-tool positioning without becoming an outreach target.", primaryOffer: "Practical content or Reporting Requirements Analyzer", primaryCta: "REPORTING_REQUIREMENT_ANALYZER", channels: ["CONTENT", "COMMUNITY", "FREE_TOOL"], execution: "FOUNDER_APPROVAL_REQUIRED" };
}

function scoreCluster(type: MarketSignalType, signals: MarketSignal[], partners: DistributionNode[], canonical: CanonicalGtmModel): OpportunityScore {
  const accounts = unique(signals.flatMap((signal) => signal.organization ? [signal.organization] : [])).length;
  const evidenceCount = signals.reduce((sum, signal) => sum + signal.evidence.length, 0);
  const components = {
    icpFit: clamp(type === "PARTNER_MULTIPLIER" ? 17 : type === "COMMUNITY_PAIN" ? 13 : 16 + Math.min(accounts, 4), 20),
    urgency: clamp(Math.max(...signals.map((signal) => signal.urgency), 0), 20),
    reportingComplexity: clamp(Math.round(signals.reduce((sum, signal) => sum + signal.reportingComplexity, 0) / Math.max(1, signals.length)), 15),
    clusterSize: clamp(accounts * 3 + (signals.length > 1 ? 4 : 0), 15),
    buyerResolvability: clamp(canonical.records.filter((record) => record.state === "READY_TO_SEND" && signals.some((signal) => norm(signal.organization) === norm(record.organization))).length * 3, 10),
    distributionLeverage: clamp(Math.max(0, ...partners.map((partner) => Math.round(partner.leverageScore / 10))), 10),
    commercialPotential: clamp((accounts ? 4 : 1) + Math.min(4, evidenceCount) + (type === "PARTNER_MULTIPLIER" ? 2 : 0), 10)
  };
  const total = Object.values(components).reduce((sum, value) => sum + value, 0);
  return {
    total,
    components,
    reasons: [
      `${accounts} account${accounts === 1 ? "" : "s"} attached to source-backed signals.`,
      `${evidenceCount} public evidence item${evidenceCount === 1 ? "" : "s"} retained in the evidence drawer.`,
      components.buyerResolvability ? `${components.buyerResolvability}/10 buyer resolvability comes from canonical Ready records only.` : "No verified buyer is inferred from a market signal."
    ]
  };
}

function preserveStatus(id: string, prior: GtmOpportunityEngineState | null | undefined) {
  return prior?.clusters.find((cluster) => cluster.id === id)?.status || "REVIEW" as OpportunityClusterStatus;
}

const emptyPerformance = () => ({ delivered: 0, replies: 0, positiveReplies: 0, analyzerActivations: 0, reportsGenerated: 0, paid: 0, attributedEventCount: 0 });

function recommendationForCluster(score: OpportunityScore, reachableDecisionMakers: number, partners: DistributionNode[]): OpportunityRecommendation {
  // A high numerical score alone is not permission to attack a market. There
  // must be a canonical buyer route or an evidenced distribution relationship.
  const evidencedDistributionRoute = partners.some((partner) => (partner.potentialIcpReach || 0) >= 5 && partner.leverageScore >= 70);
  if (score.total >= 70 && (reachableDecisionMakers > 0 || evidencedDistributionRoute)) return "ATTACK";
  return score.total >= 45 ? "REVIEW" : "WATCH";
}

function clusterOrganizationNames(cluster: OpportunityCluster, signals: MarketSignal[]) {
  return new Set(cluster.signalIds.flatMap((id) => {
    const organization = signals.find((signal) => signal.id === id)?.organization;
    return organization ? [norm(organization)] : [];
  }));
}

function outcomeMatchesCluster(event: GtmOutcomeEvent, cluster: OpportunityCluster, signals: MarketSignal[]) {
  if (!event.organization) return false;
  return clusterOrganizationNames(cluster, signals).has(norm(event.organization));
}

function aggregatePerformance(events: GtmOutcomeEvent[]) {
  const performance = emptyPerformance();
  for (const event of events) {
    performance.attributedEventCount += 1;
    if (event.type === "EMAIL_SENT") performance.delivered += 1;
    if (event.type === "REPLY_RECEIVED" || event.type === "POSITIVE_REPLY") performance.replies += 1;
    if (event.type === "POSITIVE_REPLY") performance.positiveReplies += 1;
    if (event.type === "FREE_FIRST_AWARD_STARTED") performance.analyzerActivations += 1;
    if (event.type === "REPORT_GENERATED") performance.reportsGenerated += 1;
    if (event.type === "PAID") performance.paid += 1;
  }
  return performance;
}

export function experimentRecommendation(outcomes: GtmExperiment["outcomes"]): { recommendation: ExperimentRecommendation; decision: string | null } {
  if (outcomes.delivered < GTM_EXPERIMENT_EVIDENCE_POLICY.minimumDelivered) {
    return { recommendation: "INSUFFICIENT_EVIDENCE", decision: `Need ${GTM_EXPERIMENT_EVIDENCE_POLICY.minimumDelivered - outcomes.delivered} more delivered first touches before a scale, modify, or kill recommendation.` };
  }
  const positiveRate = outcomes.positiveReplies / Math.max(1, outcomes.delivered);
  if (outcomes.positiveReplies >= GTM_EXPERIMENT_EVIDENCE_POLICY.minimumPositiveRepliesForScale && positiveRate >= GTM_EXPERIMENT_EVIDENCE_POLICY.scalePositiveReplyRate) {
    return { recommendation: "SCALE", decision: `Persisted evidence meets the configured ${Math.round(GTM_EXPERIMENT_EVIDENCE_POLICY.scalePositiveReplyRate * 100)}% positive-reply threshold with ${outcomes.positiveReplies} positive replies.` };
  }
  if (outcomes.positiveReplies === 0 && outcomes.analyzerActivations === 0 && outcomes.paid === 0) {
    return { recommendation: "KILL", decision: "Persisted delivered sample produced no positive reply, product activation, or paid outcome." };
  }
  return { recommendation: "MODIFY", decision: "Persisted sample is meaningful but does not meet the scale threshold; revise the playbook before expanding it." };
}

function clusterSignals(signals: MarketSignal[], distribution: DistributionNode[], canonical: CanonicalGtmModel, prior: GtmOpportunityEngineState | null | undefined, now: string): OpportunityCluster[] {
  const groups = new Map<string, MarketSignal[]>();
  for (const signal of signals) {
    const key = clusterKey(signal);
    groups.set(key, [...(groups.get(key) || []), signal]);
  }
  const marketClusters = [...groups.entries()].map(([key, items]) => {
    const primary = items[0];
    const accounts = unique(items.flatMap((item) => item.organization ? [item.organization] : []));
    const related = primary.type === "RECENT_FEDERAL_AWARD" ? distribution.filter((node) => /ACCOUNTING_CAS|FRACTIONAL_CFO|GRANT_CONSULTANT/.test(node.type)) : [];
    const score = scoreCluster(primary.type, items, related, canonical);
    const reachableDecisionMakers = canonical.records.filter((record) => record.state === "READY_TO_SEND" && accounts.some((account) => norm(account) === norm(record.organization))).length;
    const recommendation = recommendationForCluster(score, reachableDecisionMakers, related);
    const name = primary.type === "RECENT_FEDERAL_AWARD"
      ? (primary.fundingProgram || primary.funder || "Recent federal award recipients")
      : primary.type === "GRANT_FINANCE_HIRING" ? `${primary.organization || "Grant/finance"} hiring signal`
      : `Community pain: ${primary.fundingProgram || "post-award reporting"}`;
    const id = `cluster:${key}`;
    return {
      id,
      name,
      type: primary.type,
      status: preserveStatus(id, prior),
      recommendation,
      score,
      signalIds: items.map((item) => item.id),
      accountCount: accounts.length,
      reachableDecisionMakers,
      distributionPartnerIds: related.map((node) => node.id),
      commonReasonNow: primary.type === "COMMUNITY_PAIN" ? "Public discussions describe a current post-award workflow issue." : primary.summary,
      commercialRationale: primary.type === "RECENT_FEDERAL_AWARD" ? "A recent award is a time-bounded reason to evaluate reporting-readiness support; buyer need remains a hypothesis." : primary.type === "GRANT_FINANCE_HIRING" ? "Hiring is a researched workload signal, not evidence of a purchase decision." : "Public pain improves positioning and free-tool relevance; it is not a contactable account list.",
      estimates: { likelyAcv: null, potentialClusterArr: null, confidence: "ESTIMATED" as const, note: "ACV and ARR remain unknown until actual pricing, conversion, and account data exist." },
      playbook: playbookFor(primary.type),
      performance: emptyPerformance(),
      updatedAt: now
    };
  });
  const partnerClusters = distribution.map((node) => {
    const id = `cluster:partner:${norm(node.organization)}`;
    const signal: MarketSignal = { id: `signal:${node.id}`, type: "PARTNER_MULTIPLIER", organization: node.organization, organizationDomain: node.domain, observedAt: now, sourceDate: now.slice(0, 10), funder: null, fundingProgram: null, awardAmount: null, reportingDeadline: null, reportingCadence: null, summary: node.rationale[1], urgency: 12, reportingComplexity: 10, evidence: node.evidence };
    const score = scoreCluster("PARTNER_MULTIPLIER", [signal], [node], canonical);
    return {
      id,
      name: `${node.organization} — partner multiplier`,
      type: "PARTNER_MULTIPLIER" as const,
      status: preserveStatus(id, prior),
      recommendation: node.leverageScore >= 70 ? "ATTACK" as const : "REVIEW" as const,
      score,
      signalIds: [signal.id],
      accountCount: node.potentialIcpReach || 0,
      reachableDecisionMakers: node.namedContact ? 1 : 0,
      distributionPartnerIds: [node.id],
      commonReasonNow: node.rationale[1],
      commercialRationale: node.potentialIcpReach === null ? "Public service evidence supports a partner review; client reach is unknown and is not inferred." : `${node.potentialIcpReach} relationship${node.potentialIcpReach === 1 ? "" : "s"} are publicly evidenced.`,
      estimates: { likelyAcv: null, potentialClusterArr: null, confidence: "ESTIMATED" as const, note: "Partner economics remain a configurable hypothesis, not a commitment or revenue forecast." },
      playbook: playbookFor("PARTNER_MULTIPLIER"),
      performance: emptyPerformance(),
      updatedAt: now
    };
  });
  return [...marketClusters, ...partnerClusters].sort((left, right) => right.score.total - left.score.total || left.name.localeCompare(right.name));
}

export function buildGtmOpportunityEngineState(input: GtmOpportunityEngineInput): GtmOpportunityEngineState {
  const now = input.now || new Date().toISOString();
  const awardBySource = new Set<string>();
  const awardSignals = (input.awards?.opportunities || []).map(awardSignal).filter((signal) => {
    const key = `${norm(signal.organization)}:${signal.evidence[0]?.url || signal.id}`;
    if (awardBySource.has(key)) return false;
    awardBySource.add(key);
    return true;
  });
  const directSignals = (input.direct?.opportunities || []).map(directSignal).filter((signal) => {
    const key = `${norm(signal.organization)}:${signal.evidence[0]?.url || signal.id}`;
    if (awardBySource.has(key)) return false;
    awardBySource.add(key);
    return true;
  });
  const nodes = distributionNodes(input.partners);
  const signals = [...awardSignals, ...directSignals, ...socialSignals(input.social)];
  const rawOutcomes = input.outcomes || input.prior?.outcomeEvents || [];
  const outcomeEvents = [...new Map(rawOutcomes.map((event) => [event.id, event])).values()]
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)).slice(-500);
  const initialClusters = clusterSignals(signals, nodes, input.canonical, input.prior, now);
  const clusters = initialClusters.map((cluster) => ({
    ...cluster,
    performance: aggregatePerformance(outcomeEvents.filter((event) => outcomeMatchesCluster(event, cluster, signals)))
  }));
  const experiments = clusters.filter((cluster) => cluster.type !== "COMMUNITY_PAIN" && cluster.score.total >= 45).slice(0, 50).map((cluster) => {
    const priorExperiment = input.prior?.experiments.find((item) => item.clusterId === cluster.id);
    const performance = cluster.performance;
    const outcomes = { delivered: performance.delivered, replies: performance.replies, positiveReplies: performance.positiveReplies, meetings: 0, analyzerActivations: performance.analyzerActivations, reportsGenerated: performance.reportsGenerated, paid: performance.paid };
    const evidenceDecision = experimentRecommendation(outcomes);
    return {
    id: `experiment:${cluster.id}`,
    clusterId: cluster.id,
    hypothesis: cluster.playbook.thesis,
    audienceDescription: `${cluster.accountCount} source-backed account${cluster.accountCount === 1 ? "" : "s"}; ${cluster.reachableDecisionMakers} canonical Ready buyer${cluster.reachableDecisionMakers === 1 ? "" : "s"}.`,
    status: priorExperiment?.status || "PROPOSED" as const,
    minimumSample: GTM_EXPERIMENT_EVIDENCE_POLICY.minimumDelivered,
    outcomes,
    recommendation: evidenceDecision.recommendation,
    decision: evidenceDecision.decision,
    evidenceCount: performance.attributedEventCount
    };
  });
  return {
    generatedAt: now,
    signals,
    clusters,
    distributionNodes: nodes,
    experiments,
    outcomeEvents,
    radar: {
      newSignals: signals.length,
      highIntentAccounts: unique(signals.flatMap((signal) => signal.organization ? [signal.organization] : [])).length,
      verifiedBuyers: input.canonical.records.filter((record) => record.state === "READY_TO_SEND").length,
      highLeveragePartners: nodes.filter((node) => node.leverageScore >= 70).length,
      attackClusters: clusters.filter((cluster) => cluster.recommendation === "ATTACK").length
    },
    safeguards: { instantlyAutoHandoff: false, campaignExecution: "FOUNDER_APPROVAL_REQUIRED", uploadedDocumentTargeting: "CONSENT_REQUIRED" }
  };
}

export function applyOpportunityClusterDecision(state: GtmOpportunityEngineState, clusterId: string, status: OpportunityClusterStatus): GtmOpportunityEngineState {
  if (!state.clusters.some((cluster) => cluster.id === clusterId)) throw new Error("Opportunity cluster was not found.");
  return { ...state, clusters: state.clusters.map((cluster) => cluster.id === clusterId ? { ...cluster, status, updatedAt: new Date().toISOString() } : cluster) };
}

export function founderOpportunityQueue(state: GtmOpportunityEngineState, maximum = 10) {
  return state.clusters.filter((cluster) => cluster.status !== "REJECTED" && cluster.status !== "SNOOZED").sort((left, right) => right.score.total - left.score.total || left.name.localeCompare(right.name)).slice(0, Math.max(1, Math.min(10, maximum)));
}
