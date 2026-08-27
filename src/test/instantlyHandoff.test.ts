import { describe, expect, it, vi } from "vitest";
import { assertInstantlyDeliveryEnabled, assertInstantlyDeliveryOwner, instantlyConfig, normalizeOutboundEmail, validateInstantlyOutboundInput } from "../../server/instantly.ts";
import { executeFinalInstantlyHandoff, type HandoffReservation } from "../../server/instantlyHandoff.ts";

const valid = { email: " Casey@Example.org ", campaignId: "campaign_a", subject: "One grant report", body: "Hi Casey", sequenceId: "initial-v1", source: "test" };

function atomicReservation() {
  let record: HandoffReservation | null = null;
  return async (input: { idempotencyKey: string; normalizedEmail: string; campaignId: string }) => {
    if (!record) {
      record = { ...input, handoffStatus: "HANDOFF_STARTED", externalLeadId: "", handedOffAt: "" };
      return { acquired: true, record };
    }
    return { acquired: false, record };
  };
}

describe("final Instantly handoff safety", () => {
  it("normalizes case and whitespace before deriving eligibility", () => {
    expect(normalizeOutboundEmail(valid.email)).toBe("casey@example.org");
  });

  it("rejects blank, literal-null, and unresolved subjects or bodies before provider access", () => {
    expect(() => validateInstantlyOutboundInput({ ...valid, subject: "  " })).toThrow("subject");
    expect(() => validateInstantlyOutboundInput({ ...valid, subject: "{{subjectLine}}" })).toThrow("subject");
    expect(() => validateInstantlyOutboundInput({ ...valid, body: "undefined" })).toThrow("body");
  });

  it("fails closed at the final boundary when the master kill switch is off", () => {
    expect(() => assertInstantlyDeliveryEnabled(instantlyConfig({ INSTANTLY_OUTBOUND_ENABLED: "true", INSTANTLY_AUTO_HANDOFF_ENABLED: "true", DIRECT_INSTANTLY_ENABLED: "true" }), "DIRECT")).toThrow("OUTBOUND_EMAIL_ENABLED");
    expect(() => assertInstantlyDeliveryOwner("SMTP")).toThrow("Instantly");
  });

  it("allows two concurrent workers to create exactly one external enrollment", async () => {
    const reserve = atomicReservation();
    const createLead = vi.fn().mockResolvedValue({ id: "lead_1" });
    const complete = vi.fn().mockResolvedValue(undefined);
    const dependencies = { reserve, createLead, complete, fail: vi.fn(), findExistingLead: vi.fn().mockResolvedValue(null) };
    const [first, second] = await Promise.all([executeFinalInstantlyHandoff(valid, dependencies), executeFinalInstantlyHandoff(valid, dependencies)]);
    expect(createLead).toHaveBeenCalledTimes(1);
    expect([first.reason, second.reason]).toContain("HANDOFF_COMPLETE");
    expect([first.reason, second.reason]).toContain("HANDOFF_IN_PROGRESS");
  });

  it("recovers an ambiguous timeout by adopting an existing provider lead instead of creating another", async () => {
    const failed: HandoffReservation = { idempotencyKey: "x", normalizedEmail: "casey@example.org", campaignId: "campaign_a", handoffStatus: "FAILED", externalLeadId: "", handedOffAt: "" };
    const createLead = vi.fn();
    const complete = vi.fn().mockResolvedValue(undefined);
    const result = await executeFinalInstantlyHandoff(valid, { reserve: vi.fn().mockResolvedValue({ acquired: false, record: failed }), findExistingLead: vi.fn().mockResolvedValue({ id: "provider_lead" }), createLead, complete, fail: vi.fn() });
    expect(result.reason).toBe("RECOVERED_EXISTING_PROVIDER_LEAD");
    expect(createLead).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith(expect.any(String), "casey@example.org", "provider_lead");
  });

  it("fails closed and trips the circuit when an ambiguous retry has no provider lead", async () => {
    const failed: HandoffReservation = { idempotencyKey: "x", normalizedEmail: "casey@example.org", campaignId: "campaign_a", handoffStatus: "FAILED", externalLeadId: "", handedOffAt: "" };
    const createLead = vi.fn();
    const tripCircuitBreaker = vi.fn().mockResolvedValue(undefined);
    await expect(executeFinalInstantlyHandoff(valid, { reserve: vi.fn().mockResolvedValue({ acquired: false, record: failed }), findExistingLead: vi.fn().mockResolvedValue(null), createLead, complete: vi.fn(), fail: vi.fn(), tripCircuitBreaker })).rejects.toThrow("ambiguous");
    expect(createLead).not.toHaveBeenCalled();
    expect(tripCircuitBreaker).toHaveBeenCalledWith("AMBIGUOUS_PROVIDER_OUTCOME", expect.any(String));
  });

  it("trips the circuit before a provider write when rendered content is unsafe", async () => {
    const createLead = vi.fn();
    const tripCircuitBreaker = vi.fn().mockResolvedValue(undefined);
    await expect(executeFinalInstantlyHandoff({ ...valid, subject: "{{missing}}" }, { reserve: vi.fn(), findExistingLead: vi.fn(), createLead, complete: vi.fn(), fail: vi.fn(), tripCircuitBreaker })).rejects.toThrow("subject");
    expect(createLead).not.toHaveBeenCalled();
    expect(tripCircuitBreaker).toHaveBeenCalledWith("INVALID_OUTBOUND_CONTENT", expect.any(String));
  });

  it("does not mark a handoff failed after provider success followed by local completion failure", async () => {
    const fail = vi.fn();
    await expect(executeFinalInstantlyHandoff(valid, { reserve: vi.fn().mockResolvedValue({ acquired: true, record: { idempotencyKey: "x", normalizedEmail: "casey@example.org", campaignId: "campaign_a", handoffStatus: "HANDOFF_STARTED", externalLeadId: "", handedOffAt: "" } }), findExistingLead: vi.fn(), createLead: vi.fn().mockResolvedValue({ id: "provider_lead" }), complete: vi.fn().mockRejectedValue(new Error("Firestore timeout")), fail })).rejects.toThrow("Firestore timeout");
    expect(fail).not.toHaveBeenCalled();
  });
});
