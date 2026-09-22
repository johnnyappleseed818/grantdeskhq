import { campaignSenderAddresses, cleanCampaignStatusAllowsAutomaticDispatch, controlledCampaignSafetySummary, instantlyItems } from "./instantly.ts";
import type { InstantlyConfig } from "./instantly.ts";

/** The commercial ceiling is a target, never a permission to exceed a healthy
 * provider campaign or connected mailbox. Segment allocations guide sourcing
 * only; the dispatcher may use spare capacity in either segment. */
export const GTM_DAILY_INITIAL_SEND_TARGET = 300;
export const GTM_DIRECT_ALLOCATION_TARGET = 200;
export const GTM_PARTNER_ALLOCATION_TARGET = 100;

export type CapacitySegment = "DIRECT" | "PARTNER";

/** Reconciliation must use this authoritative configuration mapping. The
 * dashboard health summary intentionally exposes only mapping booleans and is
 * not a safe source for provider campaign identifiers. */
export function configuredCleanCampaignIds(config: Pick<InstantlyConfig, "directCampaignId" | "partnerCampaignId">): Record<CapacitySegment, string> {
  return { DIRECT: config.directCampaignId.trim(), PARTNER: config.partnerCampaignId.trim() };
}

export interface SegmentProviderCapacity {
  configuredCampaignLimit: number | null;
  readyMailboxCapacity: number;
  safeDailyCapacity: number;
  active: boolean;
  senderReady: boolean;
}

export interface InstantlyProviderCapacity {
  targetDailyCapacity: number;
  providerDailyCapacity: number;
  readyMailboxCount: number;
  configuredMailboxCount: number;
  sharedMailboxCount: number;
  unreadyMailboxCount: number;
  accountTypes: Record<string, number>;
  segments: Record<CapacitySegment, SegmentProviderCapacity>;
}

export type CampaignResponseShape = "ROOT" | "CAMPAIGN_WRAPPER" | "DATA_WRAPPER" | "ITEMS_WRAPPER" | "UNRECOGNIZED";

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(recordValue(entry))) : [];
}

/** Some Instantly v2 reads wrap a campaign in `campaign` or `data`, while
 * others return the campaign directly. Normalize only those documented object
 * envelopes; never infer a campaign from unrelated response data. */
export function campaignResponseCandidates(value: unknown): Array<{ shape: CampaignResponseShape; campaign: Record<string, unknown> }> {
  if (Array.isArray(value)) return recordArray(value).map((campaign) => ({ shape: "ITEMS_WRAPPER" as const, campaign }));
  const root = recordValue(value);
  if (!root) return [];
  const candidates: Array<{ shape: CampaignResponseShape; campaign: Record<string, unknown> }> = [{ shape: "ROOT", campaign: root }];
  const wrappedCampaign = recordValue(root.campaign);
  if (wrappedCampaign) candidates.push({ shape: "CAMPAIGN_WRAPPER", campaign: wrappedCampaign });
  const wrappedData = recordValue(root.data);
  if (wrappedData) candidates.push({ shape: "DATA_WRAPPER", campaign: wrappedData });
  for (const item of [...instantlyItems(value), ...recordArray(root.data), ...recordArray(root.campaigns)]) candidates.push({ shape: "ITEMS_WRAPPER", campaign: item });
  return candidates;
}

/** Safe diagnostic only: response envelope and returned campaign id are
 * sufficient to distinguish stale mappings from provider response changes.
 * It intentionally excludes senders, lead data, messages, and credentials. */
export function describeCampaignResponse(value: unknown, expectedCampaignId: string) {
  const candidates = campaignResponseCandidates(value);
  const matching = candidates.find(({ campaign }) => String(campaign.id || "") === expectedCampaignId);
  const first = candidates[0];
  const root = recordValue(value);
  return {
    shape: matching?.shape || first?.shape || "UNRECOGNIZED" as CampaignResponseShape,
    returnedCampaignId: String((matching || first)?.campaign.id || "").slice(0, 96) || null,
    idMatchesExpected: Boolean(matching),
    valueKind: Array.isArray(value) ? "ARRAY" : root ? "OBJECT" : value === null ? "NULL" : typeof value === "string" ? "STRING" : typeof value === "undefined" ? "UNDEFINED" : "OTHER",
    topLevelKeys: root ? Object.keys(root).sort().slice(0, 12) : []
  };
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function configuredDailyInitialSendTarget(env: NodeJS.ProcessEnv = process.env) {
  const configured = positiveInteger(env.GTM_INITIAL_SEND_DAILY_TARGET);
  return configured ? Math.min(GTM_DAILY_INITIAL_SEND_TARGET, configured) : GTM_DAILY_INITIAL_SEND_TARGET;
}

/** The same healthy mailbox may back both segments. Each campaign can therefore
 * receive the aggregate safe cap, while the dispatch controller's shared global
 * reservation remains the hard total. This avoids turning the 2:1 sourcing
 * allocation into a permanent per-segment sending ceiling. */
export function providerBackedCampaignLimit(capacity: Pick<InstantlyProviderCapacity, "providerDailyCapacity">) {
  return Math.max(0, Math.min(GTM_DAILY_INITIAL_SEND_TARGET, capacity.providerDailyCapacity));
}

export function providerAccountIsReady(account: Record<string, unknown>) {
  return Number(account.status) === 1
    && Number(account.warmup_status) === 1
    && account.setup_pending !== true
    && !String(account.e_message || "").trim();
}

/** The configured Clean mapping is authoritative. A paginated workspace list
 * is a fallback for telemetry only and must never erase a successfully read
 * mapped campaign. */
export function resolveMappedCampaign(explicit: unknown, listed: unknown, campaignId: string) {
  const explicitCampaign = campaignResponseCandidates(explicit).find(({ campaign }) => String(campaign.id || "") === campaignId)?.campaign;
  if (explicitCampaign) return explicitCampaign;
  return instantlyItems(listed).find((campaign): campaign is Record<string, unknown> => Boolean(campaign) && typeof campaign === "object" && String(campaign.id || "") === campaignId) || null;
}

function normalizedEmail(value: unknown) { return typeof value === "string" ? value.trim().toLowerCase() : ""; }

function accountDailyCapacity(account: Record<string, unknown>) {
  return positiveInteger(account.daily_limit) || positiveInteger(account.warmup_limit) || 0;
}

function campaignDailyCapacity(campaign: Record<string, unknown> | null) {
  if (!campaign) return null;
  const summary = controlledCampaignSafetySummary(campaign);
  return positiveInteger(summary.dailyMaxLeads) || positiveInteger(summary.dailyLimit);
}

/** Converts provider responses into an aggregate-only capacity model. The
 * unique mailbox set prevents Direct and Partner from double-counting a shared
 * sender; an unknown or unhealthy sender supplies zero capacity. */
export function calculateInstantlyProviderCapacity(input: {
  accounts: unknown;
  directCampaign: Record<string, unknown> | null;
  partnerCampaign: Record<string, unknown> | null;
  env?: NodeJS.ProcessEnv;
}): InstantlyProviderCapacity {
  const accounts = instantlyItems(input.accounts).filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object");
  const accountPairs = accounts.map((account): [string, Record<string, unknown>] => [normalizedEmail(account.email), account]).filter(([email]) => Boolean(email));
  const byEmail = new Map<string, Record<string, unknown>>(accountPairs);
  const campaignBySegment: Record<CapacitySegment, Record<string, unknown> | null> = { DIRECT: input.directCampaign, PARTNER: input.partnerCampaign };
  const allConfiguredSenders = new Set<string>();
  const senderUseCount = new Map<string, number>();

  for (const campaign of Object.values(campaignBySegment)) {
    for (const sender of campaign ? campaignSenderAddresses(campaign) : []) {
      allConfiguredSenders.add(sender);
      senderUseCount.set(sender, (senderUseCount.get(sender) || 0) + 1);
    }
  }

  const readyMailboxCapacity = [...allConfiguredSenders].reduce((total, email) => {
    const account = byEmail.get(email);
    return total + (account && providerAccountIsReady(account) ? accountDailyCapacity(account) : 0);
  }, 0);
  const segments = Object.fromEntries((Object.entries(campaignBySegment) as Array<[CapacitySegment, Record<string, unknown> | null]>).map(([segment, campaign]) => {
    const senders = campaign ? campaignSenderAddresses(campaign) : [];
    const accountsForCampaign = senders.map((sender) => byEmail.get(sender)).filter((account): account is Record<string, unknown> => Boolean(account));
    const senderReady = senders.length > 0 && accountsForCampaign.length === senders.length && accountsForCampaign.every(providerAccountIsReady);
    const mailboxCapacity = senderReady ? accountsForCampaign.reduce((total, account) => total + accountDailyCapacity(account), 0) : 0;
    const configuredCampaignLimit = campaignDailyCapacity(campaign);
    const active = Number(campaign?.status) === 1;
    // A completed Clean campaign is intentionally inactive until the
    // server-authoritative dispatch controller has an eligible decision inside
    // the sending window.  It is nevertheless a reusable, safely activatable
    // campaign.  Treating it as zero capacity makes that controller unable to
    // reach the guarded activation step at all.  An explicitly paused campaign
    // remains zero-capacity and therefore fail-closed.
    const dispatchable = cleanCampaignStatusAllowsAutomaticDispatch(Number(campaign?.status));
    const safeDailyCapacity = dispatchable && senderReady && configuredCampaignLimit ? Math.min(configuredCampaignLimit, mailboxCapacity, configuredDailyInitialSendTarget(input.env)) : 0;
    return [segment, { configuredCampaignLimit, readyMailboxCapacity: mailboxCapacity, safeDailyCapacity, active, senderReady } satisfies SegmentProviderCapacity];
  })) as Record<CapacitySegment, SegmentProviderCapacity>;
  const accountTypes = accounts.reduce<Record<string, number>>((summary, account) => {
    const type = String(account.account_type || account.type || account.provider || "unspecified").trim().toLowerCase().slice(0, 48) || "unspecified";
    summary[type] = (summary[type] || 0) + 1;
    return summary;
  }, {});
  const readyMailboxCount = [...allConfiguredSenders].filter((email) => {
    const account = byEmail.get(email);
    return Boolean(account && providerAccountIsReady(account) && accountDailyCapacity(account) > 0);
  }).length;
  return {
    targetDailyCapacity: configuredDailyInitialSendTarget(input.env),
    providerDailyCapacity: Math.min(configuredDailyInitialSendTarget(input.env), readyMailboxCapacity),
    readyMailboxCount,
    configuredMailboxCount: allConfiguredSenders.size,
    sharedMailboxCount: [...senderUseCount.values()].filter((count) => count > 1).length,
    unreadyMailboxCount: Math.max(0, allConfiguredSenders.size - readyMailboxCount),
    accountTypes,
    segments
  };
}
