export type OutreachType = "DIRECT_NONPROFIT" | "PARTNER";
export type OutreachStatus = "SENT" | "REPLIED" | "POSITIVE_REPLY" | "FREE_FIRST_AWARD" | "ACTIVATED" | "PAID" | "CLOSED";
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
  sentAt: string;
  sentTimePrecision: "DATE_CONFIRMED";
  status: OutreachStatus;
  lastContactAt: string;
  nextAction: "AWAIT_RESPONSE";
  followUpDueAt: string | null;
  replied: boolean;
  replySentiment: "NONE" | "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  trial: boolean;
  customer: boolean;
  notes: string;
  source: "HUMAN_CONFIRMED_OUTREACH";
  createdAt: string;
  updatedAt: string;
}

const date = "2026-08-17T00:00:00.000Z";
const direct = (id: string, organization: string, contact: string, persona: string, canonicalOpportunityId: string | null, whyNowSignal: string | null, signalSource: string | null, notes: string): OutreachRecord => ({ id, organization, contact, persona, email: null, type: "DIRECT_NONPROFIT", whyNowSignal, signalSource, canonicalOpportunityId, canonicalRecordStatus: canonicalOpportunityId ? "LINKED" : "PENDING_CANONICAL_LEAD_LINK", sentAt: date, sentTimePrecision: "DATE_CONFIRMED", status: "SENT", lastContactAt: date, nextAction: "AWAIT_RESPONSE", followUpDueAt: null, replied: false, replySentiment: "NONE", trial: false, customer: false, notes, source: "HUMAN_CONFIRMED_OUTREACH", createdAt: date, updatedAt: date });
const partner = (id: string, organization: string, contact: string, persona: string, notes: string): OutreachRecord => ({ id, organization, contact, persona, email: null, type: "PARTNER", whyNowSignal: null, signalSource: null, canonicalOpportunityId: null, canonicalRecordStatus: "PENDING_CANONICAL_LEAD_LINK", sentAt: date, sentTimePrecision: "DATE_CONFIRMED", status: "SENT", lastContactAt: date, nextAction: "AWAIT_RESPONSE", followUpDueAt: null, replied: false, replySentiment: "NONE", trial: false, customer: false, notes, source: "HUMAN_CONFIRMED_OUTREACH", createdAt: date, updatedAt: date });

/** Human-confirmed activity only. No provider delivery, reply, trial, or conversion is inferred. */
export const confirmedHumanOutreach: OutreachRecord[] = [
  direct("outreach_direct_johnson_creek_20260817", "Johnson Creek Watershed Council", "Jennifer Hamilton", "Nonprofit contact", null, null, null, "Human-confirmed direct nonprofit email. Canonical lead and verified email route must be linked without guessing."),
  direct("outreach_direct_child_enrichment_20260817", "Child Enrichment", "Kari Viola-Brooke", "Nonprofit contact", null, null, null, "Human-confirmed direct nonprofit email. Canonical lead and verified email route must be linked without guessing."),
  direct("outreach_direct_foodlink_20260817", "Foodlink", "Terra Keller", "Nonprofit contact", null, null, null, "Human-confirmed direct nonprofit email. Canonical lead and verified email route must be linked without guessing."),
  direct("outreach_direct_sustainable_food_center_20260817", "Sustainable Food Center", "Anthony Cordova / Nicole Thompson route", "Finance / Grants route", "job-sustainable-food-center-2026", "Hiring a Grants Manager to coordinate reporting across program, finance, and data teams.", "https://careers.wgu.edu/jobs/sustainable-food-center-grants-manager/", "Human-confirmed direct nonprofit email. The canonical source identifies the public organization-inbox route; preserve any exact delivery address only when imported from the approved sender record."),
  direct("outreach_direct_junior_achievement_20260817", "Junior Achievement of South Florida", "Finance team route", "Finance team", "job-ja-south-florida-2026", "Hiring a Grant Accountant for the post-award financial lifecycle and funder-specific reporting templates.", "https://recruiting.paylocity.com/recruiting/jobs/Details/4290195/Junior-Achievement-South-Florida/Grant-Accountant", "Human-confirmed direct nonprofit email. The canonical source identifies the Finance team route; preserve any exact delivery address only when imported from the approved sender record."),
  partner("outreach_partner_21_light_20260817", "21 Light Accounting", "Joshua Gonzales", "Partner / fractional CFO", "Human-confirmed partner email. Canonical partner research and verified email route must be linked without guessing."),
  partner("outreach_partner_vault_20260817", "Vault Consulting", "Chris Rauch", "Partner / fractional CFO", "Human-confirmed partner email. Canonical partner research and verified email route must be linked without guessing."),
  partner("outreach_partner_goldin_20260817", "Goldin Group", "Alicia Coleman", "Partner / fractional CFO", "Human-confirmed partner email. Canonical partner research and verified email route must be linked without guessing."),
  partner("outreach_partner_baas_20260817", "BAAS Advisory", "Brad Reigner", "Partner / fractional CFO", "Human-confirmed partner email. Canonical partner research and verified email route must be linked without guessing."),
  partner("outreach_partner_cfo_leverage_20260817", "CFO Leverage", "Sam Coates", "Partner / fractional CFO", "Human-confirmed partner email. Canonical partner research and verified email route must be linked without guessing.")
];

export function mergeOutreachRecords(existing: OutreachRecord[], incoming: OutreachRecord[]) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  // The supplied ledger is the canonical record of a human-confirmed event.
  // Replaying it repairs incomplete prior imports without fuzzy matching.
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) => left.sentAt.localeCompare(right.sentAt) || left.id.localeCompare(right.id));
}

export function outreachOrganizations(records: OutreachRecord[], type: OutreachType) {
  return [...new Set(records.filter((record) => record.type === type).map((record) => record.organization))];
}

export function outreachCount(records: OutreachRecord[], type?: OutreachType) {
  return records.filter((record) => !type || record.type === type).length;
}
export interface OutreachMetrics {
  totalSent: number;
  directSent: number;
  partnerSent: number;
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
