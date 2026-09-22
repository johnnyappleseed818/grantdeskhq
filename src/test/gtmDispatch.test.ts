import { describe, expect, it } from "vitest";
import { advanceDispatchActivationFromProvider, decideControlledDispatch, dispatchActivationMatchesCampaign } from "../../server/gtmDispatch.ts";

const safe = { breakerClosed: true, flagsEnabled: true, campaignActive: true, withinWindow: true, pendingProviderActivity: false, canaryState: "NONE" as const, fingerprintMatches: true, criticalFailure: false, dailyLimit: 5, confirmedToday: 0, outstanding: 0, eligible: 5 };
describe("server-authoritative controlled dispatch", () => {
  it("requires an exact persisted campaign fingerprint before reusing canary proof", () => {
    const activation = { campaignId: "clean-direct", configurationFingerprint: "fingerprint-a" };
    expect(dispatchActivationMatchesCampaign(activation, "clean-direct", "fingerprint-a")).toBe(true);
    expect(dispatchActivationMatchesCampaign(activation, "clean-direct", "fingerprint-b")).toBe(false);
    expect(dispatchActivationMatchesCampaign(activation, "clean-partner", "fingerprint-a")).toBe(false);
    expect(dispatchActivationMatchesCampaign(null, "clean-direct", "fingerprint-a")).toBe(false);
  });

  it("advances an accepted canary only from matching provider membership and confirmed first-send evidence", () => {
    const activation = { campaignId: "clean-partner", providerLeadId: "lead_1", outcome: "ACCEPTED" as const, providerSentAt: "", failureReason: "", stateVersion: 4, updatedAt: "2026-09-22T14:45:00.000Z" };
    const observed = advanceDispatchActivationFromProvider(activation, [{ instantlyCampaignId: "clean-partner", instantlyLeadId: "lead_1", instantlySyncStatus: "SENT", firstSentAt: "2026-09-22T14:46:00.000Z" }], "2026-09-22T14:47:00.000Z");
    expect(observed).toMatchObject({ outcome: "SENT", providerSentAt: "2026-09-22T14:46:00.000Z", failureReason: "", stateVersion: 5, updatedAt: "2026-09-22T14:47:00.000Z" });
  });

  it("rejects mailbox-only, wrong-campaign, wrong-lead, and timestamp-free evidence", () => {
    const activation = { campaignId: "clean-direct", providerLeadId: "lead_direct", outcome: "ACCEPTED" as const, providerSentAt: "", failureReason: "", stateVersion: 2, updatedAt: "2026-09-22T14:45:00.000Z" };
    const inputs = [
      { instantlyCampaignId: "other", instantlyLeadId: "lead_direct", instantlySyncStatus: "SENT", firstSentAt: "2026-09-22T14:46:00.000Z" },
      { instantlyCampaignId: "clean-direct", instantlyLeadId: "other", instantlySyncStatus: "SENT", firstSentAt: "2026-09-22T14:46:00.000Z" },
      { instantlyCampaignId: "clean-direct", instantlyLeadId: "lead_direct", instantlySyncStatus: "SENT", firstSentAt: "" },
      { instantlyCampaignId: "clean-direct", instantlyLeadId: "lead_direct", instantlySyncStatus: "IN_CAMPAIGN", firstSentAt: "2026-09-22T14:46:00.000Z" }
    ];
    for (const record of inputs) expect(advanceDispatchActivationFromProvider(activation, [record], "2026-09-22T14:47:00.000Z")).toBe(activation);
  });

  it("fails a matching canary closed on a terminal provider safety event", () => {
    const activation = { campaignId: "clean-direct", providerLeadId: "lead_direct", outcome: "ACCEPTED" as const, providerSentAt: "", failureReason: "", stateVersion: 2, updatedAt: "2026-09-22T14:45:00.000Z" };
    expect(advanceDispatchActivationFromProvider(activation, [{ instantlyCampaignId: "clean-direct", instantlyLeadId: "lead_direct", instantlySyncStatus: "BOUNCED", firstSentAt: "2026-09-22T14:46:00.000Z" }], "2026-09-22T14:47:00.000Z")).toMatchObject({ outcome: "FAILED", failureReason: "CANARY_BOUNCED", stateVersion: 3 });
  });

  it.each([
    [{ ...safe, breakerClosed: false }, "BREAKER_OPEN"], [{ ...safe, flagsEnabled: false }, "OUTBOUND_FLAGS_DISABLED"], [{ ...safe, campaignActive: false }, "CAMPAIGN_PAUSED"], [{ ...safe, withinWindow: false }, "OUTSIDE_SENDING_WINDOW"], [{ ...safe, criticalFailure: true }, "CRITICAL_SAFETY_FAILURE"], [{ ...safe, pendingProviderActivity: true }, "AWAITING_PROVIDER_TERMINAL_STATE"], [{ ...safe, canaryState: "FAILED" as const }, "CANARY_FAILED"], [{ ...safe, canaryState: "SENT" as const, fingerprintMatches: false }, "CANARY_FINGERPRINT_CHANGED"], [{ ...safe, eligible: 0 }, "NO_ELIGIBLE_RECIPIENT"], [{ ...safe, canaryState: "SENT" as const, confirmedToday: 5 }, "DAILY_CAPACITY_REACHED"]
  ])("fails closed for %s", (input, reason) => expect(decideControlledDispatch(input).reason).toBe(reason));
  it("stages only one canary, waits for accepted activity, and counts only confirmed sends", () => {
    expect(decideControlledDispatch(safe)).toMatchObject({ action: "STAGE_CANARY", count: 1 });
    expect(decideControlledDispatch({ ...safe, canaryState: "ACCEPTED", outstanding: 1 })).toMatchObject({ action: "RECONCILE", count: 0, remaining: 4 });
    expect(decideControlledDispatch({ ...safe, canaryState: "SENT", confirmedToday: 1, eligible: 4 })).toMatchObject({ action: "DISPATCH", count: 4, remaining: 4 });
  });
  it("is deterministic for duplicate and concurrent scheduler invocations", () => {
    expect(decideControlledDispatch(safe)).toEqual(decideControlledDispatch(safe));
    expect(decideControlledDispatch({ ...safe, canaryState: "SENT", outstanding: 4, pendingProviderActivity: true, eligible: 5 })).toMatchObject({ action: "RECONCILE" });
  });
  it("enforces the calculated shared provider capacity across segment schedulers", () => {
    expect(decideControlledDispatch({ ...safe, canaryState: "SENT", confirmedToday: 1, eligible: 5, globalRemaining: 2 })).toMatchObject({ action: "DISPATCH", count: 2, remaining: 2 });
    expect(decideControlledDispatch({ ...safe, canaryState: "SENT", confirmedToday: 1, eligible: 5, globalRemaining: 0 })).toMatchObject({ action: "NOOP", reason: "DAILY_CAPACITY_REACHED", count: 0 });
  });

});
