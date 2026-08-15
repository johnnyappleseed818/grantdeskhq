import { describe, expect, it } from "vitest";
import { ACQUISITION_CHANNEL_HYPOTHESES, WEEKLY_PAYING_CUSTOMER_GOAL, buildAcquisitionLearningSnapshot, outboundActionsAllowed, scorePartnerFit } from "../lib/gtmControlTower";

describe("GTM control tower", () => {
  it("keeps the four-customer goal and allocation explicitly hypothetical", () => {
    expect(WEEKLY_PAYING_CUSTOMER_GOAL).toBe(4);
    expect(ACQUISITION_CHANNEL_HYPOTHESES.reduce((total, channel) => total + channel.share, 0)).toBe(100);
    expect(ACQUISITION_CHANNEL_HYPOTHESES.find((channel) => channel.key === "reddit_community")?.mode).toBe("MANUAL_ONLY");
    expect(ACQUISITION_CHANNEL_HYPOTHESES.find((channel) => channel.key === "linkedin")?.mode).toBe("MANUAL_ONLY");
  });

  it("retains channel attribution through subscription and never enables outbound", () => {
    const snapshot = buildAcquisitionLearningSnapshot([
      { name: "signal_detected", occurredAt: "2026-08-15T00:00:00Z", channel: "recent_grant_signals", attribution: { lead_id: "lead_1", campaign_id: "awards" } },
      { name: "account_created", occurredAt: "2026-08-15T00:01:00Z", channel: "recent_grant_signals", attribution: { lead_id: "lead_1", campaign_id: "awards" } },
      { name: "subscription_started", occurredAt: "2026-08-15T00:02:00Z", channel: "recent_grant_signals", attribution: { lead_id: "lead_1", campaign_id: "awards" } }
    ]);
    expect(snapshot.mode).toBe("SHADOW");
    expect(snapshot.byChannel.recent_grant_signals).toMatchObject({ signals: 1, signups: 1, subscriptions: 1 });
    expect(outboundActionsAllowed()).toBe(false);
  });

  it("scores partner fit transparently", () => {
    expect(scorePartnerFit({ nonprofitFocus: 25, postAwardFit: 20, portfolioAccess: 18, publicEvidence: 22 })).toMatchObject({ total: 85, factors: { postAwardFit: 20 } });
  });
});
