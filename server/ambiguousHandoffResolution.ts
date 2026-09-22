import type { InstantlyHandoffRecord } from "./persistence.ts";

/**
 * The original handoff boundary intentionally refuses to retry a FAILED
 * reservation without first finding the provider membership.  Older incident
 * records did not retain a reservation reference on the circuit event, so a
 * recovery must be even stricter: it may proceed only when exactly one failed,
 * lead-less reservation exists.  Any ambiguity stays fail-closed.
 */
export function selectAmbiguousProviderOutcomeReservations(reservations: readonly InstantlyHandoffRecord[]) {
  const unresolved = reservations.filter((reservation) =>
    reservation.handoffStatus === "FAILED"
    && !String(reservation.externalLeadId || "").trim()
  );
  return {
    unresolved,
    resolvable: unresolved.length === 1,
    reason: unresolved.length === 1
      ? "EXACTLY_ONE_UNRESOLVED_RESERVATION"
      : unresolved.length === 0
        ? "NO_UNRESOLVED_RESERVATION"
        : "MULTIPLE_UNRESOLVED_RESERVATIONS"
  } as const;
}

export function ambiguousProviderOutcomePrerequisites(input: {
  circuitReason: string;
  expectedEventMatches: boolean;
  campaignsPaused: boolean;
  noActiveReservation: boolean;
  exactlyOneUnresolvedReservation: boolean;
  canonicalOrTombstoneIdentityPresent: boolean;
  providerLookupCompleted: boolean;
  providerCrossCampaignConflict: boolean;
}) {
  return {
    ambiguousProviderOutcome: input.circuitReason === "AMBIGUOUS_PROVIDER_OUTCOME",
    expectedEventMatches: input.expectedEventMatches,
    campaignsPaused: input.campaignsPaused,
    noActiveReservation: input.noActiveReservation,
    exactlyOneUnresolvedReservation: input.exactlyOneUnresolvedReservation,
    canonicalOrTombstoneIdentityPresent: input.canonicalOrTombstoneIdentityPresent,
    providerLookupCompleted: input.providerLookupCompleted,
    providerCrossCampaignConflictClear: !input.providerCrossCampaignConflict
  };
}

/** A legacy membership is closure evidence only when it is already permanently
 * tombstoned, or a matching persisted provider record contains an actual
 * initial-send timestamp. Membership or a status value alone is insufficient. */
export function hasSufficientLegacyProviderHistory(input: {
  providerCampaignIsLegacy: boolean;
  permanentTombstonePresent: boolean;
  persistedCampaignMatches: boolean;
  persistedInitialSendAt: string;
}) {
  return input.providerCampaignIsLegacy && (
    input.permanentTombstonePresent
    || (input.persistedCampaignMatches && Boolean(input.persistedInitialSendAt.trim()))
  );
}

/** A workspace identity without an active campaign is an unknown historical
 * provider artifact, not evidence that the recipient is enrolled somewhere
 * else. Only a positive conflicting campaign ID, or more than one positive
 * membership, blocks safe quarantine. */
export function hasProviderMembershipConflict(input: {
  scopedMembershipCount: number;
  providerCampaignId: string;
  requestedCampaignId: string;
  legacyProviderHistorySufficient: boolean;
}) {
  return input.scopedMembershipCount > 1
    || Boolean(input.providerCampaignId && input.providerCampaignId !== input.requestedCampaignId && !input.legacyProviderHistorySufficient);
}

/** An existing durable Instantly record can anchor quarantine even when an old
 * canonical projection no longer retains the contact. Its identity must be
 * complete; a bare provider lead is never enough. */
export function hasPersistedQuarantineIdentity(value: { canonicalOrganizationId?: string | null; canonicalContactId?: string | null; email?: string | null } | null) {
  return Boolean(String(value?.canonicalOrganizationId || "").trim() && String(value?.canonicalContactId || "").trim() && String(value?.email || "").trim());
}

/**
 * Some early handoff reservations predate canonical identity storage. They are
 * still a real email-scoped safety boundary, but must never be promoted into a
 * fabricated organization/contact record. A complete reservation lets the
 * resolver create an immutable unattributed quarantine keyed by opaque hashes.
 */
export function hasUnattributedReservationQuarantineIdentity(value: Pick<InstantlyHandoffRecord, "normalizedEmail" | "idempotencyKey" | "campaignId" | "source"> | null) {
  const email = String(value?.normalizedEmail || "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    && Boolean(String(value?.idempotencyKey || "").trim())
    && Boolean(String(value?.campaignId || "").trim())
    && Boolean(String(value?.source || "").trim());
}
