import { describe, expect, it, vi } from "vitest";
import { applyInstantlyEvent, InstantlyClient, instantlyConfig, instantlyHealth, instantlyPreviewRecord, normalizeInstantlyWebhook, reconcileInstantlyLead, stagingEligibility, verifyInstantlyWebhookSignature, verifyInstantlyWebhookToken } from "../../server/instantly";
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

  it("treats polling as healthy when webhooks are unavailable on the plan", () => {
    const health = instantlyHealth(instantlyConfig({ INSTANTLY_INTEGRATION_ENABLED: "true", INSTANTLY_API_KEY: "configured", INSTANTLY_EVENT_SYNC_MODE: "polling" }));
    expect(health.eventSyncMode).toBe("POLLING");
    expect(health.webhookSubscription).toBe("NOT_AVAILABLE_ON_CURRENT_PLAN_OPTIONAL");
    expect(health.status).toBe("CONFIGURED");
  });

  it("detects the first real campaign step as one send and does not duplicate it", () => {
    const staged = { ...instantlyPreviewRecord(record), instantlySyncStatus: "STAGED" as const, instantlyLeadId: "lead_1", instantlyCampaignId: "campaign_1" };
    const lead = { id: "lead_1", campaign: "campaign_1", status: 1, email_reply_count: 0, timestamp_updated: "2026-08-23T10:00:00.000Z", last_step_from: "campaign", last_step_timestamp_executed: "2026-08-23T09:59:00.000Z" };
    const sent = reconcileInstantlyLead(staged, lead, "2026-08-23T10:01:00.000Z");
    expect(sent.event).toBe("EMAIL_SENT");
    expect(sent.record.firstSentAt).toBe("2026-08-23T09:59:00.000Z");
    expect(sent.record.sentAtSource).toBe("INSTANTLY_LEAD_LAST_STEP_TIMESTAMP");
    expect(reconcileInstantlyLead(sent.record, lead, "2026-08-23T10:02:00.000Z").event).toBeNull();
  });

  it("maps reply, bounce, unsubscribe, completion, and explicit interest from lead polling", () => {
    const sent = { ...instantlyPreviewRecord(record), instantlyLeadId: "lead_1", instantlyCampaignId: "campaign_1", instantlySyncStatus: "SENT" as const, firstSentAt: "2026-08-23T09:00:00.000Z", lastKnownReplyCount: 0 };
    expect(reconcileInstantlyLead(sent, { id: "lead_1", status: 1, email_reply_count: 1, timestamp_updated: "2026-08-23T10:00:00.000Z" }).record.instantlySyncStatus).toBe("REPLIED");
    expect(reconcileInstantlyLead(sent, { id: "lead_1", status: -1, email_reply_count: 0, timestamp_updated: "2026-08-23T10:00:00.000Z" }).suppressEmail).toBe("hard_bounce");
    expect(reconcileInstantlyLead(sent, { id: "lead_1", status: -2, email_reply_count: 0, timestamp_updated: "2026-08-23T10:00:00.000Z" }).suppressEmail).toBe("unsubscribe");
    expect(reconcileInstantlyLead(sent, { id: "lead_1", status: 3, email_reply_count: 0, timestamp_updated: "2026-08-23T10:00:00.000Z" }).record.instantlySyncStatus).toBe("SEQUENCE_COMPLETE");
    expect(reconcileInstantlyLead(sent, { id: "lead_1", status: 1, email_reply_count: 0, lt_interest_status: 1, timestamp_updated: "2026-08-23T10:00:00.000Z" }).record.instantlySyncStatus).toBe("POSITIVE");
    expect(reconcileInstantlyLead(sent, { id: "lead_1", status: 1, email_reply_count: 0, lt_interest_status: -1, timestamp_updated: "2026-08-23T10:00:00.000Z" }).record.instantlySyncStatus).toBe("NOT_INTERESTED");
  });

  it("retries a 429 exactly once without causing an outbound action", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const wait = vi.fn().mockResolvedValue(undefined);
    const client = new InstantlyClient(instantlyConfig({ INSTANTLY_INTEGRATION_ENABLED: "true" }), "key", request, wait);
    await expect(client.listCampaigns()).resolves.toEqual({ items: [] });
    expect(request).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });
});
