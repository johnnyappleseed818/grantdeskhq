import { describe, expect, it } from "vitest";
import { recommendAcquisitionChannels, type AcquisitionOutcomeRecord } from "../lib/gtmOptimization";

const baseRecord: Omit<AcquisitionOutcomeRecord, "id" | "outreachId" | "channel" | "outcome" | "status"> = {
  replyText: "A human-reviewed reply", classification: "OTHER", objections: [], suppressionStatus: "CLEAR", humanReview: "COMPLETED", responseAction: "NO_AUTO_RESPONSE", reviewerId: "reviewer_uid", reviewNotes: "Outcome confirmed by reviewer.", createdAt: "2026-08-17T20:00:00.000Z", updatedAt: "2026-08-17T20:00:00.000Z"
};
function outcome(channel: AcquisitionOutcomeRecord["channel"], number: number, result: "WON" | "LOST"): AcquisitionOutcomeRecord {
  const prefix = channel === "DIRECT_NONPROFIT" ? "direct" : "partner";
  return { ...baseRecord, id: `conversion_${prefix}_${number}`, outreachId: `outreach_${prefix}_${number}`, channel, outcome: result, status: result };
}
describe("evidence-bound acquisition recommendations", () => {
  it("emits no recommendation without completed real outcomes in both channels", () => {
    expect(recommendAcquisitionChannels([])).toEqual([]);
    expect(recommendAcquisitionChannels([outcome("DIRECT_NONPROFIT", 1, "WON"), outcome("PARTNER", 1, "LOST")])).toEqual([]);
  });
  it("excludes unreviewed, suppressed, and non-terminal records from its evidence", () => {
    const unreviewed = { ...outcome("DIRECT_NONPROFIT", 1, "WON"), humanReview: "REQUIRED" as const, status: "HUMAN_REVIEW_REQUIRED" as const };
    const suppressed = { ...outcome("PARTNER", 1, "WON"), suppressionStatus: "BLOCKED" as const, status: "SUPPRESSED" as const };
    expect(recommendAcquisitionChannels([unreviewed, suppressed, outcome("DIRECT_NONPROFIT", 2, "WON"), outcome("PARTNER", 2, "LOST")])).toEqual([]);
  });
  it("explains only reviewed outcomes and requires human review without changing scores or messages", () => {
    const records = [outcome("DIRECT_NONPROFIT", 1, "WON"), outcome("DIRECT_NONPROFIT", 2, "WON"), outcome("DIRECT_NONPROFIT", 3, "LOST"), outcome("PARTNER", 1, "LOST"), outcome("PARTNER", 2, "LOST"), outcome("PARTNER", 3, "LOST")];
    const [recommendation] = recommendAcquisitionChannels(records);
    expect(recommendation).toMatchObject({ recommendedChannel: "DIRECT_NONPROFIT", comparisonChannel: "PARTNER", confidence: "low", boundary: "HUMAN_REVIEW_REQUIRED_NO_AUTOMATION" });
    expect(recommendation.evidence[0]).toMatchObject({ reviewedOutcomes: 3, wins: 2, losses: 1, winRate: 2 / 3, outcomeRecordIds: ["conversion_direct_1", "conversion_direct_2", "conversion_direct_3"] });
    expect(recommendation.explanation).toMatch(/2 wins in 3 human-reviewed outcomes \(67%\).*0 in 3 \(0%\)/i);
  });
});
