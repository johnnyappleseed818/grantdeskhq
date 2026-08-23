import { createHmac, timingSafeEqual } from "node:crypto";
import type { CanonicalGtmRecord } from "../src/lib/gtmCanonical.ts";
import { initialOutreachEligibility, type OutreachRecord } from "../src/lib/gtmOutreach.ts";

const apiBase = "https://api.instantly.ai/api/v2";

export type InstantlySegment = "DIRECT" | "PARTNER";
export type InstantlySyncStatus = "PREVIEW_ONLY" | "STAGED" | "APPROVED_FOR_CAMPAIGN" | "IN_CAMPAIGN" | "SENT" | "REPLIED" | "POSITIVE" | "NOT_INTERESTED" | "BOUNCED" | "UNSUBSCRIBED" | "SEQUENCE_COMPLETE" | "ERROR";
export type InstantlyEventType = "EMAIL_SENT" | "REPLY_RECEIVED" | "INTERESTED" | "NOT_INTERESTED" | "BOUNCE" | "UNSUBSCRIBE" | "SEQUENCE_COMPLETED" | "WRONG_PERSON" | "OUT_OF_OFFICE";

export interface InstantlyConfig {
  integrationEnabled: boolean;
  outboundEnabled: boolean;
  autoHandoffEnabled: boolean;
  directEnabled: boolean;
  partnerEnabled: boolean;
  firstTouchLinkEnabled: boolean;
  apiKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  directListId: string;
  partnerListId: string;
  directCampaignId: string;
  partnerCampaignId: string;
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
  failureReason: string;
  createdAt: string;
  updatedAt: string;
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

export function instantlyConfig(env: NodeJS.ProcessEnv = process.env): InstantlyConfig {
  const enabled = (name: string) => env[name] === "true";
  return {
    integrationEnabled: enabled("INSTANTLY_INTEGRATION_ENABLED"),
    outboundEnabled: enabled("INSTANTLY_OUTBOUND_ENABLED"),
    autoHandoffEnabled: enabled("INSTANTLY_AUTO_HANDOFF_ENABLED"),
    directEnabled: enabled("DIRECT_INSTANTLY_ENABLED"),
    partnerEnabled: enabled("PARTNER_INSTANTLY_ENABLED"),
    firstTouchLinkEnabled: enabled("GTM_FIRST_TOUCH_LINK_ENABLED"),
    apiKeyConfigured: Boolean(env.INSTANTLY_API_KEY?.trim()),
    webhookSecretConfigured: Boolean(env.INSTANTLY_WEBHOOK_SECRET?.trim()),
    directListId: String(env.INSTANTLY_DIRECT_LIST_ID || "").trim(),
    partnerListId: String(env.INSTANTLY_PARTNER_LIST_ID || "").trim(),
    directCampaignId: String(env.INSTANTLY_DIRECT_CAMPAIGN_ID || "").trim(),
    partnerCampaignId: String(env.INSTANTLY_PARTNER_CAMPAIGN_ID || "").trim()
  };
}

export function instantlyHealth(config = instantlyConfig()) {
  return {
    integrationEnabled: config.integrationEnabled,
    apiKeyConfigured: config.apiKeyConfigured,
    webhookSecretConfigured: config.webhookSecretConfigured,
    outboundEnabled: config.outboundEnabled,
    autoHandoffEnabled: config.autoHandoffEnabled,
    directEnabled: config.directEnabled,
    partnerEnabled: config.partnerEnabled,
    firstTouchLinkEnabled: config.firstTouchLinkEnabled,
    mappings: {
      directList: Boolean(config.directListId), partnerList: Boolean(config.partnerListId),
      directCampaign: Boolean(config.directCampaignId), partnerCampaign: Boolean(config.partnerCampaignId)
    },
    status: config.apiKeyConfigured && config.integrationEnabled ? "CONFIGURED" : "WAITING_FOR_API_KEY"
  };
}

export function instantlyPreviewRecord(record: CanonicalGtmRecord, now = new Date().toISOString()): InstantlyIntegrationRecord {
  const contactId = `${record.organizationId}:${record.email || record.contact || "unresolved"}`;
  return {
    id: `instantly_${record.organizationId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)}_${(record.email || "none").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40)}`,
    canonicalOrganizationId: record.organizationId, canonicalContactId: contactId, organization: record.organization, contact: record.contact || "", email: record.email || "",
    segment: record.segment, source: record.sourceUrl, signalType: record.partnerType || record.segment, whyNowOrFit: record.whyNow,
    instantlyListId: "", instantlyCampaignId: "", instantlyLeadId: "", instantlySyncStatus: "PREVIEW_ONLY",
    firstSentAt: "", lastSentAt: "", replyReceivedAt: "", replyDisposition: "", bounceAt: "", unsubscribeAt: "", sequenceCompletedAt: "",
    productAttributionId: "", freeFirstAwardStartedAt: "", reportGeneratedAt: "", paidAt: "", messageVersion: "benefit-led-v1", lastInstantlySyncAt: "", failureReason: "API_KEY_NOT_CONFIGURED", createdAt: now, updatedAt: now
  };
}

/** No request can be made until integration is deliberately enabled and keyed. */
export class InstantlyClient {
  private readonly config: InstantlyConfig;
  private readonly apiKey: string;
  private readonly request: typeof fetch;

  constructor(config = instantlyConfig(), apiKey = process.env.INSTANTLY_API_KEY || "", request: typeof fetch = fetch) {
    this.config = config;
    this.apiKey = apiKey;
    this.request = request;
  }

  private assertReadable() {
    if (!this.config.integrationEnabled || !this.apiKey.trim()) throw new Error("Instantly API is not configured.");
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertReadable();
    const response = await this.request(`${apiBase}${path}`, {
      ...init,
      headers: { "Authorization": `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...init.headers }
    });
    if (!response.ok) throw new Error(`Instantly API request failed (${response.status}).`);
    return response.json() as Promise<T>;
  }

  listLeadLists() { return this.api<unknown>("/lead-lists?limit=100"); }
  createLeadList(name: string) { return this.api<{ id?: string; name?: string }>("/lead-lists", { method: "POST", body: JSON.stringify({ name }) }); }
  listWorkspaces() { return this.api<unknown>("/workspaces?limit=100"); }
  listCampaigns() { return this.api<unknown>("/campaigns?limit=100"); }
  listAccounts() { return this.api<unknown>("/accounts?limit=100"); }
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
    if (this.config.outboundEnabled) throw new Error("List staging refuses to run while outbound is enabled; campaign movement requires explicit approval.");
    return this.api<unknown>("/leads", { method: "POST", body: JSON.stringify({ email: input.email, first_name: input.firstName, last_name: input.lastName, company_name: input.companyName, list_id: input.listId, custom_variables: input.customVariables, skip_if_in_workspace: true, skip_if_in_list: true }) });
  }
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
