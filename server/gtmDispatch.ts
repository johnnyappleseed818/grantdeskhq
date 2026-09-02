export type DispatchSegment = "DIRECT" | "PARTNER";
export type DispatchCanaryState = "NONE" | "ACCEPTED" | "SENT" | "FAILED";
export type DispatchAction = "NOOP" | "RECONCILE" | "STAGE_CANARY" | "DISPATCH";

/** Pure, fail-closed policy for the only autonomous prospect-dispatch boundary.
 * Callers cannot override this decision with scheduler request fields. */
export function decideControlledDispatch(input: {
  breakerClosed: boolean; flagsEnabled: boolean; campaignActive: boolean; withinWindow: boolean;
  pendingProviderActivity: boolean; canaryState: DispatchCanaryState; fingerprintMatches: boolean;
  criticalFailure: boolean; dailyLimit: number; confirmedToday: number; outstanding: number; eligible: number;
}) {
  const base = { remaining: Math.max(0, input.dailyLimit - input.confirmedToday - input.outstanding) };
  if (!input.breakerClosed) return { action: "NOOP" as const, reason: "BREAKER_OPEN", count: 0, ...base };
  if (!input.flagsEnabled) return { action: "NOOP" as const, reason: "OUTBOUND_FLAGS_DISABLED", count: 0, ...base };
  if (!input.campaignActive) return { action: "NOOP" as const, reason: "CAMPAIGN_PAUSED", count: 0, ...base };
  if (!input.withinWindow) return { action: "NOOP" as const, reason: "OUTSIDE_SENDING_WINDOW", count: 0, ...base };
  if (input.criticalFailure) return { action: "NOOP" as const, reason: "CRITICAL_SAFETY_FAILURE", count: 0, ...base };
  if (input.pendingProviderActivity || input.canaryState === "ACCEPTED") return { action: "RECONCILE" as const, reason: "AWAITING_PROVIDER_TERMINAL_STATE", count: 0, ...base };
  if (input.canaryState === "FAILED" || !input.fingerprintMatches) return { action: "NOOP" as const, reason: input.canaryState === "FAILED" ? "CANARY_FAILED" : "CANARY_FINGERPRINT_CHANGED", count: 0, ...base };
  if (input.canaryState === "NONE") return { action: input.eligible > 0 && base.remaining > 0 ? "STAGE_CANARY" as const : "NOOP" as const, reason: input.eligible > 0 ? "CANARY_REQUIRED" : "NO_ELIGIBLE_RECIPIENT", count: input.eligible > 0 && base.remaining > 0 ? 1 : 0, ...base };
  if (base.remaining <= 0 || input.eligible <= 0) return { action: "NOOP" as const, reason: base.remaining <= 0 ? "DAILY_CAPACITY_REACHED" : "NO_ELIGIBLE_RECIPIENT", count: 0, ...base };
  return { action: "DISPATCH" as const, reason: "CANARY_CONFIRMED", count: Math.min(base.remaining, input.eligible), ...base };
}
