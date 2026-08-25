import { describe, expect, it } from "vitest";
import { applyOpportunityClusterDecision, buildGtmOpportunityEngineState, experimentRecommendation, founderOpportunityQueue, GTM_EXPERIMENT_EVIDENCE_POLICY, GTM_OPPORTUNITY_SCORING_POLICY, scoreDistributionLeverage, type GtmOutcomeEvent } from "../lib/gtmOpportunityEngine";
import type { AwardDiscoveryScan, DailySocialScan } from "../lib/gtm";
import type { CanonicalGtmModel } from "../lib/gtmCanonical";

const canonical: CanonicalGtmModel = {
  generatedAt: "2026-08-25T12:00:00.000Z",
  records: [{ id: "ready-1", organizationId: "org:example.org", organization: "Example Community Fund", organizationDomain: "example.org", segment: "DIRECT", state: "READY_TO_SEND", qualified: true, contact: "Pat Finance", title: "Finance Director", email: "pat@example.org", verificationStatus: "VERIFIED", suppressionStatus: "CLEAR", priorContact: false, blockers: [], nextAction: "FOUNDER_REVIEW", whyNow: "Recent award", sourceUrl: "https://example.gov/award", partnerType: null, subject: null, draft: null, lastUpdated: "2026-08-25T12:00:00.000Z" }],
  queues: { RESEARCH_BACKLOG: [], NEEDS_VERIFICATION: [], READY_TO_SEND: ["ready-1"], ALREADY_CONTACTED: [], AWAITING_REPLY: [], FOLLOW_UP_DUE: [], REPLIED: [], POSITIVE: [], TRIAL: [], PAID: [] },
  metrics: { directReady: 1, partnerReady: 0, directNeedsVerification: 0, partnerNeedsVerification: 0, followUpsDue: 0, awaitingReply: 0, replies: 0, positiveReplies: 0, trials: 0, paid: 0, mrr: 0 }
};

const awards: AwardDiscoveryScan = {
  generatedAt: "2026-08-25T12:00:00.000Z", source: "https://api.usaspending.gov", scanStatus: "success", lastSuccessfulScanAt: "2026-08-25T12:00:00.000Z", criteria: { startDate: "2026-08-01", endDate: "2026-08-25", minimumAward: 25000, recipientTypes: ["Nonprofit Organization"], awardTypes: ["02"], pageSize: 100, maxPages: 1, maxCandidates: 100 }, recordsChecked: 2, pagesChecked: 1, newAwardCount: 2, duplicateCount: 0, errorCount: 0, coverage: "fixture", limitations: [], opportunities: [
    { id: "award-1", organization: "Example Community Fund", signalKind: "grant_award", headline: "Recent federal grant record detected", observedAt: "2026-08-24T00:00:00.000Z", amount: 500000, funder: "HUD", assistanceListing: "Community Program", fitSignals: ["financial and program reporting inputs"], evidence: [{ id: "e1", title: "USAspending award A", url: "https://usaspending.gov/award/a", observedAt: "2026-08-24T00:00:00.000Z", authority: "official", excerpt: "Award amount: $500,000", supports: ["recipient", "award amount"] }], score: { pain: 18, timing: 25, fit: 23, value: 17 }, entityVerified: true, nonprofitVerified: true, conflicts: [], unknowns: [], recommendedRoles: ["Finance Director"], whyNow: "Recent award", recommendedAngle: "Offer readiness", emailSubject: "Reporting readiness", draftMessage: "Fixture" },
    { id: "award-2", organization: "Second Community Fund", signalKind: "grant_award", headline: "Recent federal grant record detected", observedAt: "2026-08-24T00:00:00.000Z", amount: 300000, funder: "HUD", assistanceListing: "Community Program", fitSignals: ["multi-site"], evidence: [{ id: "e2", title: "USAspending award B", url: "https://usaspending.gov/award/b", observedAt: "2026-08-24T00:00:00.000Z", authority: "official", excerpt: "Award amount: $300,000", supports: ["recipient", "award amount"] }], score: { pain: 18, timing: 25, fit: 23, value: 14 }, entityVerified: true, nonprofitVerified: true, conflicts: [], unknowns: [], recommendedRoles: ["Finance Director"], whyNow: "Recent award", recommendedAngle: "Offer readiness", emailSubject: "Reporting readiness", draftMessage: "Fixture" }
  ]
};

const social: DailySocialScan = { generatedAt: "2026-08-25T12:00:00.000Z", windowDays: 30, queryCount: 4, sourceCount: 1, itemsExamined: 1, itemsQualified: 1, itemsSuppressed: 0, errors: [], coverage: "fixture", limitations: [], items: [{ id: "social-1", platform: "reddit", title: "Grant reports in Excel", url: "https://www.reddit.com/r/nonprofit/comments/a/grant_reports/", author: "unknown", publishedAt: "2026-08-24", observedAt: "2026-08-25T12:00:00.000Z", evidenceSummary: "Manual financial and program reporting workflow.", observedPain: "Grant reporting is manual.", painThemes: ["spreadsheet_bridge"], whyRelevant: "Post-award pain", suggestedResponse: "Helpful response", status: "ACTIONABLE" }] };

describe("GTM opportunity cluster engine", () => {
  it("uses the central 100-point market-event scoring policy", () => {
    expect(Object.values(GTM_OPPORTUNITY_SCORING_POLICY).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it("clusters award recipients by the known program and keeps evidence provenance", () => {
    const state = buildGtmOpportunityEngineState({ awards, direct: null, partners: null, social, canonical, now: "2026-08-25T12:00:00.000Z" });
    const award = state.clusters.find((cluster) => cluster.type === "RECENT_FEDERAL_AWARD");
    expect(award).toMatchObject({ name: "Community Program", accountCount: 2, reachableDecisionMakers: 1 });
    expect(state.signals.find((signal) => signal.id === "signal:award-1")?.evidence[0]).toMatchObject({ confidence: "KNOWN", url: "https://usaspending.gov/award/a" });
  });

  it("keeps community pain separate from contactable accounts", () => {
    const state = buildGtmOpportunityEngineState({ awards: null, direct: null, partners: null, social, canonical, now: "2026-08-25T12:00:00.000Z" });
    const community = state.clusters.find((cluster) => cluster.type === "COMMUNITY_PAIN");
    expect(community?.accountCount).toBe(0);
    expect(community?.commercialRationale).toMatch(/not a contactable account list/i);
  });

  it("does not fabricate a partner client count and caps leverage without it", () => {
    const score = scoreDistributionLeverage({ potentialIcpReach: null, partnerType: "Nonprofit CAS accounting", namedContact: true, sourceCount: 2 });
    expect(score.leverageScore).toBeLessThan(70);
    expect(score.rationale[0]).toMatch(/unknown and is not inferred/i);
  });

  it("persists founder decisions across the next reconciliation and has no campaign execution state", () => {
    const original = buildGtmOpportunityEngineState({ awards, direct: null, partners: null, social: null, canonical, now: "2026-08-25T12:00:00.000Z" });
    const cluster = original.clusters[0];
    const decided = applyOpportunityClusterDecision(original, cluster.id, "SNOOZED");
    const refreshed = buildGtmOpportunityEngineState({ awards, direct: null, partners: null, social: null, canonical, prior: decided, now: "2026-08-26T12:00:00.000Z" });
    expect(refreshed.clusters.find((item) => item.id === cluster.id)?.status).toBe("SNOOZED");
    expect(founderOpportunityQueue(refreshed)).not.toContainEqual(expect.objectContaining({ id: cluster.id }));
    expect(refreshed.safeguards).toEqual({ instantlyAutoHandoff: false, campaignExecution: "FOUNDER_APPROVAL_REQUIRED", uploadedDocumentTargeting: "CONSENT_REQUIRED" });
  });

  it("fails closed when a score lacks a canonical buyer or evidenced distribution route", () => {
    const state = buildGtmOpportunityEngineState({ awards, direct: null, partners: null, social: null, canonical: { ...canonical, records: [] }, now: "2026-08-25T12:00:00.000Z" });
    expect(state.clusters.find((cluster) => cluster.type === "RECENT_FEDERAL_AWARD")?.recommendation).toBe("REVIEW");
  });

  it("deduplicates immutable provider events and attributes known organization outcomes to one experiment", () => {
    const event: GtmOutcomeEvent = { id: "INSTANTLY:provider-1", source: "INSTANTLY", sourceEventId: "provider-1", type: "EMAIL_SENT", occurredAt: "2026-08-25T13:00:00.000Z", organization: "Example Community Fund", canonicalOrganizationId: "org:example.org", instantlyLeadId: "lead-1", evidence: { source: "Instantly provider event", reference: "provider-1", confidence: "KNOWN" } };
    const state = buildGtmOpportunityEngineState({ awards, direct: null, partners: null, social: null, canonical, outcomes: [event, event], now: "2026-08-25T14:00:00.000Z" });
    expect(state.outcomeEvents).toHaveLength(1);
    expect(state.experiments.find((experiment) => experiment.clusterId.includes("community-program"))?.outcomes.delivered).toBe(1);
    expect(state.experiments.find((experiment) => experiment.clusterId.includes("community-program"))?.recommendation).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("requires a meaningful persisted sample before scaling, modifying, or killing", () => {
    expect(experimentRecommendation({ delivered: GTM_EXPERIMENT_EVIDENCE_POLICY.minimumDelivered - 1, replies: 0, positiveReplies: 0, meetings: 0, analyzerActivations: 0, reportsGenerated: 0, paid: 0 }).recommendation).toBe("INSUFFICIENT_EVIDENCE");
    expect(experimentRecommendation({ delivered: 20, replies: 0, positiveReplies: 0, meetings: 0, analyzerActivations: 0, reportsGenerated: 0, paid: 0 }).recommendation).toBe("KILL");
    expect(experimentRecommendation({ delivered: 20, replies: 3, positiveReplies: 3, meetings: 0, analyzerActivations: 0, reportsGenerated: 0, paid: 0 }).recommendation).toBe("SCALE");
  });
});
