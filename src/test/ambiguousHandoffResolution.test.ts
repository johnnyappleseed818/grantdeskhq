import { describe, expect, it } from "vitest";
import { ambiguousProviderOutcomePrerequisites, selectAmbiguousProviderOutcomeReservations } from "../../server/ambiguousHandoffResolution.ts";

const failed = {
  idempotencyKey: "direct:recipient:initial-v1",
  normalizedEmail: "finance@example.org",
  campaignId: "clean-direct",
  handoffStatus: "FAILED" as const,
  externalLeadId: "",
  handedOffAt: "",
  source: "https://example.org/award",
  providerCampaignId: "clean-direct",
  providerMessageId: "",
  handoffStartedAt: "2026-09-02T13:00:00.000Z",
  leaseOwner: "worker",
  leaseExpiry: "2026-09-02T13:10:00.000Z",
  lastError: "provider timeout",
  attemptCount: 1
};

describe("ambiguous provider outcome resolution", () => {
  it("selects only one lead-less failed reservation and fails closed for none or many", () => {
    expect(selectAmbiguousProviderOutcomeReservations([failed])).toMatchObject({ resolvable: true, reason: "EXACTLY_ONE_UNRESOLVED_RESERVATION" });
    expect(selectAmbiguousProviderOutcomeReservations([])).toMatchObject({ resolvable: false, reason: "NO_UNRESOLVED_RESERVATION" });
    expect(selectAmbiguousProviderOutcomeReservations([failed, { ...failed, normalizedEmail: "other@example.org" }])).toMatchObject({ resolvable: false, reason: "MULTIPLE_UNRESOLVED_RESERVATIONS" });
    expect(selectAmbiguousProviderOutcomeReservations([{ ...failed, externalLeadId: "lead_1" }])).toMatchObject({ resolvable: false, reason: "NO_UNRESOLVED_RESERVATION" });
  });

  it("requires a paused, safe, exact-incident resolution and rejects cross-campaign provider state", () => {
    const safe = ambiguousProviderOutcomePrerequisites({ circuitReason: "AMBIGUOUS_PROVIDER_OUTCOME", expectedEventMatches: true, campaignsPaused: true, noActiveReservation: true, exactlyOneUnresolvedReservation: true, canonicalOrTombstoneIdentityPresent: true, providerLookupCompleted: true, providerCrossCampaignConflict: false });
    expect(Object.values(safe).every(Boolean)).toBe(true);
    expect(ambiguousProviderOutcomePrerequisites({ circuitReason: "AMBIGUOUS_PROVIDER_OUTCOME", expectedEventMatches: true, campaignsPaused: true, noActiveReservation: true, exactlyOneUnresolvedReservation: true, canonicalOrTombstoneIdentityPresent: true, providerLookupCompleted: true, providerCrossCampaignConflict: true }).providerCrossCampaignConflictClear).toBe(false);
  });
});
