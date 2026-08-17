import { describe, expect, it } from "vitest";
import { buildConversionLearningRecord, isConversionLearningRecord } from "../lib/gtmConversion";

describe("human-review-only conversion learning", () => {
  it("persists a deterministic suggestion without authorizing an automatic response", () => {
    const record = buildConversionLearningRecord({
      id: "conversion_reply_20260817",
      outreachId: "outreach_direct_foodlink_20260817",
      replyText: "Your price is outside our budget.",
      suppressionStatus: "CLEAR",
      outcome: "LOST",
      createdAt: "2026-08-17T20:00:00.000Z"
    });
    expect(record).toMatchObject({ classification: "TOO_EXPENSIVE", objections: ["TOO_EXPENSIVE"], humanReview: "REQUIRED", status: "HUMAN_REVIEW_REQUIRED", responseAction: "NO_AUTO_RESPONSE", outcome: "OPEN" });
    expect(isConversionLearningRecord(record)).toBe(true);
  });

  it("keeps an unsubscribe suppressed even if a reviewer accidentally records a win", () => {
    const record = buildConversionLearningRecord({
      id: "conversion_reply_20260818",
      outreachId: "outreach_partner_baas_20260817",
      replyText: "Interested in a demo, but remove me from future messages.",
      suppressionStatus: "CLEAR",
      outcome: "WON",
      reviewerId: "admin_uid",
      createdAt: "2026-08-17T20:00:00.000Z"
    });
    expect(record.status).toBe("SUPPRESSED");
    expect(record.responseAction).toBe("NO_AUTO_RESPONSE");
  });
});
