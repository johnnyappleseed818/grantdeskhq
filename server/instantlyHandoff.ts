import { instantlyHandoffIdempotencyKey, validateInstantlyOutboundInput } from "./instantly.ts";

export type HandoffStatus = "HANDOFF_STARTED" | "HANDED_OFF" | "FAILED";
export interface HandoffReservation { idempotencyKey: string; normalizedEmail: string; campaignId: string; handoffStatus: HandoffStatus; externalLeadId: string; handedOffAt: string; }
export interface FinalHandoffDependencies {
  reserve(input: { idempotencyKey: string; normalizedEmail: string; campaignId: string; source: string }): Promise<{ acquired: boolean; record: HandoffReservation }>;
  complete(idempotencyKey: string, normalizedEmail: string, externalLeadId: string): Promise<void>;
  fail(idempotencyKey: string, normalizedEmail: string, message: string): Promise<void>;
  findExistingLead(email: string, campaignId: string): Promise<{ id?: string; lead_id?: string } | null>;
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
  const idempotencyKey = instantlyHandoffIdempotencyKey(validated.campaignId, validated.email);
  const reservation = await dependencies.reserve({ idempotencyKey, normalizedEmail: validated.email, campaignId: validated.campaignId, source: input.source });
  if (!reservation.acquired) {
    if (reservation.record.handoffStatus === "HANDED_OFF") return { created: false, externalLeadId: reservation.record.externalLeadId, idempotencyKey, reason: "ALREADY_HANDED_OFF" as const };
    // Concurrent workers see the durable active lease and must never touch the
    // provider. A later retry of a FAILED reservation is reconciled below.
    if (reservation.record.handoffStatus === "HANDOFF_STARTED") return { created: false, externalLeadId: reservation.record.externalLeadId, idempotencyKey, reason: "HANDOFF_IN_PROGRESS" as const };
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
