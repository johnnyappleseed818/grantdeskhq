import { describe, expect, it } from "vitest";
import { buildGtmScaleModel, GTM_INVENTORY_TARGETS, lifecycleStageFor } from "../lib/gtmScale";
import type { CanonicalGtmModel, CanonicalGtmRecord } from "../lib/gtmCanonical";

function record(overrides: Partial<CanonicalGtmRecord> = {}): CanonicalGtmRecord {
  return { id: "one", organizationId: "org:one.org", organization: "One", organizationDomain: "one.org", segment: "DIRECT", state: "READY_TO_SEND", qualified: true, contact: "Sam Finance", title: "Finance Director", email: "sam@one.org", verificationStatus: "VERIFIED", suppressionStatus: "CLEAR", priorContact: false, blockers: [], nextAction: "handoff", whyNow: "Award announcement", sourceUrl: "https://one.org/award", partnerType: null, subject: "Grant reporting", draft: "Hi Sam", instantlyStatus: null, instantlyLeadId: null, instantlyCampaignId: null, lastUpdated: "2026-08-28T00:00:00.000Z", ...overrides };
}

function model(records: CanonicalGtmRecord[]): CanonicalGtmModel { return { generatedAt: "2026-08-28T00:00:00.000Z", records, queues: { RESEARCH_BACKLOG: [], NEEDS_VERIFICATION: [], READY_TO_SEND: [], ALREADY_CONTACTED: [], AWAITING_REPLY: [], FOLLOW_UP_DUE: [], REPLIED: [], POSITIVE: [], TRIAL: [], PAID: [] }, metrics: { directReady: 0, partnerReady: 0, directNeedsVerification: 0, partnerNeedsVerification: 0, followUpsDue: 0, awaitingReply: 0, replies: 0, positiveReplies: 0, trials: 0, paid: 0, mrr: 0 } }; }

describe("GTM scale model", () => {
  it("keeps discovery targets independent from send/canary state", () => {
    const scale = buildGtmScaleModel(model([record({ instantlyStatus: "IN_CAMPAIGN" })]), { directSafeDailyCapacity: 5 });
    expect(scale.direct.target).toEqual(GTM_INVENTORY_TARGETS.DIRECT);
    expect(scale.direct.stages.SCHEDULED).toBe(1);
    expect(scale.direct.evidenceQualified).toBe(1);
    expect(scale.direct.readinessFloor).toBe(75);
  });

  it("does not treat provider enrollment as an actual send", () => {
    expect(lifecycleStageFor(record({ instantlyStatus: "STAGED" }))).toBe("STAGED");
    expect(lifecycleStageFor(record({ instantlyStatus: "IN_CAMPAIGN" }))).toBe("SCHEDULED");
    expect(lifecycleStageFor(record({ instantlyStatus: "SENT", state: "AWAITING_REPLY", priorContact: true, sentAt: "2026-08-28T12:00:00.000Z" }))).toBe("SENT");
  });

  it("uses ten business days of capacity when that exceeds the target floor", () => {
    const scale = buildGtmScaleModel(model([record()]), { directSafeDailyCapacity: 12 });
    expect(scale.direct.readinessFloor).toBe(120);
    expect(scale.direct.readyCoverageBusinessDays).toBe(0);
  });
});
