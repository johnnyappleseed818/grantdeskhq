import { describe, expect, it } from "vitest";
import { ambiguousProviderOutcomePrerequisites, hasPersistedQuarantineIdentity, hasProviderMembershipConflict, hasSufficientLegacyProviderHistory, selectAmbiguousProviderOutcomeReservations } from "../../server/ambiguousHandoffResolution.ts";

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

  it("accepts legacy cross-campaign evidence only with a tombstone or matching persisted first send", () => {
    expect(hasSufficientLegacyProviderHistory({ providerCampaignIsLegacy: true, permanentTombstonePresent: true, persistedCampaignMatches: false, persistedInitialSendAt: "" })).toBe(true);
    expect(hasSufficientLegacyProviderHistory({ providerCampaignIsLegacy: true, permanentTombstonePresent: false, persistedCampaignMatches: true, persistedInitialSendAt: "2026-09-01T16:15:46Z" })).toBe(true);
    expect(hasSufficientLegacyProviderHistory({ providerCampaignIsLegacy: true, permanentTombstonePresent: false, persistedCampaignMatches: true, persistedInitialSendAt: "" })).toBe(false);
    expect(hasSufficientLegacyProviderHistory({ providerCampaignIsLegacy: false, permanentTombstonePresent: true, persistedCampaignMatches: true, persistedInitialSendAt: "2026-09-01T16:15:46Z" })).toBe(false);
  });

  it("quarantines a workspace-only provider identity but rejects positive conflicting memberships", () => {
    expect(hasProviderMembershipConflict({ scopedMembershipCount: 0, providerCampaignId: "", requestedCampaignId: "clean-direct", legacyProviderHistorySufficient: false })).toBe(false);
    expect(hasProviderMembershipConflict({ scopedMembershipCount: 1, providerCampaignId: "other-campaign", requestedCampaignId: "clean-direct", legacyProviderHistorySufficient: false })).toBe(true);
    expect(hasProviderMembershipConflict({ scopedMembershipCount: 2, providerCampaignId: "", requestedCampaignId: "clean-direct", legacyProviderHistorySufficient: false })).toBe(true);
  });

  it("requires a complete persisted canonical identity before it can anchor quarantine", () => {
    expect(hasPersistedQuarantineIdentity({ canonicalOrganizationId: "org:example.org", canonicalContactId: "org:example.org:casey@example.org", email: "casey@example.org" })).toBe(true);
    expect(hasPersistedQuarantineIdentity({ canonicalOrganizationId: "org:example.org", canonicalContactId: "", email: "casey@example.org" })).toBe(false);
    expect(hasPersistedQuarantineIdentity(null)).toBe(false);
  });
});
