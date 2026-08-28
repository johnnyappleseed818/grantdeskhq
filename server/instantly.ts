import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { CanonicalGtmRecord } from "../src/lib/gtmCanonical.ts";
import { initialOutreachEligibility, type OutreachRecord } from "../src/lib/gtmOutreach.ts";

const apiBase = "https://api.instantly.ai/api/v2";

export type InstantlySegment = "DIRECT" | "PARTNER";
export type InstantlySyncStatus = "PREVIEW_ONLY" | "STAGED" | "APPROVED_FOR_CAMPAIGN" | "IN_CAMPAIGN" | "SENT" | "REPLIED" | "POSITIVE" | "NOT_INTERESTED" | "BOUNCED" | "UNSUBSCRIBED" | "SEQUENCE_COMPLETE" | "ERROR";
export type InstantlyEventType = "EMAIL_SENT" | "REPLY_RECEIVED" | "INTERESTED" | "NOT_INTERESTED" | "BOUNCE" | "UNSUBSCRIBE" | "SEQUENCE_COMPLETED" | "WRONG_PERSON" | "OUT_OF_OFFICE";
export type InstantlyEventSyncMode = "POLLING" | "WEBHOOKS";

export interface InstantlyConfig {
  integrationEnabled: boolean;
  /** Master safety switch, enforced at the final provider-write boundary. */
  outboundEmailEnabled: boolean;
  outboundEnabled: boolean;
  autoHandoffEnabled: boolean;
  directEnabled: boolean;
  partnerEnabled: boolean;
  firstTouchLinkEnabled: boolean;
  eventSyncMode: InstantlyEventSyncMode;
  apiKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  directListId: string;
  partnerListId: string;
  directCampaignId: string;
  partnerCampaignId: string;
  controlledBatchEnabled: boolean;
  controlledBatchId: string;
}

export interface InstantlyIntegrationRecord {
  id: string;
  canonicalOrganizationId: string;
  canonicalContactId: string;
  organization: string;
  contact: string;
  email: string;
  segment: InstantlySegment;
  source: string;
  signalType: string;
  whyNowOrFit: string;
  instantlyListId: string;
  instantlyCampaignId: string;
  instantlyLeadId: string;
  instantlySyncStatus: InstantlySyncStatus;
  firstSentAt: string;
  lastSentAt: string;
  replyReceivedAt: string;
  replyDisposition: string;
  bounceAt: string;
  unsubscribeAt: string;
  sequenceCompletedAt: string;
  productAttributionId: string;
  freeFirstAwardStartedAt: string;
  reportGeneratedAt: string;
  paidAt: string;
  messageVersion: string;
  lastInstantlySyncAt: string;
  lastProviderUpdatedAt: string;
  lastKnownLeadStatus: string;
  lastKnownReplyCount: number;
  lastProcessedSequenceStatus: string;
  lastCampaignStepAt: string;
  sentAtSource: string;
  sequenceStopRequestedAt: string;
  sequenceStopReason: string;
  failureReason: string;
  createdAt: string;
  updatedAt: string;
  controlledBatchId?: string;
}

export interface InstantlyWebhookEvent {
  id: string;
  type: InstantlyEventType;
  instantlyLeadId: string;
  email: string;
  occurredAt: string;
  campaignId: string;
  rawType: string;
}

export interface InstantlyLeadPollingTransition {
  record: InstantlyIntegrationRecord;
  event: InstantlyEventType | null;
  suppressEmail: "hard_bounce" | "unsubscribe" | null;
}

export function instantlyConfig(env: NodeJS.ProcessEnv = process.env): InstantlyConfig {
  const enabled = (name: string) => env[name] === "true";
  const requestedMode = String(env.INSTANTLY_EVENT_SYNC_MODE || "polling").trim().toUpperCase();
  return {
    integrationEnabled: enabled("INSTANTLY_INTEGRATION_ENABLED"),
    outboundEmailEnabled: enabled("OUTBOUND_EMAIL_ENABLED"),
    outboundEnabled: enabled("INSTANTLY_OUTBOUND_ENABLED"),
    autoHandoffEnabled: enabled("INSTANTLY_AUTO_HANDOFF_ENABLED"),
    directEnabled: enabled("DIRECT_INSTANTLY_ENABLED"),
    partnerEnabled: enabled("PARTNER_INSTANTLY_ENABLED"),
    firstTouchLinkEnabled: enabled("GTM_FIRST_TOUCH_LINK_ENABLED"),
    eventSyncMode: requestedMode === "WEBHOOKS" ? "WEBHOOKS" : "POLLING",
    apiKeyConfigured: Boolean(env.INSTANTLY_API_KEY?.trim()),
    webhookSecretConfigured: Boolean(env.INSTANTLY_WEBHOOK_SECRET?.trim()),
    directListId: String(env.INSTANTLY_DIRECT_LIST_ID || "").trim(),
    partnerListId: String(env.INSTANTLY_PARTNER_LIST_ID || "").trim(),
    directCampaignId: String(env.INSTANTLY_DIRECT_CAMPAIGN_ID || "").trim(),
    partnerCampaignId: String(env.INSTANTLY_PARTNER_CAMPAIGN_ID || "").trim(),
    controlledBatchEnabled: enabled("INSTANTLY_CONTROLLED_BATCH_ENABLED"),
    controlledBatchId: String(env.INSTANTLY_CONTROLLED_BATCH_ID || "").trim()
  };
}

/** Campaign responses can expose sending accounts in a few documented shapes.
 * We deliberately accept only explicit business-email strings and require an
 * exact one-mailbox match before a founder-authorized batch may activate. */
export function campaignSenderAddresses(campaign: Record<string, unknown>) {
  const addresses = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === "string") {
      const address = value.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) addresses.add(address);
      return;
    }
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(collect);
  };
  collect(campaign.email_list);
  collect(campaign.email_accounts);
  collect(campaign.senders);
  return [...addresses].sort();
}

export function campaignUsesOnlySender(campaign: Record<string, unknown>, email: string) {
  const expected = email.trim().toLowerCase();
  const senders = campaignSenderAddresses(campaign);
  return senders.length === 1 && senders[0] === expected;
}

export function instantlyLeadCampaignId(lead: Record<string, unknown>) {
  const campaign = lead.campaign;
  if (typeof campaign === "string") return campaign.trim();
  if (campaign && typeof campaign === "object" && !Array.isArray(campaign)) return text((campaign as Record<string, unknown>).id);
  return "";
}

/** Exposes operational controls needed for a founder-approved batch without
 * returning provider tokens, raw account data, or unrelated configuration. */
export function controlledCampaignSafetySummary(campaign: Record<string, unknown>) {
  const sequence = Array.isArray(campaign.sequences) ? campaign.sequences[0] : null;
  const steps = sequence && typeof sequence === "object" && Array.isArray((sequence as Record<string, unknown>).steps) ? (sequence as Record<string, unknown>).steps as Array<Record<string, unknown>> : [];
  const firstStep = steps.find((step) => step.type === "email") || null;
  const variants = firstStep && Array.isArray(firstStep.variants) ? firstStep.variants : [];
  return {
    id: text(campaign.id), name: text(campaign.name), status: number(campaign.status),
    senders: campaignSenderAddresses(campaign), schedule: campaign.campaign_schedule,
    stopOnReply: campaign.stop_on_reply === true, stopOnAutoReply: campaign.stop_on_auto_reply === true,
    bounceProtectionEnabled: campaign.disable_bounce_protect !== true,
    openTracking: campaign.open_tracking === true, linkTracking: campaign.link_tracking === true,
    dailyLimit: campaign.daily_limit ?? null, dailyMaxLeads: campaign.daily_max_leads ?? null,
    firstEmailVariants: variants.map((variant) => ({ subject: text(variant.subject), body: text(variant.body), disabled: variant.v_disabled === true }))
  };
}

export function instantlyHealth(config = instantlyConfig()) {
  return {
    integrationEnabled: config.integrationEnabled,
    outboundEmailEnabled: config.outboundEmailEnabled,
    apiKeyConfigured: config.apiKeyConfigured,
    webhookSecretConfigured: config.webhookSecretConfigured,
    outboundEnabled: config.outboundEnabled,
    autoHandoffEnabled: config.autoHandoffEnabled,
    directEnabled: config.directEnabled,
    partnerEnabled: config.partnerEnabled,
    firstTouchLinkEnabled: config.firstTouchLinkEnabled,
    eventSyncMode: config.eventSyncMode,
    webhookSubscription: config.eventSyncMode === "WEBHOOKS" ? "CONFIGURATION_REQUIRED" : "NOT_AVAILABLE_ON_CURRENT_PLAN_OPTIONAL",
    mappings: {
      directList: Boolean(config.directListId), partnerList: Boolean(config.partnerListId),
      directCampaign: Boolean(config.directCampaignId), partnerCampaign: Boolean(config.partnerCampaignId)
    },
    status: config.apiKeyConfigured && config.integrationEnabled ? "CONFIGURED" : "WAITING_FOR_API_KEY"
  };
}

export function normalizeOutboundEmail(value: string) { return value.trim().toLowerCase(); }

export function instantlyHandoffIdempotencyKey(campaignId: string, email: string) {
  return createHash("sha256").update(`${campaignId.trim()}|${normalizeOutboundEmail(email)}`).digest("hex");
}

const invalidRenderedValue = /\{\{[^}]+\}\}|\b(?:null|undefined)\b/i;

export function validateInstantlyOutboundInput(input: { email: string; campaignId: string; subject: string; body: string; sequenceId: string }) {
  const email = normalizeOutboundEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid normalized recipient email is required.");
  for (const [field, value] of Object.entries({ campaignId: input.campaignId, sequenceId: input.sequenceId, subject: input.subject, body: input.body })) {
    const rendered = String(value || "").trim();
    if (!rendered || invalidRenderedValue.test(rendered)) throw new Error(`Outbound ${field} is missing or contains an unresolved placeholder.`);
  }
  return { ...input, email, subject: input.subject.trim(), body: input.body.trim(), sequenceId: input.sequenceId.trim(), campaignId: input.campaignId.trim() };
}

export function assertInstantlyDeliveryEnabled(config: InstantlyConfig, segment: InstantlySegment) {
  if (!config.outboundEmailEnabled) throw new Error("Outbound delivery is disabled by OUTBOUND_EMAIL_ENABLED.");
  if (!config.outboundEnabled || !config.autoHandoffEnabled) throw new Error("Instantly outbound handoff is disabled.");
  if (segment === "DIRECT" && !config.directEnabled) throw new Error("Direct Instantly delivery is disabled.");
  if (segment === "PARTNER" && !config.partnerEnabled) throw new Error("Partner Instantly delivery is disabled.");
}

export function assertInstantlyDeliveryOwner(owner: string) {
  if (owner !== "INSTANTLY") throw new Error("Prospect outreach delivery is restricted to Instantly.");
}

export function instantlyPreviewRecord(record: CanonicalGtmRecord, now = new Date().toISOString()): InstantlyIntegrationRecord {
  const contactId = `${record.organizationId}:${record.email || record.contact || "unresolved"}`;
  return {
    id: `instantly_${record.organizationId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)}_${(record.email || "none").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40)}`,
    canonicalOrganizationId: record.organizationId, canonicalContactId: contactId, organization: record.organization, contact: record.contact || "", email: record.email || "",
    segment: record.segment, source: record.sourceUrl, signalType: record.partnerType || record.segment, whyNowOrFit: record.whyNow,
    instantlyListId: "", instantlyCampaignId: "", instantlyLeadId: "", instantlySyncStatus: "PREVIEW_ONLY",
    firstSentAt: "", lastSentAt: "", replyReceivedAt: "", replyDisposition: "", bounceAt: "", unsubscribeAt: "", sequenceCompletedAt: "",
    productAttributionId: "", freeFirstAwardStartedAt: "", reportGeneratedAt: "", paidAt: "", messageVersion: "benefit-led-v1", lastInstantlySyncAt: "", lastProviderUpdatedAt: "", lastKnownLeadStatus: "", lastKnownReplyCount: 0, lastProcessedSequenceStatus: "", lastCampaignStepAt: "", sentAtSource: "", sequenceStopRequestedAt: "", sequenceStopReason: "", failureReason: "API_KEY_NOT_CONFIGURED", createdAt: now, updatedAt: now
  };
}

/** No request can be made until integration is deliberately enabled and keyed. */
export class InstantlyClient {
  private readonly config: InstantlyConfig;
  private readonly apiKey: string;
  private readonly request: typeof fetch;
  private readonly wait: (milliseconds: number) => Promise<void>;

  constructor(config = instantlyConfig(), apiKey = process.env.INSTANTLY_API_KEY || "", request: typeof fetch = fetch, wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))) {
    this.config = config;
    this.apiKey = apiKey;
    this.request = request;
    this.wait = wait;
  }

  private assertReadable() {
    if (!this.config.integrationEnabled || !this.apiKey.trim()) throw new Error("Instantly API is not configured.");
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertReadable();
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await this.request(`${apiBase}${path}`, {
          ...init,
          signal: init.signal || AbortSignal.timeout(20_000),
          headers: { "Authorization": `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...init.headers }
        });
      } catch {
        if (attempt === 0) { await this.wait(500); continue; }
        throw new Error(`Instantly API request timed out or failed for ${path}.`);
      }
      if (response.ok) return response.json() as Promise<T>;
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt === 0) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await this.wait(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1_000, 5_000) : 1_000);
        continue;
      }
      const requestId = String(response.headers.get("x-request-id") || "").trim();
      throw new Error(`Instantly API request failed (${response.status})${requestId ? ` request ${requestId}` : ""}.`);
    }
    throw new Error("Instantly API request exhausted its bounded retry.");
  }

  listLeadLists() { return this.api<unknown>("/lead-lists?limit=100"); }
  listBlockListEntries() { return this.api<unknown>("/block-lists-entries?limit=100"); }
  createBlockListEntry(value: string) { return this.api<Record<string, unknown>>("/block-lists-entries", { method: "POST", body: JSON.stringify({ bl_value: normalizeOutboundEmail(value) }) }); }
  createLeadList(name: string) { return this.api<{ id?: string; name?: string }>("/lead-lists", { method: "POST", body: JSON.stringify({ name }) }); }
  listWorkspaces() { return this.api<unknown>("/workspaces?limit=100"); }
  listCampaigns() { return this.api<unknown>("/campaigns?limit=100"); }
  getCampaign(id: string) { return this.api<Record<string, unknown>>(`/campaigns/${encodeURIComponent(id)}`); }
  getLead(id: string) { return this.api<Record<string, unknown>>(`/leads/${encodeURIComponent(id)}`); }
  listAccounts() { return this.api<unknown>("/accounts?limit=100"); }
  getAccount(email: string) { return this.api<Record<string, unknown>>(`/accounts/${encodeURIComponent(email)}`); }
  listCampaignAnalytics() { return this.api<unknown>("/campaigns/analytics"); }
  listRecentEmails() { return this.api<unknown>("/emails?limit=10&preview_only=true"); }
  listRecentEmailEvidence(limit = 100) { return this.api<unknown>(`/emails?limit=${Math.min(Math.max(limit, 1), 100)}`); }
  previewSuperSearch(input: { companyNames: string[]; titles: string[]; limit: number }) {
    return this.api<{ number_of_leads?: number; number_of_redacted_results?: number }>("/supersearch-enrichment/preview-leads-from-supersearch", { method: "POST", body: JSON.stringify({ search_filters: { company_name: { include: input.companyNames, exclude: [] }, title: { include: input.titles, exclude: [] }, skip_owned_leads: true, show_one_lead_per_company: true }, limit: input.limit }) });
  }
  /** List-only provider enrichment; this cannot enroll a campaign or send mail. */
  enrichSuperSearch(input: { companyNames: string[]; titles: string[]; listId: string; limit: number; searchName: string }) {
    return this.api<{ id?: string; resource_id?: string; status?: string }>("/supersearch-enrichment/enrich-leads-from-supersearch", { method: "POST", body: JSON.stringify({ search_filters: { company_name: { include: input.companyNames, exclude: [] }, title: { include: input.titles, exclude: [] }, skip_owned_leads: true, show_one_lead_per_company: true }, limit: input.limit, resource_id: input.listId, search_name: input.searchName, work_email_enrichment: true, skip_rows_without_email: true, auto_update: false }) });
  }
  getSuperSearchEnrichment(id: string) { return this.api<Record<string, unknown>>(`/supersearch-enrichment/${encodeURIComponent(id)}`); }
  moveLeadsToList(ids: string[], campaignId: string, listId: string) { return this.api<Record<string, unknown>>("/leads/move", { method: "POST", body: JSON.stringify({ ids, campaign: campaignId, to_list_id: listId, check_duplicates: true }) }); }
  getBackgroundJob(id: string) { return this.api<Record<string, unknown>>(`/background-jobs/${encodeURIComponent(id)}`); }
  async waitForBackgroundJob(id: string) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const job = await this.getBackgroundJob(id);
      const status = String(job.status || "").trim().toLowerCase();
      if (["success", "completed", "complete"].includes(status)) return job;
      if (["failed", "error", "cancelled", "canceled"].includes(status)) throw new Error(`Instantly background job ${id} ended ${status}.`);
      await this.wait(Math.min(500 * (attempt + 1), 3_000));
    }
    throw new Error(`Instantly background job ${id} did not reach a terminal state within the bounded wait.`);
  }
  listWebhooks() { return this.api<unknown>("/webhooks?limit=100"); }
  listWebhookEventTypes() { return this.api<unknown>("/webhooks/event-types"); }
  async listRecentLeads(maximum = 500) {
    const items: Record<string, unknown>[] = [];
    let startingAfter = "";
    while (items.length < maximum) {
      const page = await this.api<{ items?: Record<string, unknown>[]; next_starting_after?: string }>("/leads/list", { method: "POST", body: JSON.stringify({ limit: Math.min(100, maximum - items.length), ...(startingAfter ? { starting_after: startingAfter } : {}) }) });
      const pageItems = Array.isArray(page.items) ? page.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
      items.push(...pageItems);
      const next = String(page.next_starting_after || "");
      if (!pageItems.length || !next || next === startingAfter) return { items, truncated: false };
      startingAfter = next;
    }
    return { items, truncated: true };
  }

  /** Staging is list-only. Campaign assignment remains impossible unless all live gates are true. */
  async createLeadInList(input: { email: string; firstName: string; lastName: string; companyName: string; listId: string; customVariables: Record<string, string> }) {
    if (!this.config.outboundEmailEnabled) throw new Error("Outbound lead handoff is disabled by OUTBOUND_EMAIL_ENABLED.");
    if (this.config.outboundEnabled) throw new Error("List staging refuses to run while outbound is enabled; campaign movement requires explicit approval.");
    return this.api<unknown>("/leads", { method: "POST", body: JSON.stringify({ email: input.email, first_name: input.firstName, last_name: input.lastName, company_name: input.companyName, list_id: input.listId, custom_variables: input.customVariables, skip_if_in_workspace: true, skip_if_in_list: true }) });
  }
  /** Used only by the explicit, exact controlled batch handler. It never runs
   * from scheduler replenishment or ordinary staging. */
  async createLeadInControlledCampaign(input: { email: string; firstName: string; lastName: string; companyName: string; jobTitle: string; campaignId: string; personalization: string; subject: string; sequenceId: string; segment: InstantlySegment; customVariables: Record<string, string> }, batchId: string) {
    if (!this.config.controlledBatchEnabled || !this.config.controlledBatchId || this.config.controlledBatchId !== batchId) throw new Error("Controlled outbound batch is not enabled for this exact batch ID.");
    assertInstantlyDeliveryOwner("INSTANTLY");
    assertInstantlyDeliveryEnabled(this.config, input.segment);
    const validated = validateInstantlyOutboundInput({ email: input.email, campaignId: input.campaignId, subject: input.subject, body: input.personalization, sequenceId: input.sequenceId });
    return this.api<{ id?: string; lead_id?: string }>("/leads", { method: "POST", body: JSON.stringify({ email: validated.email, first_name: input.firstName, last_name: input.lastName, company_name: input.companyName, job_title: input.jobTitle, campaign: validated.campaignId, personalization: validated.body, custom_variables: { ...input.customVariables, subjectLine: validated.subject }, skip_if_in_workspace: true, skip_if_in_campaign: true }) });
  }
  async findLeadByEmail(email: string, campaignId = "") {
    const normalized = normalizeOutboundEmail(email);
    const { items } = await this.listRecentLeads(500);
    return items.find((item) => normalizeOutboundEmail(String(item.email || "")) === normalized && (!campaignId || instantlyLeadCampaignId(item) === campaignId)) || null;
  }
  async activateControlledCampaign(campaignId: string, batchId: string) {
    if (!this.config.controlledBatchEnabled || !this.config.controlledBatchId || this.config.controlledBatchId !== batchId) throw new Error("Controlled outbound batch is not enabled for this exact batch ID.");
    return this.api<Record<string, unknown>>(`/campaigns/${encodeURIComponent(campaignId)}/activate`, { method: "POST" });
  }
  /** Pauses only an exact controlled campaign while a pre-send correction is
   * applied. The caller must read it back and explicitly resume it. */
  async pauseControlledCampaign(campaignId: string, batchId: string) {
    if (!this.config.controlledBatchEnabled || !this.config.controlledBatchId || this.config.controlledBatchId !== batchId) throw new Error("Controlled outbound batch is not enabled for this exact batch ID.");
    return this.api<Record<string, unknown>>(`/campaigns/${encodeURIComponent(campaignId)}/pause`, { method: "POST" });
  }
  async configureControlledCampaign(campaignId: string, patch: Record<string, unknown>, batchId: string) {
    if (!this.config.controlledBatchEnabled || !this.config.controlledBatchId || this.config.controlledBatchId !== batchId) throw new Error("Controlled outbound batch is not enabled for this exact batch ID.");
    return this.api<Record<string, unknown>>(`/campaigns/${encodeURIComponent(campaignId)}`, { method: "PATCH", body: JSON.stringify(patch) });
  }
  /** Repairs only a custom-variable value on an already-created member of the
   * exact controlled cohort. It cannot create, move, or activate a lead. */
  async patchControlledLeadVariables(leadId: string, customVariables: Record<string, string>, batchId: string) {
    if (!this.config.controlledBatchEnabled || !this.config.controlledBatchId || this.config.controlledBatchId !== batchId) throw new Error("Controlled outbound batch is not enabled for this exact batch ID.");
    return this.api<Record<string, unknown>>(`/leads/${encodeURIComponent(leadId)}`, { method: "PATCH", body: JSON.stringify({ custom_variables: customVariables }) });
  }
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : Number.isFinite(Number(value)) ? Number(value) : 0; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

/** Maps read-only v2 Lead state to one canonical transition. Repeated polls only
 * refresh provider metadata; they never duplicate a send or reply event. */
export function reconcileInstantlyLead(record: InstantlyIntegrationRecord, lead: Record<string, unknown>, now = new Date().toISOString()): InstantlyLeadPollingTransition {
  const summary = object(lead.status_summary);
  const lastStep = object(summary.lastStep);
  const providerStatus = number(lead.status);
  const replyCount = number(lead.email_reply_count);
  const interest = number(lead.lt_interest_status);
  const campaignId = text(lead.campaign) || record.instantlyCampaignId;
  const stepAt = text(lead.last_step_timestamp_executed) || text(lastStep.timestamp_executed);
  const stepFrom = text(lead.last_step_from) || text(lastStep.from);
  const providerUpdatedAt = text(lead.timestamp_updated);
  const base = {
    ...record,
    instantlyLeadId: text(lead.id) || record.instantlyLeadId,
    instantlyCampaignId: campaignId,
    lastInstantlySyncAt: now,
    lastProviderUpdatedAt: providerUpdatedAt || record.lastProviderUpdatedAt || now,
    lastKnownLeadStatus: String(providerStatus),
    lastKnownReplyCount: Math.max(record.lastKnownReplyCount || 0, replyCount),
    lastProcessedSequenceStatus: String(providerStatus),
    lastCampaignStepAt: stepAt || record.lastCampaignStepAt,
    updatedAt: now
  };
  const event = (type: InstantlyEventType, occurredAt: string) => applyInstantlyEvent(base, { id: `poll:${base.instantlyLeadId || base.email}:${type}:${occurredAt}`, type, instantlyLeadId: base.instantlyLeadId, email: base.email, occurredAt, campaignId, rawType: "polling" });
  if (providerStatus === -1) return { record: event("BOUNCE", providerUpdatedAt || now), event: "BOUNCE", suppressEmail: "hard_bounce" };
  if (providerStatus === -2) return { record: event("UNSUBSCRIBE", providerUpdatedAt || now), event: "UNSUBSCRIBE", suppressEmail: "unsubscribe" };
  if (lead.lt_interest_status !== undefined && lead.lt_interest_status !== null) {
    if ([1, 2, 3, 4].includes(interest)) return { record: event("INTERESTED", providerUpdatedAt || now), event: "INTERESTED", suppressEmail: null };
    if (interest === -1 || interest === -3) return { record: event("NOT_INTERESTED", providerUpdatedAt || now), event: "NOT_INTERESTED", suppressEmail: null };
    if (interest === -2) return { record: event("WRONG_PERSON", providerUpdatedAt || now), event: "WRONG_PERSON", suppressEmail: null };
    if (interest === 0) return { record: event("OUT_OF_OFFICE", providerUpdatedAt || now), event: "OUT_OF_OFFICE", suppressEmail: null };
  }
  if (replyCount > (record.lastKnownReplyCount || 0)) return { record: event("REPLY_RECEIVED", providerUpdatedAt || now), event: "REPLY_RECEIVED", suppressEmail: null };
  if (!record.firstSentAt && campaignId && stepAt && stepFrom.toLowerCase() === "campaign") return { record: { ...event("EMAIL_SENT", stepAt), sentAtSource: "INSTANTLY_LEAD_LAST_STEP_TIMESTAMP" }, event: "EMAIL_SENT", suppressEmail: null };
  if (providerStatus === 3 && replyCount === 0 && !record.replyReceivedAt) return { record: event("SEQUENCE_COMPLETED", providerUpdatedAt || now), event: "SEQUENCE_COMPLETED", suppressEmail: null };
  return { record: base, event: null, suppressEmail: null };
}

export function instantlyItems(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as Record<string, unknown>).items;
  return Array.isArray(items) ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

export function instantSafeSummary(value: unknown, fields: string[]) {
  return instantlyItems(value).map((item) => Object.fromEntries(fields.flatMap((field) => {
    const value = item[field];
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? [[field, value]] : [];
  })));
}

export function stagingEligibility(record: CanonicalGtmRecord, outreach: OutreachRecord[], config = instantlyConfig()) {
  if (!config.integrationEnabled) return { eligible: false, reason: "INTEGRATION_DISABLED" } as const;
  if (record.segment === "DIRECT" && !config.directEnabled) return { eligible: false, reason: "DIRECT_DISABLED" } as const;
  if (record.segment === "PARTNER" && !config.partnerEnabled) return { eligible: false, reason: "PARTNER_DISABLED" } as const;
  if (record.state !== "READY_TO_SEND") return { eligible: false, reason: "NOT_READY" } as const;
  if (!record.email || !record.contact) return { eligible: false, reason: "NO_CONTACT_ROUTE" } as const;
  if (record.verificationStatus !== "VERIFIED") return { eligible: false, reason: "EMAIL_NOT_PROVIDER_VERIFIED" } as const;
  if (record.priorContact || record.suppressionStatus !== "CLEAR") return { eligible: false, reason: "SUPPRESSED_OR_PRIOR_CONTACT" } as const;
  const gate = initialOutreachEligibility(outreach, { organization: record.organization, email: record.email, domain: record.organizationDomain, suppressionStatus: record.suppressionStatus === "CLEAR" ? "CLEAR" : "BLOCKED" });
  return gate === "ELIGIBLE_FOR_INITIAL_OUTREACH" ? { eligible: true, reason: "ELIGIBLE" } as const : { eligible: false, reason: gate } as const;
}

const webhookTypes: Record<string, InstantlyEventType> = {
  email_sent: "EMAIL_SENT", sent: "EMAIL_SENT", reply_received: "REPLY_RECEIVED", reply: "REPLY_RECEIVED",
  interested: "INTERESTED", positive_reply: "INTERESTED", not_interested: "NOT_INTERESTED",
  bounced: "BOUNCE", bounce: "BOUNCE", unsubscribed: "UNSUBSCRIBE", unsubscribe: "UNSUBSCRIBE",
  sequence_completed: "SEQUENCE_COMPLETED", campaign_completed: "SEQUENCE_COMPLETED", wrong_person: "WRONG_PERSON", out_of_office: "OUT_OF_OFFICE"
};

export function normalizeInstantlyWebhook(payload: unknown): InstantlyWebhookEvent | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const source = payload as Record<string, unknown>;
  const rawType = String(source.type || source.event_type || source.event || "").trim().toLowerCase();
  const type = webhookTypes[rawType];
  const data = source.data && typeof source.data === "object" ? source.data as Record<string, unknown> : source;
  const id = String(source.id || source.event_id || data.id || "").trim();
  const email = String(data.email || source.email || "").trim().toLowerCase();
  const instantlyLeadId = String(data.lead_id || data.leadId || source.lead_id || "").trim();
  if (!type || !id || (!email && !instantlyLeadId)) return null;
  return { id: id.slice(0, 180), type, instantlyLeadId: instantlyLeadId.slice(0, 180), email: email.slice(0, 320), occurredAt: String(data.timestamp || source.timestamp || new Date().toISOString()), campaignId: String(data.campaign_id || data.campaignId || source.campaign_id || "").slice(0, 180), rawType };
}

export function verifyInstantlyWebhookSignature(payload: Buffer, signature: string | undefined, secret: string) {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const actual = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

/** Instantly's Webhooks UI supports a static custom header; accept it over TLS
 * alongside signed payloads, with constant-time comparison and no fallback. */
export function verifyInstantlyWebhookToken(token: string | undefined, secret: string) {
  if (!token || !secret) return false;
  const actual = Buffer.from(token);
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function applyInstantlyEvent(record: InstantlyIntegrationRecord, event: InstantlyWebhookEvent): InstantlyIntegrationRecord {
  const at = event.occurredAt || new Date().toISOString();
  const updated = { ...record, updatedAt: new Date().toISOString(), lastInstantlySyncAt: at, instantlyCampaignId: event.campaignId || record.instantlyCampaignId };
  if (event.type === "EMAIL_SENT") return { ...updated, instantlySyncStatus: "SENT", firstSentAt: record.firstSentAt || at, lastSentAt: at };
  if (event.type === "REPLY_RECEIVED") return { ...updated, instantlySyncStatus: "REPLIED", replyReceivedAt: at, replyDisposition: "REPLIED" };
  if (event.type === "INTERESTED") return { ...updated, instantlySyncStatus: "POSITIVE", replyReceivedAt: record.replyReceivedAt || at, replyDisposition: "INTERESTED" };
  if (event.type === "NOT_INTERESTED" || event.type === "WRONG_PERSON") return { ...updated, instantlySyncStatus: "NOT_INTERESTED", replyDisposition: event.type };
  if (event.type === "BOUNCE") return { ...updated, instantlySyncStatus: "BOUNCED", bounceAt: at, failureReason: "HARD_BOUNCE" };
  if (event.type === "UNSUBSCRIBE") return { ...updated, instantlySyncStatus: "UNSUBSCRIBED", unsubscribeAt: at, failureReason: "UNSUBSCRIBED" };
  if (event.type === "SEQUENCE_COMPLETED") return { ...updated, instantlySyncStatus: "SEQUENCE_COMPLETE", sequenceCompletedAt: at };
  return { ...updated, replyDisposition: event.type };
}
