import type { EnrichmentUsage } from "./contactEnrichment";
// This value import is also loaded by the Node 22 Cloud Run runtime. Node's
// TypeScript stripper requires the explicit source extension at runtime.
import { directProspectReplenishment, type ControlPlaneLeadState, type ControlPlaneQueueReconciliation } from "./gtmControlPlaneQueue.ts";
import type { ShadowPipelineStatus } from "./gtmShadow";
import { confirmedHumanOutreach, summarizeOutreach } from "./gtmOutreach.ts";
import { canonicalPartnerResearch, summarizePartnerPipeline } from "./partnerPipeline.ts";

export type GtmHealth = "HEALTHY" | "STALE" | "BLOCKED" | "NEEDS_REPLENISHMENT" | "NOT_INSTRUMENTED";
export interface GtmMetric { actual: number | null; target: number | null; gap: number | null; }
export interface GtmOverview {
  generatedAt: string;
  direct: { health: GtmHealth; metrics: Record<string, GtmMetric>; topNextEnrichmentCandidates: string[]; };
  partner: { health: GtmHealth; metrics: Record<string, GtmMetric>; sourceNote: string; lastUpdated: string; source: string; topNextEnrichmentCandidates: string[]; };
  controlPlane: { health: GtmHealth; lastRefresh: string | null; cards: number | null; uniqueOrganizations: number | null; duplicates: number | null; disqualified: number | null; missingOrUnaccounted: number | null; };
  enrichment: { health: GtmHealth; hunterLookups: number | null; hunterLookupLimit: number; hunterVerifications: number | null; apolloLookups: number | null; verifiedEmails: number | null; notFound: number | null; acceptAll: number | null; unknown: number | null; suppressed: number | null; contactNotEstablished: number | null; lastRun: string | null; };
  funnel: Record<string, GtmMetric>;
  outboundEnabled: false;
}
export interface GtmOverviewInput { reconciliation: ControlPlaneQueueReconciliation | null; shadowStatus: ShadowPipelineStatus | null; usage: EnrichmentUsage | null; now?: string; hunterLookupLimit?: number; }
const directTargets = { qualified: 100, contactIdentified: 50, enrichmentReady: 50, emailVerified: 25, humanReview: 25 };
const partnerTargets: Record<string, number> = { researched: 50, highFit: 20, enrichmentReady: 10, humanReview: 5 };
const partnerResearchSnapshot = {
  generatedAt: "2026-08-17T04:46:22.666Z",
  source: "reviewed public-source partner research"
} as const;
const contactStates: ControlPlaneLeadState[] = ["ENRICHMENT_READY", "EMAIL_VERIFICATION_REQUIRED", "SUPPRESSION_CHECK_REQUIRED", "DRAFT_REQUIRED", "READY_FOR_HUMAN_REVIEW", "ALREADY_CONTACTED", "CUSTOMER", "QUALIFIED"];
const emailStates: ControlPlaneLeadState[] = ["SUPPRESSION_CHECK_REQUIRED", "DRAFT_REQUIRED", "READY_FOR_HUMAN_REVIEW", "ALREADY_CONTACTED", "CUSTOMER", "QUALIFIED"];
const clearStates: ControlPlaneLeadState[] = ["DRAFT_REQUIRED", "READY_FOR_HUMAN_REVIEW", "ALREADY_CONTACTED", "CUSTOMER", "QUALIFIED"];
const partners = ["researched", "highFit", "contactIdentified", "enrichmentReady", "emailVerified", "draftReady", "humanReview", "approved", "contacted", "replies", "activeConversations", "activatedPartners", "customersInfluenced", "paidCustomersInfluenced", "arrInfluenced"];
const count = (r: ControlPlaneQueueReconciliation | null, state: ControlPlaneLeadState) => r?.counts[state] || 0;
const sum = (r: ControlPlaneQueueReconciliation | null, states: ControlPlaneLeadState[]) => states.reduce((n, state) => n + count(r, state), 0);
const metric = (actual: number | null, target: number | null = null): GtmMetric => ({ actual, target, gap: actual === null || target === null ? null : Math.max(0, target - actual) });
const stale = (value: string | undefined, now: string) => { const then = Date.parse(value || ""); return !Number.isFinite(then) || Date.parse(now) - then > 36 * 60 * 60 * 1000; };

export function buildGtmOverview({ reconciliation, shadowStatus, usage, now = new Date().toISOString(), hunterLookupLimit = 2 }: GtmOverviewInput): GtmOverview {
  const manualOutreach = summarizeOutreach(confirmedHumanOutreach);
  const partnerResearch = summarizePartnerPipeline(canonicalPartnerResearch);
  const replenishment = reconciliation?.replenishment || (reconciliation ? directProspectReplenishment(reconciliation.uniqueOrganizations, reconciliation.counts) : null);
  const qualified = replenishment?.sourceQualified.actual ?? null;
  const contactIdentified = reconciliation ? sum(reconciliation, contactStates) : null;
  const emailVerified = reconciliation ? sum(reconciliation, emailStates) : null;
  const suppressionClear = reconciliation ? sum(reconciliation, clearStates) : null;
  const humanReview = reconciliation ? count(reconciliation, "READY_FOR_HUMAN_REVIEW") : null;
  const directHealth: GtmHealth = !reconciliation ? "BLOCKED" : replenishment?.needsReplenishment ? "NEEDS_REPLENISHMENT" : stale(reconciliation.generatedAt, now) ? "STALE" : "HEALTHY";
  const controlHealth: GtmHealth = !reconciliation ? "BLOCKED" : stale(reconciliation.generatedAt, now) ? "STALE" : "HEALTHY";
  const partnerActuals: Record<string, number> = {
    researched: partnerResearch.researchedOrganizations,
    highFit: partnerResearch.relationshipClasses.A + partnerResearch.relationshipClasses.B,
    contactIdentified: 0,
    enrichmentReady: 0,
    emailVerified: partnerResearch.directBusinessEmailsEstablished,
    draftReady: 0,
    humanReview: partnerResearch.readyForHumanApproval,
    approved: 0,
    contacted: manualOutreach.partnerUniqueOrganizationsContacted,
    replies: manualOutreach.replied,
    activeConversations: 0,
    activatedPartners: 0,
    customersInfluenced: manualOutreach.customers,
    paidCustomersInfluenced: manualOutreach.customers,
    arrInfluenced: 0
  };
  const partnerMetrics = Object.fromEntries(partners.map((key) => [key, metric(partnerActuals[key] ?? null, partnerTargets[key] || null)]));
  const partnerHealth: GtmHealth = partnerActuals.researched < partnerTargets.researched || partnerActuals.highFit < partnerTargets.highFit || partnerActuals.enrichmentReady < partnerTargets.enrichmentReady ? "NEEDS_REPLENISHMENT" : stale(partnerResearchSnapshot.generatedAt, now) ? "STALE" : "HEALTHY";
  return {
    generatedAt: now,
    direct: { health: directHealth, metrics: { controlPlaneLeads: metric(reconciliation?.cards.length ?? null), uniqueOrganizations: metric(reconciliation?.uniqueOrganizations ?? null), qualified: metric(qualified, directTargets.qualified), contactIdentified: metric(contactIdentified, directTargets.contactIdentified), enrichmentReady: metric(reconciliation ? count(reconciliation, "ENRICHMENT_READY") : null, directTargets.enrichmentReady), emailVerified: metric(emailVerified, directTargets.emailVerified), suppressionClear: metric(suppressionClear), draftReady: metric(humanReview), humanReview: metric(humanReview, directTargets.humanReview), approved: metric(0), sent: metric(Math.max(count(reconciliation, "ALREADY_CONTACTED"), manualOutreach.directUniqueOrganizationsContacted)), replies: metric(manualOutreach.replied), freeFirstAward: metric(manualOutreach.trials), activated: metric(0), paid: metric(Math.max(count(reconciliation, "CUSTOMER"), manualOutreach.customers)) }, topNextEnrichmentCandidates: reconciliation?.cards.filter((card) => card.state === "ENRICHMENT_READY").map((card) => card.organization).slice(0, 10) || [] },
    partner: { health: partnerHealth, metrics: partnerMetrics, sourceNote: "Partner research and human-confirmed outreach are separate sources of truth. The 10 researched firms are not contact-ready; the 10 manually contacted firms remain protected from another initial send.", lastUpdated: partnerResearchSnapshot.generatedAt, source: partnerResearchSnapshot.source, topNextEnrichmentCandidates: canonicalPartnerResearch.filter((partner) => partner.relationshipClass === "A" || partner.relationshipClass === "B").map((partner) => partner.organization).slice(0, 10) },
    controlPlane: { health: controlHealth, lastRefresh: reconciliation?.generatedAt || null, cards: reconciliation?.cards.length ?? null, uniqueOrganizations: reconciliation?.uniqueOrganizations ?? null, duplicates: reconciliation ? count(reconciliation, "DUPLICATE") : null, disqualified: reconciliation ? count(reconciliation, "DISQUALIFIED") : null, missingOrUnaccounted: reconciliation ? 0 : null },
    enrichment: { health: !usage ? "BLOCKED" : stale(usage.updatedAt, now) ? "STALE" : "HEALTHY", hunterLookups: usage?.hunterLookups ?? null, hunterLookupLimit, hunterVerifications: usage?.hunterVerifications ?? null, apolloLookups: usage?.apolloLookups ?? null, verifiedEmails: usage?.emailsVerified ?? null, notFound: usage?.contactsNotFound ?? null, acceptAll: null, unknown: null, suppressed: reconciliation ? count(reconciliation, "DISQUALIFIED") : null, contactNotEstablished: reconciliation ? count(reconciliation, "ENRICHMENT_READY") : null, lastRun: shadowStatus?.generatedAt || usage?.updatedAt || null },
    funnel: { outreachApproved: metric(humanReview), sent: metric(manualOutreach.totalSent), replies: metric(manualOutreach.replied), positiveReplies: metric(confirmedHumanOutreach.filter((record) => record.replySentiment === "POSITIVE").length), freeFirstAwardTrials: metric(manualOutreach.trials), activatedOrganizations: metric(0), paidCustomers: metric(Math.max(count(reconciliation, "CUSTOMER"), manualOutreach.customers)), mrr: metric(null), arr: metric(null) },
    outboundEnabled: false
  };
}
