import { describe, expect, it, vi } from "vitest";
import { applyInstantlyEvent, InstantlyClient, instantlyConfig, instantlyPreviewRecord, normalizeInstantlyWebhook, stagingEligibility, verifyInstantlyWebhookSignature, verifyInstantlyWebhookToken } from "../../server/instantly";
import type { CanonicalGtmRecord } from "../lib/gtmCanonical";

const record: CanonicalGtmRecord = {
  id: "direct_ready", organizationId: "org:example.org", organization: "Example Nonprofit", organizationDomain: "example.org", segment: "DIRECT", state: "READY_TO_SEND", qualified: true,
  contact: "Casey Finance", title: "Director of Finance", email: "casey@example.org", verificationStatus: "VERIFIED", suppressionStatus: "CLEAR", priorContact: false, blockers: [], nextAction: "REVIEW_AND_SEND", whyNow: "A grounded award signal", sourceUrl: "https://example.org", partnerType: null, subject: "Less time preparing grant reports", draft: "Hello", lastUpdated: "2026-08-23T00:00:00.000Z"
};

const enabledEnv = { INSTANTLY_INTEGRATION_ENABLED: "true", DIRECT_INSTANTLY_ENABLED: "true", PARTNER_INSTANTLY_ENABLED: "true" } as NodeJS.ProcessEnv;

describe("Instantly fail-closed integration", () => {
  it("does not make an API request without a configured key", async () => {
    const request = vi.fn();
    const client = new InstantlyClient(instantlyConfig(enabledEnv), "", request);
    await expect(client.listLeadLists()).rejects.toThrow("not configured");
    expect(request).not.toHaveBeenCalled();
  });

  it("allows only qualified, ready, clear, previously-uncontacted records to stage", () => {
    expect(stagingEligibility(record, [], instantlyConfig(enabledEnv))).toEqual({ eligible: true, reason: "ELIGIBLE" });
    expect(stagingEligibility({ ...record, priorContact: true }, [], instantlyConfig(enabledEnv))).toEqual({ eligible: false, reason: "SUPPRESSED_OR_PRIOR_CONTACT" });
    expect(stagingEligibility({ ...record, suppressionStatus: "BLOCKED" }, [], instantlyConfig(enabledEnv))).toEqual({ eligible: false, reason: "SUPPRESSED_OR_PRIOR_CONTACT" });
    expect(stagingEligibility({ ...record, state: "NEEDS_VERIFICATION" }, [], instantlyConfig(enabledEnv))).toEqual({ eligible: false, reason: "NOT_READY" });
  });

  it("creates a preview record without claiming that anything was sent", () => {
    const preview = instantlyPreviewRecord(record, "2026-08-23T00:00:00.000Z");
    expect(preview.instantlySyncStatus).toBe("PREVIEW_ONLY");
    expect(preview.firstSentAt).toBe("");
    expect(preview.failureReason).toBe("API_KEY_NOT_CONFIGURED");
  });

  it("normalizes signed webhook event semantics and maps only one canonical state", () => {
    const event = normalizeInstantlyWebhook({ id: "evt_1", type: "reply_received", data: { lead_id: "lead_1", email: "casey@example.org", timestamp: "2026-08-23T12:00:00.000Z" } });
    expect(event?.type).toBe("REPLY_RECEIVED");
    const next = applyInstantlyEvent({ ...instantlyPreviewRecord(record), instantlyLeadId: "lead_1" }, event!);
    expect(next.instantlySyncStatus).toBe("REPLIED");
    expect(next.replyReceivedAt).toBe("2026-08-23T12:00:00.000Z");
  });

  it("maps bounce and unsubscribe to terminal safety states", () => {
    const base = instantlyPreviewRecord(record);
    const bounce = applyInstantlyEvent(base, { id: "evt_b", type: "BOUNCE", instantlyLeadId: "", email: record.email!, occurredAt: "2026-08-23T12:00:00.000Z", campaignId: "", rawType: "bounce" });
    const unsubscribe = applyInstantlyEvent(base, { id: "evt_u", type: "UNSUBSCRIBE", instantlyLeadId: "", email: record.email!, occurredAt: "2026-08-23T12:00:00.000Z", campaignId: "", rawType: "unsubscribe" });
    expect(bounce.instantlySyncStatus).toBe("BOUNCED");
    expect(unsubscribe.instantlySyncStatus).toBe("UNSUBSCRIBED");
  });

  it("requires a valid HMAC signature before accepting a webhook", () => {
    const payload = Buffer.from('{"id":"evt_1"}');
    expect(verifyInstantlyWebhookSignature(payload, "bad", "secret")).toBe(false);
    expect(verifyInstantlyWebhookSignature(payload, undefined, "secret")).toBe(false);
  });

  it("also accepts only an exact configured static webhook token", () => {
    expect(verifyInstantlyWebhookToken("correct", "correct")).toBe(true);
    expect(verifyInstantlyWebhookToken("incorrect", "correct")).toBe(false);
    expect(verifyInstantlyWebhookToken(undefined, "correct")).toBe(false);
  });

  it("uses explicit false defaults for every delivery-affecting flag", () => {
    const config = instantlyConfig({});
    expect(config.outboundEnabled).toBe(false);
    expect(config.autoHandoffEnabled).toBe(false);
    expect(config.directEnabled).toBe(false);
    expect(config.partnerEnabled).toBe(false);
  });
});
