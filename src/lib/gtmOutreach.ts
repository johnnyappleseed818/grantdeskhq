export type OutreachType = "DIRECT_NONPROFIT" | "PARTNER";
export type OutreachStatus = "SENT" | "REPLIED" | "POSITIVE_REPLY" | "FREE_FIRST_AWARD" | "ACTIVATED" | "PAID" | "CLOSED";
export type OutreachSuppressionState = "CLEAR" | "BLOCKED" | "UNSUBSCRIBED" | "DO_NOT_CONTACT" | "OPT_OUT" | "BOUNCE_SUPPRESSION" | "NEGATIVE_RESPONSE_DO_NOT_CONTACT";
export type FollowUpState = "INITIAL_SENT" | "FOLLOW_UP_1_DUE" | "FOLLOW_UP_1_SENT" | "FOLLOW_UP_2_DUE" | "FOLLOW_UP_2_SENT" | "SEQUENCE_COMPLETE" | "REPLIED" | "POSITIVE" | "NEGATIVE" | "SUPPRESSED" | "FOLLOW_UP_DATE_UNKNOWN";
export type ManualOutreachAction = "FOLLOW_UP_1_SENT" | "FOLLOW_UP_2_SENT" | "MARK_REPLIED" | "MARK_POSITIVE" | "MARK_NEGATIVE" | "SUPPRESS";

/** Manual-only policy. A send event must be recorded by an operator; this module never sends email. */
export const MANUAL_FOLLOW_UP_POLICY = {
  firstFollowUpBusinessDays: 4,
  secondFollowUpBusinessDaysAfterFirst: 7,
  automaticEmailSending: false
} as const;


export interface OutreachRecord {
  id: string;
  organization: string;
  contact: string;
  persona: string;
  email: string | null;
  type: OutreachType;
  whyNowSignal: string | null;
  signalSource: string | null;
  canonicalOpportunityId: string | null;
  /** A human-confirmed outreach event is canonical even before a scanner card is linked. */
  canonicalRecordStatus: "LINKED" | "HUMAN_CONFIRMED_CANONICAL";
  initialOutreachGuard: "DO_NOT_SEND_NEW_INITIAL_OUTREACH";
  sentAt: string | null;
  sentTimePrecision: "DATE_CONFIRMED" | "DATE_NOT_RECORDED";
  status: OutreachStatus;
  lastContactAt: string | null;
  nextAction: "AWAIT_RESPONSE" | "MANUAL_FOLLOW_UP_1" | "MANUAL_FOLLOW_UP_2" | "REPLY_REQUIRES_RESPONSE" | "HUMAN_REVIEW_REQUIRED" | "NONE";
  followUpDueAt: string | null;
  followUpState: FollowUpState;
  followUp1DueAt: string | null;
  followUp1SentAt: string | null;
  followUp2DueAt: string | null;
  followUp2SentAt: string | null;
  suppressionStatus: OutreachSuppressionState;
  replied: boolean;
  replySentiment: "NONE" | "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  trial: boolean;
  customer: boolean;
  notes: string;
  source: "HUMAN_CONFIRMED_OUTREACH";
  createdAt: string | null;
  updatedAt: string | null;
}

const august17 = "2026-08-17T00:00:00.000Z";
const august18 = "2026-08-18T00:00:00.000Z";

function record(input: Pick<OutreachRecord, "id" | "organization" | "contact" | "persona" | "email" | "type" | "canonicalOpportunityId" | "whyNowSignal" | "signalSource" | "notes"> & { sentAt?: string | null }): OutreachRecord {
  const sentAt = input.sentAt === undefined ? august17 : input.sentAt;
  return {
    ...input,
    canonicalRecordStatus: input.canonicalOpportunityId ? "LINKED" : "HUMAN_CONFIRMED_CANONICAL",
    initialOutreachGuard: "DO_NOT_SEND_NEW_INITIAL_OUTREACH",
    sentAt,
    sentTimePrecision: sentAt ? "DATE_CONFIRMED" : "DATE_NOT_RECORDED",
    status: "SENT",
    lastContactAt: sentAt,
    nextAction: "AWAIT_RESPONSE",
    followUpDueAt: null,
    followUpState: sentAt ? "INITIAL_SENT" : "FOLLOW_UP_DATE_UNKNOWN",
    followUp1DueAt: null,
    followUp1SentAt: null,
    followUp2DueAt: null,
    followUp2SentAt: null,
    suppressionStatus: "CLEAR",
    replied: false,
    replySentiment: "NONE",
    trial: false,
    customer: false,
    source: "HUMAN_CONFIRMED_OUTREACH",
    createdAt: sentAt,
    updatedAt: sentAt
  };
}

const direct = (id: string, organization: string, contact: string, persona: string, email: string, canonicalOpportunityId: string | null, whyNowSignal: string | null, signalSource: string | null, sentAt: string | null = august17) => record({ id, organization, contact, persona, email, type: "DIRECT_NONPROFIT", canonicalOpportunityId, whyNowSignal, signalSource, sentAt, notes: "Human-confirmed direct nonprofit outreach. Delivery, opens, replies, follow-up dates, trials, and payment outcomes are not inferred." });
const partner = (id: string, organization: string, contact: string, persona: string, email: string, sentAt: string | null = august17) => record({ id, organization, contact, persona, email, type: "PARTNER", canonicalOpportunityId: null, whyNowSignal: null, signalSource: null, sentAt, notes: "Human-confirmed partner outreach. Delivery, opens, replies, follow-up dates, trials, and payment outcomes are not inferred." });

/** Immutable human-confirmed initial-outreach ledger. It neither sends nor schedules outreach. */
export const confirmedHumanOutreach: OutreachRecord[] = [
  direct("outreach_direct_johnson_creek_20260817", "Johnson Creek Watershed Council", "Jennifer Hamilton", "Nonprofit contact", "jennifer@jcwc.org", null, null, null),
  direct("outreach_direct_child_enrichment_20260817", "Child Enrichment", "Kari Viola-Brooke", "Nonprofit contact", "kviola@childenrichment.org", null, null, null),
  direct("outreach_direct_foodlink_20260817", "Foodlink", "Terra Keller", "Nonprofit contact", "tkeller@foodlinkny.org", null, null, null),
  direct("outreach_direct_sustainable_food_center_20260817", "Sustainable Food Center", "Anthony Cordova / Nicole Thompson route", "Finance / Grants route", "info@sustainablefoodcenter.org", "job-sustainable-food-center-2026", "Hiring a Grants Manager to coordinate reporting across program, finance, and data teams.", "https://careers.wgu.edu/jobs/sustainable-food-center-grants-manager/"),
  direct("outreach_direct_junior_achievement_20260817", "Junior Achievement of South Florida", "Finance team route", "Finance team", "info@jasouthflorida.org", "job-ja-south-florida-2026", "Hiring a Grant Accountant for the post-award financial lifecycle and funder-specific reporting templates.", "https://recruiting.paylocity.com/recruiting/jobs/Details/4290195/Junior-Achievement-South-Florida/Grant-Accountant"),
  direct("outreach_direct_project_oceanology_20260818", "Project Oceanology", "Lisa Colón", "Accounts Manager", "lmcolon@oceanology.org", "award-project-oceanology-2026", "Federal marine-science grant record detected.", "https://www.usaspending.gov/award/ASST_NON_NA26NMFX469G0026_013/", august18),
  direct("outreach_direct_rodale_20260818", "Rodale Institute", "Elaine Macbeth", "Chief Finance and Administration Officer", "elaine.macbeth@rodaleinstitute.org", "job-rodale-2026", "Hiring a Grants Accountant reporting to the CFO.", "https://rodaleinstitute.org/employment/grants-accountant/", august18),
  partner("outreach_partner_21_light_20260817", "21 Light Accounting", "Joshua Gonzales", "Partner / fractional CFO", "josh@21lightstreet.com"),
  partner("outreach_partner_vault_20260817", "Vault Consulting", "Chris Rauch", "Partner / fractional CFO", "crauch@vaultconsulting.com"),
  partner("outreach_partner_goldin_20260817", "Goldin Group", "Alicia Coleman", "Partner / fractional CFO", "acoleman@goldingroup.biz"),
  partner("outreach_partner_baas_20260817", "BAAS Advisory", "Brad Reigner", "Partner / fractional CFO", "brad@baasllccpa.com"),
  partner("outreach_partner_cfo_leverage_20260817", "CFO Leverage", "Sam Coates", "Partner / fractional CFO", "sc@cfoleverage.com"),
  partner("outreach_partner_closing_your_books_confirmed", "Closing Your Books", "Lozelle Mathai", "Partner / accounting firm", "lozelle@closingyourbooks.com", null),
  partner("outreach_partner_nfo_confirmed", "NFO — Nonprofit Financial Outsourcing", "NFO team", "Partner / financial outsourcing", "info@nfoyourcfo.com", null),
  partner("outreach_partner_your_cfo_friend_confirmed", "Your CFO Friend", "Bee", "Partner / fractional CFO", "hello@yourcfofriend.com", null),
  partner("outreach_partner_platinum_cfo_confirmed", "Platinum CFO", "Sharon Gubinsky / team", "Partner / fractional CFO", "info@platinumcfo.com", null),
  partner("outreach_partner_crown_cfo_confirmed", "Crown CFO", "Mike DeMaio", "Partner / fractional CFO", "mike@crowncfo.com", null)
];

const organizationAliases: Record<string, string> = {
  "interdistrict committee for project oceanology": "project oceanology",
  "nfo": "nfo nonprofit financial outsourcing",
  "nfo your cfo": "nfo nonprofit financial outsourcing",
  "21 light street": "21 light accounting",
  "baas llc cpa": "baas advisory",
  "platinum cfo llc": "platinum cfo",
  "crown cfo llc": "crown cfo"
};

export function normalizeOutreachOrganization(value: string) {
  const normalized = value.toLowerCase().replace(/\b(the|inc|incorporated|corp|corporation|co|company|foundation)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  return organizationAliases[normalized] || normalized;
}

function normalizeDomain(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return raw.includes("@") ? raw.split("@").at(-1)! : raw;
}

export interface InitialOutreachCandidate { organization: string; email?: string | null; domain?: string | null; suppressionStatus?: OutreachSuppressionState; instantlyInitialOutreachRecorded?: boolean; }
export type InitialOutreachEligibility = "ELIGIBLE_FOR_INITIAL_OUTREACH" | "DO_NOT_SEND_NEW_INITIAL_OUTREACH" | "SUPPRESSED_DO_NOT_CONTACT" | "SEPARATE_HUMAN_AUTHORIZATION_REQUIRED";

function strongSuppression(value: OutreachSuppressionState | undefined) {
  return value === "BLOCKED" || value === "UNSUBSCRIBED" || value === "DO_NOT_CONTACT" || value === "OPT_OUT" || value === "BOUNCE_SUPPRESSION" || value === "NEGATIVE_RESPONSE_DO_NOT_CONTACT";
}

/** Fail-closed guard shared by manual imports, scans, and a future Instantly handoff. */
export function initialOutreachEligibility(records: OutreachRecord[], candidate: InitialOutreachCandidate, event: "INITIAL" | "FOLLOW_UP" = "INITIAL"): InitialOutreachEligibility {
  if (strongSuppression(candidate.suppressionStatus)) return "SUPPRESSED_DO_NOT_CONTACT";
  if (event === "FOLLOW_UP") return "SEPARATE_HUMAN_AUTHORIZATION_REQUIRED";
  if (candidate.instantlyInitialOutreachRecorded) return "DO_NOT_SEND_NEW_INITIAL_OUTREACH";
  const organization = normalizeOutreachOrganization(candidate.organization);
  const email = candidate.email?.trim().toLowerCase();
  const domain = normalizeDomain(candidate.domain || candidate.email);
  return records.some((existing) => existing.initialOutreachGuard === "DO_NOT_SEND_NEW_INITIAL_OUTREACH" && (
    normalizeOutreachOrganization(existing.organization) === organization ||
    Boolean(email && existing.email?.toLowerCase() === email) ||
    Boolean(domain && normalizeDomain(existing.email) === domain)
  )) ? "DO_NOT_SEND_NEW_INITIAL_OUTREACH" : "ELIGIBLE_FOR_INITIAL_OUTREACH";
}
function utcDay(value: string | Date) {
  const parsed = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function isoMidnight(value: Date) {
  return value.toISOString().replace(/T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "T00:00:00.000Z");
}

/** Adds weekdays only; Saturday and Sunday never advance a manual deadline. */
export function addBusinessDays(value: string | Date, businessDays: number) {
  const date = utcDay(value);
  let remaining = Math.max(0, Math.floor(businessDays));
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining -= 1;
  }
  return isoMidnight(date);
}

/**
 * Derives a manual daily queue from factual send timestamps. It never sends
 * mail, invents a send date, or relaxes first-touch suppression and dedupe.
 */
export function applyManualFollowUpCadence(records: OutreachRecord[], referenceDate: string | Date = new Date()): OutreachRecord[] {
  const reference = utcDay(referenceDate).getTime();
  return records.map((record) => {
    if (strongSuppression(record.suppressionStatus)) return { ...record, followUpState: "SUPPRESSED", followUpDueAt: null, nextAction: "NONE" };
    if (record.replySentiment === "NEGATIVE") return { ...record, followUpState: "NEGATIVE", followUpDueAt: null, nextAction: "NONE" };
    if (record.replySentiment === "POSITIVE") return { ...record, followUpState: "POSITIVE", followUpDueAt: null, nextAction: "REPLY_REQUIRES_RESPONSE" };
    if (record.replied) return { ...record, followUpState: "REPLIED", followUpDueAt: null, nextAction: "REPLY_REQUIRES_RESPONSE" };
    if (!record.sentAt) return { ...record, followUpState: "FOLLOW_UP_DATE_UNKNOWN", followUpDueAt: null, followUp1DueAt: null, followUp2DueAt: null, nextAction: "HUMAN_REVIEW_REQUIRED" };
    const followUp1DueAt = addBusinessDays(record.sentAt, MANUAL_FOLLOW_UP_POLICY.firstFollowUpBusinessDays);
    if (!record.followUp1SentAt) {
      const isDue = utcDay(followUp1DueAt).getTime() <= reference;
      return { ...record, followUpState: isDue ? "FOLLOW_UP_1_DUE" : "INITIAL_SENT", followUpDueAt: followUp1DueAt, followUp1DueAt, followUp2DueAt: null, nextAction: isDue ? "MANUAL_FOLLOW_UP_1" : "AWAIT_RESPONSE" };
    }
    const followUp2DueAt = addBusinessDays(record.followUp1SentAt, MANUAL_FOLLOW_UP_POLICY.secondFollowUpBusinessDaysAfterFirst);
    if (record.followUp2SentAt) return { ...record, followUpState: "SEQUENCE_COMPLETE", followUpDueAt: null, followUp1DueAt, followUp2DueAt, nextAction: "NONE" };
    const isDue = utcDay(followUp2DueAt).getTime() <= reference;
    return { ...record, followUpState: isDue ? "FOLLOW_UP_2_DUE" : "FOLLOW_UP_1_SENT", followUpDueAt: followUp2DueAt, followUp1DueAt, followUp2DueAt, nextAction: isDue ? "MANUAL_FOLLOW_UP_2" : "AWAIT_RESPONSE" };
  });
}

/** Records only a human-confirmed internal state change; no email transport is invoked. */
export function applyManualOutreachAction(record: OutreachRecord, action: ManualOutreachAction, at: string): OutreachRecord {
  if (!Number.isFinite(Date.parse(at)) || strongSuppression(record.suppressionStatus) || record.replied) return record;
  if (action === "FOLLOW_UP_1_SENT") return { ...record, followUp1SentAt: at, lastContactAt: at, followUpState: "FOLLOW_UP_1_SENT", followUpDueAt: null, updatedAt: at };
  if (action === "FOLLOW_UP_2_SENT") return { ...record, followUp2SentAt: at, lastContactAt: at, followUpState: "FOLLOW_UP_2_SENT", followUpDueAt: null, updatedAt: at };
  if (action === "MARK_POSITIVE") return { ...record, status: "POSITIVE_REPLY", replied: true, replySentiment: "POSITIVE", followUpState: "POSITIVE", followUpDueAt: null, nextAction: "REPLY_REQUIRES_RESPONSE", updatedAt: at };
  if (action === "MARK_NEGATIVE") return { ...record, status: "CLOSED", replied: true, replySentiment: "NEGATIVE", suppressionStatus: "NEGATIVE_RESPONSE_DO_NOT_CONTACT", followUpState: "NEGATIVE", followUpDueAt: null, nextAction: "NONE", updatedAt: at };
  if (action === "SUPPRESS") return { ...record, status: "CLOSED", suppressionStatus: "DO_NOT_CONTACT", followUpState: "SUPPRESSED", followUpDueAt: null, nextAction: "NONE", updatedAt: at };
  return { ...record, status: "REPLIED", replied: true, replySentiment: "NEUTRAL", followUpState: "REPLIED", followUpDueAt: null, nextAction: "REPLY_REQUIRES_RESPONSE", updatedAt: at };
}


export function mergeOutreachRecords(existing: OutreachRecord[], incoming: OutreachRecord[]) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) => (left.sentAt || "").localeCompare(right.sentAt || "") || left.id.localeCompare(right.id));
}

export function outreachOrganizations(records: OutreachRecord[], type: OutreachType) {
  return [...new Set(records.filter((item) => item.type === type).map((item) => normalizeOutreachOrganization(item.organization)))];
}

export function outreachCount(records: OutreachRecord[], type?: OutreachType) { return records.filter((item) => !type || item.type === type).length; }

export interface OutreachMetrics { totalSent: number; directSent: number; partnerSent: number; uniqueOrganizationsContacted: number; directUniqueOrganizationsContacted: number; partnerUniqueOrganizationsContacted: number; awaitingResponse: number; replied: number; trials: number; customers: number; }
export interface OutreachControlPlaneLink { recordId: string; canonicalOpportunityId: string | null; status: OutreachRecord["canonicalRecordStatus"]; }

/** Counts explicit send events independently of current reply/trial/customer outcome. */
export function summarizeOutreach(records: OutreachRecord[]): OutreachMetrics {
  return {
    totalSent: records.length,
    directSent: records.filter((item) => item.type === "DIRECT_NONPROFIT").length,
    partnerSent: records.filter((item) => item.type === "PARTNER").length,
    uniqueOrganizationsContacted: new Set(records.map((item) => normalizeOutreachOrganization(item.organization))).size,
    directUniqueOrganizationsContacted: new Set(records.filter((item) => item.type === "DIRECT_NONPROFIT").map((item) => normalizeOutreachOrganization(item.organization))).size,
    partnerUniqueOrganizationsContacted: new Set(records.filter((item) => item.type === "PARTNER").map((item) => normalizeOutreachOrganization(item.organization))).size,
    awaitingResponse: records.filter((item) => item.nextAction === "AWAIT_RESPONSE" && !item.replied).length,
    replied: records.filter((item) => item.replied).length,
    trials: records.filter((item) => item.trial).length,
    customers: records.filter((item) => item.customer).length
  };
}

export function reconcileOutreachControlPlane(records: OutreachRecord[], canonicalOpportunityIds: readonly string[]): OutreachControlPlaneLink[] {
  const canonicalIds = new Set(canonicalOpportunityIds);
  return records.map((item) => ({
    recordId: item.id,
    canonicalOpportunityId: item.canonicalOpportunityId,
    status: item.canonicalOpportunityId && canonicalIds.has(item.canonicalOpportunityId) ? "LINKED" : "HUMAN_CONFIRMED_CANONICAL"
  }));
}
