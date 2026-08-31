import { instantlyHandoffIdempotencyKey, validateInstantlyOutboundInput } from "./instantly.ts";

export type HandoffStatus = "HANDOFF_STARTED" | "HANDED_OFF" | "FAILED";
export interface HandoffReservation { idempotencyKey: string; normalizedEmail: string; campaignId: string; handoffStatus: HandoffStatus; externalLeadId: string; handedOffAt: string; leaseExpiry?: string; }
export interface FinalHandoffDependencies {
  reserve(input: { idempotencyKey: string; normalizedEmail: string; campaignId: string; source: string }): Promise<{ acquired: boolean; record: HandoffReservation }>;
  complete(idempotencyKey: string, normalizedEmail: string, externalLeadId: string): Promise<void>;
  fail(idempotencyKey: string, normalizedEmail: string, message: string): Promise<void>;
  findExistingLead(email: string, campaignId: string): Promise<{ id?: string; lead_id?: string; campaignId?: string } | null>;
  hasRecentProspectingSend?(email: string): Promise<boolean>;
  createLead(): Promise<{ id?: string; lead_id?: string }>;
  /** Optional production safety hooks. Tests can omit them, while the live
   * boundary uses them to fail closed and create an auditable incident. */
  assertCircuitClosed?(): Promise<void>;
  tripCircuitBreaker?(reason: string, detail: string): Promise<void>;
}

/** Sole prospect-enrollment choreography: reserve durably before Instantly and
 * query Instantly before retrying any ambiguous failed operation. */
export async function executeFinalInstantlyHandoff(input: { email: string; campaignId: string; subject: string; body: string; sequenceId: string; source: string }, dependencies: FinalHandoffDependencies) {
  await dependencies.assertCircuitClosed?.();
  let validated: ReturnType<typeof validateInstantlyOutboundInput>;
  try {
    validated = validateInstantlyOutboundInput(input);
  } catch (error) {
    await dependencies.tripCircuitBreaker?.("INVALID_OUTBOUND_CONTENT", error instanceof Error ? error.message : "Outbound validation failed.");
    throw error;
  }
  const idempotencyKey = instantlyHandoffIdempotencyKey(validated.campaignId, validated.email, validated.sequenceId);
  const reservation = await dependencies.reserve({ idempotencyKey, normalizedEmail: validated.email, campaignId: validated.campaignId, source: input.source });
  if (!reservation.acquired) {
    if (reservation.record.handoffStatus === "HANDED_OFF") return { created: false, externalLeadId: reservation.record.externalLeadId, idempotencyKey, reason: "ALREADY_HANDED_OFF" as const };
    // Concurrent workers see the durable active lease and must never touch the
    // provider. Once the lease expires, the outcome is ambiguous and must be
    // reconciled before any retry can create another enrollment.
    const leaseExpired = Boolean(reservation.record.leaseExpiry) && Date.parse(String(reservation.record.leaseExpiry)) <= Date.now();
    if (reservation.record.handoffStatus === "HANDOFF_STARTED" && !leaseExpired) return { created: false, externalLeadId: reservation.record.externalLeadId, idempotencyKey, reason: "HANDOFF_IN_PROGRESS" as const };
    // A previous reservation may have reached Instantly just before a timeout
    // or a local write failure. Reconcile it before *any* later provider call.
    const existing = await dependencies.findExistingLead(validated.email, validated.campaignId);
    const externalLeadId = String(existing?.id || existing?.lead_id || "");
    if (externalLeadId) {
      await dependencies.complete(idempotencyKey, validated.email, externalLeadId);
      return { created: false, externalLeadId, idempotencyKey, reason: "RECOVERED_EXISTING_PROVIDER_LEAD" as const };
    }
    await dependencies.tripCircuitBreaker?.("AMBIGUOUS_PROVIDER_OUTCOME", "A prior enrollment reservation has no reconcilable provider lead.");
    throw new Error("Instantly enrollment is ambiguous and requires reconciliation before retry.");
  }
  // A legacy provider lead or a provider-confirmed message may predate local
  // persistence. Reconcile both before *any* new provider write. This protects
  // cross-campaign identity and the one-email-per-day invariant.
  const providerExisting = await dependencies.findExistingLead(validated.email, "");
  if (providerExisting) {
    const externalLeadId = String(providerExisting.id || providerExisting.lead_id || "").trim();
    const providerCampaignId = String(providerExisting.campaignId || "").trim();
    if (externalLeadId && providerCampaignId === validated.campaignId) {
      await dependencies.complete(idempotencyKey, validated.email, externalLeadId);
      return { created: false, externalLeadId, idempotencyKey, reason: "RECOVERED_EXISTING_PROVIDER_LEAD" as const };
    }
    await dependencies.fail(idempotencyKey, validated.email, "Existing provider enrollment has an unknown or conflicting campaign.");
    await dependencies.tripCircuitBreaker?.("DUPLICATE_PROVIDER_ENROLLMENT", "A normalized recipient already exists in another provider enrollment.");
    throw new Error("Recipient already has an active or unresolved Instantly enrollment.");
  }
  if (await dependencies.hasRecentProspectingSend?.(validated.email)) {
    await dependencies.fail(idempotencyKey, validated.email, "Provider evidence shows a GrantDeskHQ prospecting message in the last 24 hours.");
    await dependencies.tripCircuitBreaker?.("RECIPIENT_DAILY_SEND_LIMIT", "Provider evidence would violate the one-prospect-message-per-24-hours invariant.");
    throw new Error("Recipient has a provider-confirmed GrantDeskHQ prospecting message in the last 24 hours.");
  }
  let externalLeadId = "";
  try {
    const created = await dependencies.createLead();
    externalLeadId = String(created.id || created.lead_id || "").trim();
    if (!externalLeadId) throw new Error("Instantly did not return a lead ID.");
    await dependencies.complete(idempotencyKey, validated.email, externalLeadId);
    return { created: true, externalLeadId, idempotencyKey, reason: "HANDOFF_COMPLETE" as const };
  } catch (error) {
    // Preserve HANDOFF_STARTED after a provider success/local-write failure so
    // a retry can recover by lookup rather than make another provider write.
    if (!externalLeadId) {
      await dependencies.fail(idempotencyKey, validated.email, error instanceof Error ? error.message : "Instantly handoff failed.");
      await dependencies.tripCircuitBreaker?.("PROVIDER_HANDOFF_FAILURE", error instanceof Error ? error.message : "Instantly handoff failed.");
    }
    throw error;
  }
}

/** Uses the same provider identity lookup as the final boundary so preview
 * eligibility cannot select a legacy or unresolved provider enrollment. */
export async function excludeProviderEnrolledCandidates<T extends { email?: string | null }>(records: readonly T[], findExistingLead: (normalizedEmail: string) => Promise<unknown>) {
  const enrolled = new Set((await Promise.all(records.map(async (record) => {
    const email = String(record.email || "").trim().toLowerCase();
    if (!email) return "";
    return await findExistingLead(email) ? email : "";
  }))).filter(Boolean));
  return records.filter((record) => !enrolled.has(String(record.email || "").trim().toLowerCase()));
}
