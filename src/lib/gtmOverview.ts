import { buildGtmScaleModel } from "./gtmScale";
import type { CanonicalGtmModel } from "./gtmCanonical";
import type { EnrichmentUsage } from "./contactEnrichment";
// This value import is also loaded by the Node 22 Cloud Run runtime. Node's
// TypeScript stripper requires the explicit source extension at runtime.
import { directProspectReplenishment, type ControlPlaneLeadState, type ControlPlaneQueueReconciliation } from "./gtmControlPlaneQueue.ts";
import type { ShadowPipelineStatus } from "./gtmShadow";

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
export interface GtmOverviewInput { model?: CanonicalGtmModel | null; reconciliation: ControlPlaneQueueReconciliation | null; shadowStatus: ShadowPipelineStatus | null; usage: EnrichmentUsage | null; now?: string; hunterLookupLimit?: number; }
const directTargets = { qualified: 100, contactIdentified: 50, enrichmentReady: 50, emailVerified: 25, humanReview: 25 };
const partnerTargets: Record<string, number> = { researched: 50, highFit: 20, enrichmentReady: 10, humanReview: 5 };
const partnerPipelineSnapshot = {
  generatedAt: "2026-08-17T04:46:22.666Z",
  source: "public-source partner research snapshot",
  metrics: { researched: 50, highFit: 20, contactIdentified: 10, enrichmentReady: 10, emailVerified: 0, draftReady: 10, humanReview: 0, approved: 0, contacted: 0, replies: 0, activeConversations: 0, activatedPartners: 0, customersInfluenced: 0, paidCustomersInfluenced: 0, arrInfluenced: 0 },
  candidates: ["The Charity CFO", "Kiwi Partners", "Altruic Advisors", "JMT Consulting", "NFO Nonprofit Financial Outsourcing"]
} as const;
const contactStates: ControlPlaneLeadState[] = ["ENRICHMENT_READY", "EMAIL_VERIFICATION_REQUIRED", "SUPPRESSION_CHECK_REQUIRED", "DRAFT_REQUIRED", "READY_FOR_HUMAN_REVIEW", "ALREADY_CONTACTED", "CUSTOMER", "QUALIFIED"];
const emailStates: ControlPlaneLeadState[] = ["SUPPRESSION_CHECK_REQUIRED", "DRAFT_REQUIRED", "READY_FOR_HUMAN_REVIEW", "ALREADY_CONTACTED", "CUSTOMER", "QUALIFIED"];
const clearStates: ControlPlaneLeadState[] = ["DRAFT_REQUIRED", "READY_FOR_HUMAN_REVIEW", "ALREADY_CONTACTED", "CUSTOMER", "QUALIFIED"];
const partners = ["researched", "highFit", "contactIdentified", "enrichmentReady", "emailVerified", "draftReady", "humanReview", "approved", "contacted", "replies", "activeConversations", "activatedPartners", "customersInfluenced", "paidCustomersInfluenced", "arrInfluenced"];
const count = (r: ControlPlaneQueueReconciliation | null, state: ControlPlaneLeadState) => r?.counts[state] || 0;
const sum = (r: ControlPlaneQueueReconciliation | null, states: ControlPlaneLeadState[]) => states.reduce((n, state) => n + count(r, state), 0);
const metric = (actual: number | null, target: number | null = null): GtmMetric => ({ actual, target, gap: actual === null || target === null ? null : Math.max(0, target - actual) });
const stale = (value: string | undefined, now: string) => { const then = Date.parse(value || ""); return !Number.isFinite(then) || Date.parse(now) - then > 36 * 60 * 60 * 1000; };

function buildCanonicalOverview(model: CanonicalGtmModel, usage: EnrichmentUsage | null, now: string, hunterLookupLimit: number): GtmOverview {
  const scale = buildGtmScaleModel(model);
  const segment = (key: "DIRECT" | "PARTNER") => {
    const value = key === "DIRECT" ? scale.direct : scale.partner;
    const records = model.records.filter((record) => record.segment === key);
    const metrics: Record<string, GtmMetric> = { qualified: metric(value.evidenceQualified, value.target.evidenceQualified.target), contactIdentified: metric(value.stages.CONTACT_FOUND), emailVerified: metric(value.verifiedContacts), suppressionClear: metric(records.filter((record) => record.suppressionStatus === "CLEAR" && !record.priorContact).length), ready: metric(value.ready, value.target.ready.target), staged: metric(value.stages.STAGED), scheduled: metric(value.stages.SCHEDULED), sent: metric(value.stages.SENT), replied: metric(value.stages.REPLIED), blocked: metric(records.filter((record) => record.blockers.length > 0).length) };
    const health: GtmHealth = stale(model.generatedAt, now) ? "STALE" : value.ready < (value.readinessFloor ?? value.target.ready.floor) ? "NEEDS_REPLENISHMENT" : "HEALTHY";
    return { health, metrics, topNextEnrichmentCandidates: records.filter((record) => !record.contact || String(record.verificationStatus || "").toUpperCase() !== "VERIFIED").map((record) => record.organization).slice(0, 10) };
  };
  const direct = segment("DIRECT");
  const partner = segment("PARTNER");
  const suppressed = model.records.filter((record) => record.suppressionStatus && record.suppressionStatus !== "CLEAR").length;
  return { generatedAt: model.generatedAt, direct, partner: { ...partner, sourceNote: "Canonical evidence, enrichment, and provider-event records.", lastUpdated: model.generatedAt, source: "server canonical GTM lifecycle" }, controlPlane: { health: stale(model.generatedAt, now) ? "STALE" : "HEALTHY", lastRefresh: model.generatedAt, cards: model.records.length, uniqueOrganizations: new Set(model.records.map((record) => record.organizationId)).size, duplicates: null, disqualified: suppressed, missingOrUnaccounted: 0 }, enrichment: { health: !usage ? "NOT_INSTRUMENTED" : stale(usage.updatedAt, now) ? "STALE" : "HEALTHY", hunterLookups: usage?.hunterLookups ?? null, hunterLookupLimit, hunterVerifications: usage?.hunterVerifications ?? null, apolloLookups: usage?.apolloLookups ?? null, verifiedEmails: scale.direct.verifiedContacts + scale.partner.verifiedContacts, notFound: usage?.contactsNotFound ?? null, acceptAll: null, unknown: null, suppressed, contactNotEstablished: model.records.filter((record) => !record.contact).length, lastRun: usage?.updatedAt || null }, funnel: { providerConfirmedInitialSends: metric(scale.direct.stages.SENT + scale.partner.stages.SENT), replies: metric(scale.direct.stages.REPLIED + scale.partner.stages.REPLIED), positiveReplies: metric(model.metrics.positiveReplies), freeFirstAwardTrials: metric(model.metrics.trials), paidCustomers: metric(model.metrics.paid), mrr: metric(model.metrics.mrr) }, outboundEnabled: false };
}

export function buildGtmOverview({ model = null, reconciliation, shadowStatus, usage, now = new Date().toISOString(), hunterLookupLimit = 2 }: GtmOverviewInput): GtmOverview {
  if (model) return buildCanonicalOverview(model, usage, now, hunterLookupLimit);
  const replenishment = reconciliation?.replenishment || (reconciliation ? directProspectReplenishment(reconciliation.uniqueOrganizations, reconciliation.counts) : null);
  const qualified = replenishment?.sourceQualified.actual ?? null;
  const contactIdentified = reconciliation ? sum(reconciliation, contactStates) : null;
  const emailVerified = reconciliation ? sum(reconciliation, emailStates) : null;
  const suppressionClear = reconciliation ? sum(reconciliation, clearStates) : null;
  const humanReview = reconciliation ? count(reconciliation, "READY_FOR_HUMAN_REVIEW") : null;
  const directHealth: GtmHealth = !reconciliation ? "BLOCKED" : replenishment?.needsReplenishment ? "NEEDS_REPLENISHMENT" : stale(reconciliation.generatedAt, now) ? "STALE" : "HEALTHY";
  const controlHealth: GtmHealth = !reconciliation ? "BLOCKED" : stale(reconciliation.generatedAt, now) ? "STALE" : "HEALTHY";
  const partnerMetrics = Object.fromEntries(partners.map((key) => [key, metric(partnerPipelineSnapshot.metrics[key as keyof typeof partnerPipelineSnapshot.metrics] ?? null, partnerTargets[key] || null)]));
  const partnerHealth: GtmHealth = partnerPipelineSnapshot.metrics.emailVerified === 0 ? "BLOCKED" : partnerPipelineSnapshot.metrics.researched < partnerTargets.researched || partnerPipelineSnapshot.metrics.highFit < partnerTargets.highFit || partnerPipelineSnapshot.metrics.enrichmentReady < partnerTargets.enrichmentReady ? "NEEDS_REPLENISHMENT" : stale(partnerPipelineSnapshot.generatedAt, now) ? "STALE" : "HEALTHY";
  return {
    generatedAt: now,
    direct: { health: directHealth, metrics: { controlPlaneLeads: metric(reconciliation?.cards.length ?? null), uniqueOrganizations: metric(reconciliation?.uniqueOrganizations ?? null), qualified: metric(qualified, directTargets.qualified), contactIdentified: metric(contactIdentified, directTargets.contactIdentified), enrichmentReady: metric(reconciliation ? count(reconciliation, "ENRICHMENT_READY") : null, directTargets.enrichmentReady), emailVerified: metric(emailVerified, directTargets.emailVerified), suppressionClear: metric(suppressionClear), draftReady: metric(humanReview), humanReview: metric(humanReview, directTargets.humanReview), approved: metric(0), sent: metric(count(reconciliation, "ALREADY_CONTACTED")), replies: metric(0), freeFirstAward: metric(0), activated: metric(0), paid: metric(count(reconciliation, "CUSTOMER")) }, topNextEnrichmentCandidates: reconciliation?.cards.filter((card) => card.state === "ENRICHMENT_READY").map((card) => card.organization).slice(0, 10) || [] },
    partner: { health: partnerHealth, metrics: partnerMetrics, sourceNote: "Public-source partner research is surfaced from the reviewed research snapshot. Email verification remains blocked until a provider returns a verified business address and suppression clears; no partner delivery path exists.", lastUpdated: partnerPipelineSnapshot.generatedAt, source: partnerPipelineSnapshot.source, topNextEnrichmentCandidates: [...partnerPipelineSnapshot.candidates] },
    controlPlane: { health: controlHealth, lastRefresh: reconciliation?.generatedAt || null, cards: reconciliation?.cards.length ?? null, uniqueOrganizations: reconciliation?.uniqueOrganizations ?? null, duplicates: reconciliation ? count(reconciliation, "DUPLICATE") : null, disqualified: reconciliation ? count(reconciliation, "DISQUALIFIED") : null, missingOrUnaccounted: reconciliation ? 0 : null },
    enrichment: { health: !usage ? "BLOCKED" : stale(usage.updatedAt, now) ? "STALE" : "HEALTHY", hunterLookups: usage?.hunterLookups ?? null, hunterLookupLimit, hunterVerifications: usage?.hunterVerifications ?? null, apolloLookups: usage?.apolloLookups ?? null, verifiedEmails: usage?.emailsVerified ?? null, notFound: usage?.contactsNotFound ?? null, acceptAll: null, unknown: null, suppressed: reconciliation ? count(reconciliation, "DISQUALIFIED") : null, contactNotEstablished: reconciliation ? count(reconciliation, "ENRICHMENT_READY") : null, lastRun: shadowStatus?.generatedAt || usage?.updatedAt || null },
    funnel: { outreachApproved: metric(humanReview), sent: metric(count(reconciliation, "ALREADY_CONTACTED")), replies: metric(0), positiveReplies: metric(0), freeFirstAwardTrials: metric(0), activatedOrganizations: metric(0), paidCustomers: metric(count(reconciliation, "CUSTOMER")), mrr: metric(0), arr: metric(0) },
    outboundEnabled: false
  };
}
