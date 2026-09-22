export type DispatchSegment = "DIRECT" | "PARTNER";
export type DispatchCanaryState = "NONE" | "ACCEPTED" | "SENT" | "FAILED";
export type DispatchAction = "NOOP" | "RECONCILE" | "STAGE_CANARY" | "DISPATCH";

/** A historical provider send is not a reusable canary unless the durable
 * activation record proves the same campaign configuration. */
export function dispatchActivationMatchesCampaign(activation: { campaignId: string; configurationFingerprint: string } | null | undefined, campaignId: string, configurationFingerprint: string) {
  return Boolean(activation
    && activation.campaignId === campaignId
    && activation.configurationFingerprint === configurationFingerprint);
}

type DispatchActivationEvidence = {
  campaignId: string;
  providerLeadId: string;
  outcome: DispatchCanaryState;
  providerSentAt: string;
  failureReason: string;
  stateVersion: number;
  updatedAt: string;
};

type ProviderCanaryEvidence = {
  instantlyCampaignId: string;
  instantlyLeadId: string;
  instantlySyncStatus: string;
  firstSentAt: string;
};

/** Advance a canary only from the same provider lead in the same mapped
 * campaign. A mailbox timestamp, a different membership, or a warmup email is
 * deliberately insufficient evidence. */
export function advanceDispatchActivationFromProvider<T extends DispatchActivationEvidence>(activation: T | null, records: readonly ProviderCanaryEvidence[], observedAt: string): T | null {
  if (!activation) return null;
  const record = records.find((item) => item.instantlyLeadId === activation.providerLeadId && item.instantlyCampaignId === activation.campaignId);
  if (!record) return activation;
  const next = (outcome: DispatchCanaryState, providerSentAt: string, failureReason: string): T => ({
    ...activation,
    outcome,
    providerSentAt,
    failureReason,
    stateVersion: activation.stateVersion + 1,
    updatedAt: observedAt
  });
  if (["BOUNCED", "UNSUBSCRIBED", "ERROR"].includes(record.instantlySyncStatus)) {
    const reason = record.instantlySyncStatus === "BOUNCED" ? "CANARY_BOUNCED" : record.instantlySyncStatus === "UNSUBSCRIBED" ? "CANARY_UNSUBSCRIBED" : "CANARY_PROVIDER_RECORD_ERROR";
    return activation.outcome === "FAILED" && activation.failureReason === reason ? activation : next("FAILED", activation.providerSentAt, reason);
  }
  // A provider-confirmed first-send timestamp tied to this exact membership is
  // the only positive evidence that can advance an accepted canary.
  if (record.firstSentAt && ["SENT", "REPLIED", "POSITIVE", "NOT_INTERESTED", "SEQUENCE_COMPLETE"].includes(record.instantlySyncStatus)) {
    return activation.outcome === "SENT" && activation.providerSentAt === record.firstSentAt ? activation : next("SENT", record.firstSentAt, "");
  }
  return activation;
}

/** Pure, fail-closed policy for the only autonomous prospect-dispatch boundary.
 * Callers cannot override this decision with scheduler request fields. */
export function decideControlledDispatch(input: {
  breakerClosed: boolean; flagsEnabled: boolean; campaignActive: boolean; withinWindow: boolean;
  pendingProviderActivity: boolean; canaryState: DispatchCanaryState; fingerprintMatches: boolean;
  criticalFailure: boolean; dailyLimit: number; confirmedToday: number; outstanding: number; eligible: number; globalRemaining?: number;
}) {
  const base = { remaining: Math.max(0, Math.min(input.dailyLimit - input.confirmedToday - input.outstanding, input.globalRemaining ?? Number.POSITIVE_INFINITY)) };
  if (!input.breakerClosed) return { action: "NOOP" as const, reason: "BREAKER_OPEN", count: 0, ...base };
  if (!input.flagsEnabled) return { action: "NOOP" as const, reason: "OUTBOUND_FLAGS_DISABLED", count: 0, ...base };
  if (!input.campaignActive) return { action: "NOOP" as const, reason: "CAMPAIGN_PAUSED", count: 0, ...base };
  if (!input.withinWindow) return { action: "NOOP" as const, reason: "OUTSIDE_SENDING_WINDOW", count: 0, ...base };
  if (input.criticalFailure) return { action: "NOOP" as const, reason: "CRITICAL_SAFETY_FAILURE", count: 0, ...base };
  if (input.pendingProviderActivity || input.canaryState === "ACCEPTED") return { action: "RECONCILE" as const, reason: "AWAITING_PROVIDER_TERMINAL_STATE", count: 0, ...base };
  // A stale configuration fingerprint invalidates prior canary proof; it must
  // cause a fresh, single canary rather than permanently blocking an otherwise
  // eligible segment. The old canary is never reused or backfilled.
  if (input.canaryState === "NONE") return { action: input.eligible > 0 && base.remaining > 0 ? "STAGE_CANARY" as const : "NOOP" as const, reason: input.eligible > 0 ? "CANARY_REQUIRED" : "NO_ELIGIBLE_RECIPIENT", count: input.eligible > 0 && base.remaining > 0 ? 1 : 0, ...base };
  if (input.canaryState === "FAILED" || !input.fingerprintMatches) return { action: "NOOP" as const, reason: input.canaryState === "FAILED" ? "CANARY_FAILED" : "CANARY_FINGERPRINT_CHANGED", count: 0, ...base };
  if (base.remaining <= 0 || input.eligible <= 0) return { action: "NOOP" as const, reason: base.remaining <= 0 ? "DAILY_CAPACITY_REACHED" : "NO_ELIGIBLE_RECIPIENT", count: 0, ...base };
  return { action: "DISPATCH" as const, reason: "CANARY_CONFIRMED", count: Math.min(base.remaining, input.eligible), ...base };
}
