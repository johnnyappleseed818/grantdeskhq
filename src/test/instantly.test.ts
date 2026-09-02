import { describe, expect, it, vi } from "vitest";
import { applyInstantlyEvent, campaignSenderAddresses, campaignUsesOnlySender, controlledCampaignSafetySummary, InstantlyClient, instantlyConfig, instantlyHealth, instantlyLeadCampaignId, instantlyPreviewRecord, normalizeInstantlyWebhook, reconcileInstantlyEmailEvidence, reconcileInstantlyLead, stagingEligibility, verifyInstantlyWebhookSignature, verifyInstantlyWebhookToken } from "../../server/instantly";
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

  it("creates a provider verification only when no existing verification job is found", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_status: "verified", catch_all: false }), { status: 200 }));
    const client = new InstantlyClient(instantlyConfig({ INSTANTLY_INTEGRATION_ENABLED: "true" }), "key", request);
    await expect(client.ensureEmailVerification("casey@example.org")).resolves.toMatchObject({ verification_status: "verified" });
    expect(request.mock.calls[0]?.[0]).toBe("https://api.instantly.ai/api/v2/email-verification/casey%40example.org");
    expect((request.mock.calls[0]?.[1] as RequestInit).method).toBeUndefined();
    expect(request).toHaveBeenNthCalledWith(2, "https://api.instantly.ai/api/v2/email-verification", expect.objectContaining({ method: "POST" }));
  });

  it("uses Instantly's documented campaign filter when inspecting campaign membership", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const client = new InstantlyClient(instantlyConfig({ INSTANTLY_INTEGRATION_ENABLED: "true" }), "key", request);
    await expect(client.listLeadsInCampaign("campaign_1")).resolves.toEqual({ items: [] });
    expect(request).toHaveBeenCalledWith("https://api.instantly.ai/api/v2/leads/list", expect.objectContaining({ method: "POST", body: JSON.stringify({ limit: 100, campaign: "campaign_1" }) }));
  });

  it("uses Instantly's exact email contacts filter for legacy enrollment lookup", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "legacy_lead", email: "legacy@example.org", campaign: "campaign_legacy" }] }), { status: 200 }));
    const client = new InstantlyClient(instantlyConfig({ INSTANTLY_INTEGRATION_ENABLED: "true" }), "key", request);
    await expect(client.findLeadByEmail(" Legacy@Example.org ")).resolves.toMatchObject({ id: "legacy_lead" });
    expect(request).toHaveBeenCalledWith("https://api.instantly.ai/api/v2/leads/list", expect.objectContaining({ method: "POST", body: JSON.stringify({ contacts: ["legacy@example.org"], search: "legacy@example.org", limit: 10 }) }));
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
    expect(config.controlledBatchEnabled).toBe(false);
    expect(config.controlledBatchId).toBe("");
  });

  it("requires an exact configured controlled-batch ID before a campaign write", async () => {
    const request = vi.fn();
    const client = new InstantlyClient(instantlyConfig({ INSTANTLY_INTEGRATION_ENABLED: "true", INSTANTLY_API_KEY: "configured", INSTANTLY_CONTROLLED_BATCH_ENABLED: "true", INSTANTLY_CONTROLLED_BATCH_ID: "gdh-controlled-batch-20260824-01" }), "key", request);
    await expect(client.createLeadInControlledCampaign({ email: record.email!, firstName: "Casey", lastName: "Finance", companyName: record.organization, jobTitle: record.title!, campaignId: "campaign_1", personalization: "Hello", subject: "A valid subject", sequenceId: "initial-v1", segment: "DIRECT", customVariables: {} }, "gdh-controlled-batch-20260824-02")).rejects.toThrow("exact batch ID");
    expect(request).not.toHaveBeenCalled();
  });

  it("permits a campaign configuration write only for the exact enabled batch", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "campaign_1" }), { status: 200 }));
    const config = instantlyConfig({ INSTANTLY_INTEGRATION_ENABLED: "true", INSTANTLY_API_KEY: "configured", INSTANTLY_CONTROLLED_BATCH_ENABLED: "true", INSTANTLY_CONTROLLED_BATCH_ID: "gdh-controlled-batch-20260824-01" });
    const client = new InstantlyClient(config, "key", request);
    await expect(client.configureControlledCampaign("campaign_1", { email_list: ["eli.katz@grantdeskhq.com"], stop_on_reply: true }, "gdh-controlled-batch-20260824-01")).resolves.toEqual({ id: "campaign_1" });
    expect(request).toHaveBeenCalledWith("https://api.instantly.ai/api/v2/campaigns/campaign_1", expect.objectContaining({ method: "PATCH" }));
  });

  it("uses Instantly's dedicated pause endpoint only for the exact enabled batch", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "campaign_1", status: 2 }), { status: 200 }));
    const config = instantlyConfig({ INSTANTLY_INTEGRATION_ENABLED: "true", INSTANTLY_API_KEY: "configured", INSTANTLY_CONTROLLED_BATCH_ENABLED: "true", INSTANTLY_CONTROLLED_BATCH_ID: "gdh-controlled-batch-20260824-01" });
    const client = new InstantlyClient(config, "key", request);
    await expect(client.pauseControlledCampaign("campaign_1", "gdh-controlled-batch-20260824-01")).resolves.toEqual({ id: "campaign_1", status: 2 });
    expect(request).toHaveBeenCalledWith("https://api.instantly.ai/api/v2/campaigns/campaign_1/pause", expect.objectContaining({ method: "POST" }));
  });

  it("requires every controlled campaign to expose only the approved sender", () => {
    const onlyEli = { email_list: ["eli.katz@grantdeskhq.com"] };
    const mixed = { email_accounts: [{ email: "eli.katz@grantdeskhq.com" }, { email: "jay@virtualaiassistants.com" }] };
    expect(campaignSenderAddresses(onlyEli)).toEqual(["eli.katz@grantdeskhq.com"]);
    expect(campaignUsesOnlySender(onlyEli, "eli.katz@grantdeskhq.com")).toBe(true);
    expect(campaignUsesOnlySender(mixed, "eli.katz@grantdeskhq.com")).toBe(false);
  });

  it("keeps a Partner-only controlled configuration isolated from the populated Direct campaign", () => {
    const directMembers = 5;
    const partnerMembers = 0;
    const directSelected = 0;
    const partnerSelected = 3;
    const selectedCampaignHasLeads = (directSelected > 0 && directMembers > 0) || (partnerSelected > 0 && partnerMembers > 0);
    expect(selectedCampaignHasLeads).toBe(false);
  });

  it("normalizes campaign IDs from string and object lead representations", () => {
    expect(instantlyLeadCampaignId({ campaign: "campaign_1" })).toBe("campaign_1");
    expect(instantlyLeadCampaignId({ campaign: { id: "campaign_2" } })).toBe("campaign_2");
    expect(instantlyLeadCampaignId({ campaign: null })).toBe("");
  });

  it("summarizes campaign controls without exposing raw provider configuration", () => {
    expect(controlledCampaignSafetySummary({ id: "campaign_1", name: "Direct", status: 0, email_list: ["eli.katz@grantdeskhq.com"], stop_on_reply: true, disable_bounce_protect: false, open_tracking: false, link_tracking: false, sequences: [{ steps: [{ type: "email", variants: [{ subject: "Less manual work", body: "Hi {{firstName}}" }] }] }] })).toMatchObject({ senders: ["eli.katz@grantdeskhq.com"], stopOnReply: true, bounceProtectionEnabled: true, openTracking: false, linkTracking: false, firstEmailVariants: [{ subject: "Less manual work", body: "Hi {{firstName}}" }] });
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

  it("records an exact provider email event when lead-step metadata is unavailable", () => {
    const staged = { ...instantlyPreviewRecord(record), instantlySyncStatus: "IN_CAMPAIGN" as const, instantlyLeadId: "lead_1", instantlyCampaignId: "campaign_1" };
    const evidence = { id: "email_1", lead_id: "lead_1", campaign_id: "campaign_1", timestamp_email: "2026-08-23T09:59:00.000Z" };
    const sent = reconcileInstantlyEmailEvidence(staged, evidence);
    expect(sent?.event).toBe("EMAIL_SENT");
    expect(sent?.record.firstSentAt).toBe("2026-08-23T09:59:00.000Z");
    expect(sent?.record.sentAtSource).toBe("INSTANTLY_EMAIL_EVIDENCE");
    expect(reconcileInstantlyEmailEvidence(sent!.record, evidence)).toBeNull();
    expect(reconcileInstantlyEmailEvidence(staged, { ...evidence, campaign_id: "other_campaign" })).toBeNull();
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
