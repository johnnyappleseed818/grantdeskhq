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
  canonicalIdentityPresent: boolean;
  providerLookupCompleted: boolean;
  providerCrossCampaignConflict: boolean;
}) {
  return {
    ambiguousProviderOutcome: input.circuitReason === "AMBIGUOUS_PROVIDER_OUTCOME",
    expectedEventMatches: input.expectedEventMatches,
    campaignsPaused: input.campaignsPaused,
    noActiveReservation: input.noActiveReservation,
    exactlyOneUnresolvedReservation: input.exactlyOneUnresolvedReservation,
    canonicalIdentityPresent: input.canonicalIdentityPresent,
    providerLookupCompleted: input.providerLookupCompleted,
    providerCrossCampaignConflictClear: !input.providerCrossCampaignConflict
  };
}
