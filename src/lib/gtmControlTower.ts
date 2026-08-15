import { GTM_MODE, REQUIRED_ATTRIBUTION_FIELDS } from "./gtmShadow";

export const WEEKLY_PAYING_CUSTOMER_GOAL = 4;
export const ACQUISITION_CHANNEL_HYPOTHESES = [
  { key: "recent_grant_signals", label: "Recent-grant signal research", share: 45, mode: "SHADOW_RESEARCH", measurement: "qualified signal -> reviewed draft -> attributed signup -> subscription" },
  { key: "organic_ai_search", label: "Organic and AI search", share: 30, mode: "CONTENT_REVIEW", measurement: "article -> CTA -> signup -> subscription" },
  { key: "partners_referrals", label: "Partners and referrals", share: 15, mode: "RESEARCH_ONLY", measurement: "partner source -> introduction -> attributed signup -> subscription" },
  { key: "reddit_community", label: "Reddit and community", share: 7, mode: "MANUAL_ONLY", measurement: "manually approved referral -> attributed signup -> subscription" },
  { key: "linkedin", label: "LinkedIn", share: 3, mode: "MANUAL_ONLY", measurement: "manually approved referral -> attributed signup -> subscription" }
] as const;

export type AcquisitionChannelKey = typeof ACQUISITION_CHANNEL_HYPOTHESES[number]["key"];
export type AcquisitionEventName = "signal_detected" | "outreach_draft_prepared" | "site_visit" | "account_created" | "first_report_started" | "checkout_started" | "subscription_started";
export interface AcquisitionEvent {
  name: AcquisitionEventName;
  occurredAt: string;
  channel: AcquisitionChannelKey;
  attribution: Partial<Record<(typeof REQUIRED_ATTRIBUTION_FIELDS)[number], string>>;
}

export interface PartnerFitInput { nonprofitFocus: number; postAwardFit: number; portfolioAccess: number; publicEvidence: number; }

export function scorePartnerFit(input: PartnerFitInput) {
  const factors = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Math.max(0, Math.min(25, Math.round(value)))])) as Record<keyof PartnerFitInput, number>;
  return { total: Object.values(factors).reduce((sum, value) => sum + value, 0), factors, rationale: Object.entries(factors).map(([key, value]) => key + ":" + value + "/25") };
}

export function buildAcquisitionLearningSnapshot(events: AcquisitionEvent[]) {
  const byChannel = Object.fromEntries(ACQUISITION_CHANNEL_HYPOTHESES.map((channel) => [channel.key, { signals: 0, drafts: 0, visits: 0, signups: 0, activated: 0, checkouts: 0, subscriptions: 0 }])) as Record<AcquisitionChannelKey, { signals: number; drafts: number; visits: number; signups: number; activated: number; checkouts: number; subscriptions: number }>;
  for (const event of events) {
    const bucket = byChannel[event.channel];
    if (!bucket) continue;
    if (event.name === "signal_detected") bucket.signals++;
    if (event.name === "outreach_draft_prepared") bucket.drafts++;
    if (event.name === "site_visit") bucket.visits++;
    if (event.name === "account_created") bucket.signups++;
    if (event.name === "first_report_started") bucket.activated++;
    if (event.name === "checkout_started") bucket.checkouts++;
    if (event.name === "subscription_started") bucket.subscriptions++;
  }
  return { mode: GTM_MODE, goal: WEEKLY_PAYING_CUSTOMER_GOAL, hypotheses: ACQUISITION_CHANNEL_HYPOTHESES, byChannel };
}

export function outboundActionsAllowed() { return false as const; }
