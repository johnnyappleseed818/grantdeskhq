import { describe, expect, it } from "vitest";
import { decideControlledDispatch } from "../../server/gtmDispatch.ts";

const safe = { breakerClosed: true, flagsEnabled: true, campaignActive: true, withinWindow: true, pendingProviderActivity: false, canaryState: "NONE" as const, fingerprintMatches: true, criticalFailure: false, dailyLimit: 5, confirmedToday: 0, outstanding: 0, eligible: 5 };
describe("server-authoritative controlled dispatch", () => {
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
});
