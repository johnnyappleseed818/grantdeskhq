export type OutreachType = "DIRECT_NONPROFIT" | "PARTNER";
export type OutreachStatus = "SENT" | "REPLIED" | "POSITIVE_REPLY" | "FREE_FIRST_AWARD" | "ACTIVATED" | "PAID" | "CLOSED";
export type HumanOutreachSender = "HUMAN_FOUNDER";
export type OutreachChannel = "EMAIL";
export type FollowUpStage = "INITIAL" | "FIRST_SENT" | "SECOND_SENT" | "FINAL_CLOSE_SENT" | "CANCELLED_BY_REPLY";
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
  canonicalRecordStatus: "LINKED" | "PENDING_CANONICAL_LEAD_LINK";
  initialOutreachGuard: "DO_NOT_SEND_NEW_INITIAL_OUTREACH";
  sentAt: string | null;
  sentTimePrecision: "DATE_CONFIRMED" | "DATE_NOT_RECORDED";
  status: OutreachStatus;
  lastContactAt: string | null;
  nextAction: "AWAIT_RESPONSE";
  followUpDueAt: string | null;
  secondFollowUpDueAt?: string | null;
  finalCloseDueAt?: string | null;
  followUpStage?: FollowUpStage;
  sentBy?: HumanOutreachSender | null;
  channel?: OutreachChannel | null;
  messageVariant?: string | null;
  replied: boolean;
  replySentiment: "NONE" | "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  trial: boolean;
  customer: boolean;
  notes: string;
  source: "HUMAN_CONFIRMED_OUTREACH";
  createdAt: string;
  updatedAt: string;
}

const august17 = "2026-08-17T00:00:00.000Z";
const august18 = "2026-08-18T00:00:00.000Z";
const august23FounderSend = "2026-08-23T13:03:25.000Z";
function humanConfirmedRecord(input: Omit<OutreachRecord, "initialOutreachGuard" | "sentTimePrecision" | "status" | "lastContactAt" | "nextAction" | "followUpDueAt" | "replied" | "replySentiment" | "trial" | "customer" | "source" | "createdAt" | "updatedAt">): OutreachRecord {
  const ledgerRecordedAt = input.sentAt || august18;
  return { ...input, initialOutreachGuard: "DO_NOT_SEND_NEW_INITIAL_OUTREACH", sentTimePrecision: input.sentAt ? "DATE_CONFIRMED" : "DATE_NOT_RECORDED", status: "SENT", lastContactAt: input.sentAt, nextAction: "AWAIT_RESPONSE", followUpDueAt: null, replied: false, replySentiment: "NONE", trial: false, customer: false, source: "HUMAN_CONFIRMED_OUTREACH", createdAt: ledgerRecordedAt, updatedAt: ledgerRecordedAt };
}
const direct = (id: string, organization: string, contact: string, persona: string, canonicalOpportunityId: string | null, whyNowSignal: string | null, signalSource: string | null, notes: string, sentAt = august17, email: string | null = null): OutreachRecord => humanConfirmedRecord({ id, organization, contact, persona, email, type: "DIRECT_NONPROFIT", whyNowSignal, signalSource, canonicalOpportunityId, canonicalRecordStatus: canonicalOpportunityId ? "LINKED" : "PENDING_CANONICAL_LEAD_LINK", sentAt, notes });
const partner = (id: string, organization: string, contact: string, persona: string, notes: string, email: string | null = null, sentAt: string | null = august17): OutreachRecord => humanConfirmedRecord({ id, organization, contact, persona, email, type: "PARTNER", whyNowSignal: null, signalSource: null, canonicalOpportunityId: null, canonicalRecordStatus: "PENDING_CANONICAL_LEAD_LINK", sentAt, notes });

/** Weekdays only: Monday through Friday. Public holidays are not inferred. */
export function addBusinessDays(sentAt: string, days: number) {
  const date = new Date(sentAt);
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return date.toISOString();
}

export function partnerFollowUpSchedule(sentAt: string) {
  const firstFollowUpDueAt = addBusinessDays(sentAt, 4);
  const secondFollowUpDueAt = addBusinessDays(firstFollowUpDueAt, 5);
  const finalCloseDueAt = addBusinessDays(secondFollowUpDueAt, 7);
  return { firstFollowUpDueAt, secondFollowUpDueAt, finalCloseDueAt };
}

/** A reply cancels every remaining manual follow-up. Nothing is sent automatically. */
export function nextPendingFollowUpDueAt(record: Pick<OutreachRecord, "replied" | "followUpStage" | "followUpDueAt" | "secondFollowUpDueAt" | "finalCloseDueAt">) {
  if (record.replied || record.followUpStage === "CANCELLED_BY_REPLY" || record.followUpStage === "FINAL_CLOSE_SENT") return null;
  if (record.followUpStage === "SECOND_SENT") return record.finalCloseDueAt || null;
  if (record.followUpStage === "FIRST_SENT") return record.secondFollowUpDueAt || null;
  return record.followUpDueAt || null;
}

function founderConfirmedPartnerSend(id: string, organization: string, contact: string, persona: string, email: string): OutreachRecord {
  const schedule = partnerFollowUpSchedule(august23FounderSend);
  return {
    ...partner(id, organization, contact, persona, "Founder-confirmed partner email sent on 2026-08-23. Delivery, opens, and reply outcomes are not inferred.", email, august23FounderSend),
    followUpDueAt: schedule.firstFollowUpDueAt,
    secondFollowUpDueAt: schedule.secondFollowUpDueAt,
    finalCloseDueAt: schedule.finalCloseDueAt,
    followUpStage: "INITIAL",
    sentBy: "HUMAN_FOUNDER",
    channel: "EMAIL",
    messageVariant: "PARTNER_BENEFIT_LED_V2"
  };
}

/** Human-confirmed activity only. No provider delivery, reply, trial, or conversion is inferred. */
export const confirmedHumanOutreach: OutreachRecord[] = [
  direct("outreach_direct_johnson_creek_20260817", "Johnson Creek Watershed Council", "Jennifer Hamilton", "Nonprofit contact", null, null, null, "Human-confirmed direct nonprofit email. The provided recipient is retained without inferring delivery or another event.", august17, "jennifer@jcwc.org"),
  direct("outreach_direct_child_enrichment_20260817", "Child Enrichment", "Kari Viola-Brooke", "Nonprofit contact", null, null, null, "Human-confirmed direct nonprofit email. The provided recipient is retained without inferring delivery or another event.", august17, "kviola@childenrichment.org"),
  direct("outreach_direct_foodlink_20260817", "Foodlink", "Terra Keller", "Nonprofit contact", null, null, null, "Human-confirmed direct nonprofit email. The provided recipient is retained without inferring delivery or another event.", august17, "tkeller@foodlinkny.org"),
  direct("outreach_direct_sustainable_food_center_20260817", "Sustainable Food Center", "Anthony Cordova / Nicole Thompson route", "Finance / Grants route", "job-sustainable-food-center-2026", "Hiring a Grants Manager to coordinate reporting across program, finance, and data teams.", "https://careers.wgu.edu/jobs/sustainable-food-center-grants-manager/", "Human-confirmed direct nonprofit email. The provided organization-inbox recipient is retained without inferring delivery or another event.", august17, "info@sustainablefoodcenter.org"),
  direct("outreach_direct_junior_achievement_20260817", "Junior Achievement of South Florida", "Finance team route", "Finance team", "job-ja-south-florida-2026", "Hiring a Grant Accountant for the post-award financial lifecycle and funder-specific reporting templates.", "https://recruiting.paylocity.com/recruiting/jobs/Details/4290195/Junior-Achievement-South-Florida/Grant-Accountant", "Human-confirmed direct nonprofit email. Existing known recipient retained without inferring delivery or another event.", august17, "info@jasouthflorida.org"),
  direct("outreach_direct_project_oceanology_20260818", "Project Oceanology", "Lisa Colón", "Accounts Manager", "award-project-oceanology-2026", "Federal marine-science grant record detected.", "https://www.usaspending.gov/award/ASST_NON_NA26NMFX469G0026_013/", "Human-confirmed direct nonprofit email. Publicly verified contact and source retained; no delivery result or follow-up is inferred.", august18, "lmcolon@oceanology.org"),
  direct("outreach_direct_rodale_20260818", "Rodale Institute", "Elaine Macbeth", "Executive Vice President, Chief Finance and Administration Officer", "job-rodale-2026", "Hiring a Grants Accountant reporting to the CFO.", "https://rodaleinstitute.org/employment/grants-accountant/", "Human-confirmed direct nonprofit email. Publicly verified contact and source retained; no delivery result or follow-up is inferred.", august18, "elaine.macbeth@rodaleinstitute.org"),
  partner("outreach_partner_21_light_20260817", "21 Light Accounting", "Joshua Gonzales", "Partner / fractional CFO", "Human-confirmed partner email. The provided recipient is retained without inferring delivery or another event.", "josh@21lightstreet.com"),
  partner("outreach_partner_vault_20260817", "Vault Consulting", "Chris Rauch", "Partner / fractional CFO", "Human-confirmed partner email. The provided recipient is retained without inferring delivery or another event.", "crauch@vaultconsulting.com"),
  partner("outreach_partner_goldin_20260817", "Goldin Group", "Alicia Coleman", "Partner / fractional CFO", "Human-confirmed partner email. The provided recipient is retained without inferring delivery or another event.", "acoleman@goldingroup.biz"),
  partner("outreach_partner_baas_20260817", "BAAS Advisory", "Brad Reigner", "Partner / fractional CFO", "Human-confirmed partner email. The provided recipient is retained without inferring delivery or another event.", "brad@baasllccpa.com"),
  partner("outreach_partner_cfo_leverage_20260817", "CFO Leverage", "Sam Coates", "Partner / fractional CFO", "Human-confirmed partner email. The provided recipient is retained without inferring delivery or another event.", "sc@cfoleverage.com"),
  partner("outreach_partner_closing_your_books_confirmed", "Closing Your Books", "Lozelle Mathai", "Partner / accounting firm", "Human-confirmed partner email. The send date was not provided, so no sent timestamp, delivery result, or follow-up date is inferred.", "lozelle@closingyourbooks.com", null),
  partner("outreach_partner_nfo_nonprofit_financial_outsourcing_confirmed", "NFO — Nonprofit Financial Outsourcing", "NFO team", "Partner / financial outsourcing", "Human-confirmed partner email. The send date was not provided, so no sent timestamp, delivery result, or follow-up date is inferred.", "info@nfoyourcfo.com", null),
  partner("outreach_partner_your_cfo_friend_confirmed", "Your CFO Friend", "Bee", "Partner / fractional CFO", "Human-confirmed partner email. The send date was not provided, so no sent timestamp, delivery result, or follow-up date is inferred.", "hello@yourcfofriend.com", null),
  partner("outreach_partner_platinum_cfo_confirmed", "Platinum CFO", "Sharon Gubinsky / team", "Partner / fractional CFO", "Human-confirmed partner email. The send date was not provided, so no sent timestamp, delivery result, or follow-up date is inferred.", "info@platinumcfo.com", null),
  partner("outreach_partner_crown_cfo_confirmed", "Crown CFO", "Mike DeMaio", "Partner / fractional CFO", "Human-confirmed partner email. The send date was not provided, so no sent timestamp, delivery result, or follow-up date is inferred.", "mike@crowncfo.com", null),
  founderConfirmedPartnerSend("outreach_partner_100_degrees_consulting_20260823", "100 Degrees Consulting", "Stephanie Skryzowski", "Founder & CEO", "stephanie@100degreesconsulting.com"),
  founderConfirmedPartnerSend("outreach_partner_strategic_nonprofit_finance_20260823", "Strategic Nonprofit Finance", "Larry Bomback", "Founder and CEO", "larry@strategicnonprofitfinance.com"),
  founderConfirmedPartnerSend("outreach_partner_altruic_advisors_20260823", "Altruic Advisors", "Ryan Hagan", "Founder & Managing Partner", "rhagan@altruic.com"),
  founderConfirmedPartnerSend("outreach_partner_c3_by_design_20260823", "c3 by Design", "Scott Turner", "Founder and CEO", "scott.turner@c3bydesign.com"),
  founderConfirmedPartnerSend("outreach_partner_array_accounting_20260823", "Array Accounting", "Danielle Wright", "Founder, Array Accounting & Consulting", "dwright@arrayaccounting.com"),
  founderConfirmedPartnerSend("outreach_partner_yptc_20260823", "YPTC", "Jennifer Alleva", "Chief Executive Officer", "jennifera@yptc.com"),
  founderConfirmedPartnerSend("outreach_partner_kiwi_partners_20260823", "Kiwi Partners", "Ken Hafner", "Head of Accounting Services", "khafner@kiwipartners.com"),
  founderConfirmedPartnerSend("outreach_partner_the_charity_cfo_20260823", "The Charity CFO", "Tosha Anderson", "Founder + Managing Partner", "tosha@thecharitycfo.com")
];

export function mergeOutreachRecords(existing: OutreachRecord[], incoming: OutreachRecord[]) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  // The supplied ledger is the canonical record of a human-confirmed event.
  // Replaying it repairs incomplete prior imports without fuzzy matching.
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) => (left.sentAt || "").localeCompare(right.sentAt || "") || left.id.localeCompare(right.id));
}

export function outreachOrganizations(records: OutreachRecord[], type: OutreachType) {
  return [...new Set(records.filter((record) => record.type === type).map((record) => record.organization))];
}

export function outreachCount(records: OutreachRecord[], type?: OutreachType) {
  return records.filter((record) => !type || record.type === type).length;
}

/** Existing canonical prior-contact state may block first touch without inventing a sent-event record. */
const PROTECTED_PRIOR_CONTACT_ORGANIZATIONS = new Set([
  "perkins school for blind",
  "university of nebraska at omaha"
]);

const OUTREACH_ORGANIZATION_ALIASES: Record<string, string> = {
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
  return OUTREACH_ORGANIZATION_ALIASES[normalized] || normalized;
}

export type OutreachSuppressionState = "CLEAR" | "BLOCKED" | "UNSUBSCRIBED" | "DO_NOT_CONTACT" | "OPT_OUT" | "BOUNCE_SUPPRESSION" | "NEGATIVE_RESPONSE_DO_NOT_CONTACT";
export interface InitialOutreachCandidate { organization: string; email?: string | null; domain?: string | null; suppressionStatus?: OutreachSuppressionState; instantlyInitialOutreachRecorded?: boolean; }
export type InitialOutreachEligibility = "ELIGIBLE_FOR_INITIAL_OUTREACH" | "DO_NOT_SEND_NEW_INITIAL_OUTREACH" | "SUPPRESSED_DO_NOT_CONTACT" | "SEPARATE_HUMAN_AUTHORIZATION_REQUIRED";

function normalizeDomain(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return raw.includes("@") ? raw.split("@").at(-1)! : raw;
}

function isStrongSuppression(status: OutreachSuppressionState | undefined) {
  return status === "BLOCKED" || status === "UNSUBSCRIBED" || status === "DO_NOT_CONTACT" || status === "OPT_OUT" || status === "BOUNCE_SUPPRESSION" || status === "NEGATIVE_RESPONSE_DO_NOT_CONTACT";
}

// This reconciliation guard authorizes neither delivery nor follow-up.
export function initialOutreachEligibility(records: OutreachRecord[], candidate: InitialOutreachCandidate, event: "INITIAL" | "FOLLOW_UP" = "INITIAL"): InitialOutreachEligibility {
  if (isStrongSuppression(candidate.suppressionStatus)) return "SUPPRESSED_DO_NOT_CONTACT";
  if (event === "FOLLOW_UP") return "SEPARATE_HUMAN_AUTHORIZATION_REQUIRED";
  const organization = normalizeOutreachOrganization(candidate.organization);
  const email = candidate.email?.trim().toLowerCase();
  const domain = normalizeDomain(candidate.domain || candidate.email);
  if (!organization || candidate.instantlyInitialOutreachRecorded || PROTECTED_PRIOR_CONTACT_ORGANIZATIONS.has(organization)) return "DO_NOT_SEND_NEW_INITIAL_OUTREACH";
  return records.some((record) => record.initialOutreachGuard === "DO_NOT_SEND_NEW_INITIAL_OUTREACH" && (normalizeOutreachOrganization(record.organization) === organization || Boolean(email && record.email?.toLowerCase() === email) || Boolean(domain && normalizeDomain(record.email) === domain))) ? "DO_NOT_SEND_NEW_INITIAL_OUTREACH" : "ELIGIBLE_FOR_INITIAL_OUTREACH";
}
export interface OutreachMetrics {
  totalSent: number;
  directSent: number;
  partnerSent: number;
  uniqueOrganizationsContacted: number;
  directUniqueOrganizationsContacted: number;
  partnerUniqueOrganizationsContacted: number;
  awaitingResponse: number;
  replied: number;
  trials: number;
  customers: number;
}

export interface OutreachControlPlaneLink {
  recordId: string;
  canonicalOpportunityId: string | null;
  status: OutreachRecord["canonicalRecordStatus"];
}


/** Counts only the events represented in the ledger; it never treats a send as delivery or a response. */
export function summarizeOutreach(records: OutreachRecord[]): OutreachMetrics {
  return {
    totalSent: records.filter((record) => record.status === "SENT").length,
    directSent: records.filter((record) => record.type === "DIRECT_NONPROFIT" && record.status === "SENT").length,
    partnerSent: records.filter((record) => record.type === "PARTNER" && record.status === "SENT").length,
    uniqueOrganizationsContacted: new Set(records.map((record) => normalizeOutreachOrganization(record.organization))).size,
    directUniqueOrganizationsContacted: new Set(records.filter((record) => record.type === "DIRECT_NONPROFIT").map((record) => normalizeOutreachOrganization(record.organization))).size,
    partnerUniqueOrganizationsContacted: new Set(records.filter((record) => record.type === "PARTNER").map((record) => normalizeOutreachOrganization(record.organization))).size,
    awaitingResponse: records.filter((record) => record.nextAction === "AWAIT_RESPONSE" && !record.replied).length,
    replied: records.filter((record) => record.replied).length,
    trials: records.filter((record) => record.trial).length,
    customers: records.filter((record) => record.customer).length
  };
}

/** Keeps links explicit: a missing Control Plane key remains visibly pending rather than guessed by organization name. */
export function reconcileOutreachControlPlane(records: OutreachRecord[], canonicalOpportunityIds: readonly string[]): OutreachControlPlaneLink[] {
  const canonicalIds = new Set(canonicalOpportunityIds);
  return records.map((record) => ({
    recordId: record.id,
    canonicalOpportunityId: record.canonicalOpportunityId,
    status: record.canonicalOpportunityId && canonicalIds.has(record.canonicalOpportunityId) ? "LINKED" : "PENDING_CANONICAL_LEAD_LINK"
  }));
}
