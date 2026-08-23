import type { ContactEnrichmentRecord, EnrichmentTarget } from "./contactEnrichment";
import { normalizeBusinessDomain } from "./contactEnrichment";
import { normalizeOutreachOrganization, type OutreachRecord } from "./gtmOutreach";

/**
 * The founder console consumes this read model instead of deriving commercial
 * state in the browser. Source signals remain attached to the record, but
 * readiness, prior-contact protection, and next action have one owner.
 */
export type CanonicalSegment = "DIRECT" | "PARTNER";
export type CanonicalGtmState =
  | "RESEARCH_BACKLOG"
  | "NEEDS_VERIFICATION"
  | "READY_TO_SEND"
  | "ALREADY_CONTACTED"
  | "AWAITING_REPLY"
  | "FOLLOW_UP_DUE"
  | "REPLIED"
  | "POSITIVE"
  | "TRIAL"
  | "PAID";

export interface CanonicalGtmCandidate {
  id: string;
  segment: CanonicalSegment;
  target: EnrichmentTarget;
  qualified: boolean;
  sourceUrl: string;
  whyNow: string;
  partnerType?: string;
  subject?: string;
  draft?: string;
  priority?: number;
}

export interface CanonicalGtmRecord {
  id: string;
  organizationId: string;
  organization: string;
  organizationDomain: string;
  segment: CanonicalSegment;
  state: CanonicalGtmState;
  qualified: boolean;
  contact: string | null;
  title: string | null;
  email: string | null;
  verificationStatus: string | null;
  suppressionStatus: string | null;
  priorContact: boolean;
  blockers: string[];
  nextAction: string;
  whyNow: string;
  sourceUrl: string;
  partnerType: string | null;
  subject: string | null;
  draft: string | null;
  lastUpdated: string | null;
}

export interface CanonicalGtmModel {
  generatedAt: string;
  records: CanonicalGtmRecord[];
  queues: Record<CanonicalGtmState, string[]>;
  metrics: {
    directReady: number;
    partnerReady: number;
    directNeedsVerification: number;
    partnerNeedsVerification: number;
    followUpsDue: number;
    awaitingReply: number;
    replies: number;
    positiveReplies: number;
    trials: number;
    paid: number;
    mrr: number;
  };
}

const STATES: CanonicalGtmState[] = ["RESEARCH_BACKLOG", "NEEDS_VERIFICATION", "READY_TO_SEND", "ALREADY_CONTACTED", "AWAITING_REPLY", "FOLLOW_UP_DUE", "REPLIED", "POSITIVE", "TRIAL", "PAID"];

/** A small explicit alias registry supplements normalized names and domains. */
const ORGANIZATION_ALIASES: Record<string, string> = {
  "interdistrict committee for project oceanology": "project oceanology",
  "university of nebraska omaha": "university of nebraska at omaha",
  "perkins school blind": "perkins school for blind"
};

/** Existing canonical contact state that is known without a fabricated send event. */
const PROTECTED_PRIOR_CONTACT_ORGANIZATIONS = new Set([
  "perkins school for blind",
  "university of nebraska at omaha"
]);

export function canonicalOrganizationId(organization: string, domain?: string | null) {
  const normalizedName = ORGANIZATION_ALIASES[normalizeOutreachOrganization(organization)] || normalizeOutreachOrganization(organization);
  const normalizedDomain = normalizeBusinessDomain(domain || "");
  return normalizedDomain ? `org:${normalizedDomain}` : `org:${normalizedName}`;
}

export function buildCanonicalGtmModel(input: {
  candidates: readonly CanonicalGtmCandidate[];
  enrichments: readonly ContactEnrichmentRecord[];
  outreach: readonly OutreachRecord[];
  generatedAt?: string;
}): CanonicalGtmModel {
  const enrichmentByIdentity = new Map<string, ContactEnrichmentRecord>();
  for (const record of input.enrichments) {
    const id = canonicalOrganizationId(record.target.organization, record.target.organizationDomain);
    const prior = enrichmentByIdentity.get(id);
    if (!prior || record.updatedAt > prior.updatedAt) enrichmentByIdentity.set(id, record);
  }
  const outreachByIdentity = new Map<string, OutreachRecord>();
  for (const record of input.outreach) {
    const id = canonicalOrganizationId(record.organization, record.email?.split("@").at(-1));
    const prior = outreachByIdentity.get(id);
    if (!prior || String(record.updatedAt) > String(prior.updatedAt)) outreachByIdentity.set(id, record);
  }

  const candidateByIdentity = new Map<string, CanonicalGtmCandidate>();
  for (const candidate of input.candidates) {
    const id = canonicalOrganizationId(candidate.target.organization, candidate.target.organizationDomain);
    const prior = candidateByIdentity.get(id);
    if (!prior || (candidate.priority || 0) > (prior.priority || 0)) candidateByIdentity.set(id, candidate);
  }
  // History-only organizations remain visible in operational history.
  for (const event of input.outreach) {
    const id = canonicalOrganizationId(event.organization, event.email?.split("@").at(-1));
    if (!candidateByIdentity.has(id)) {
      candidateByIdentity.set(id, {
        id,
        segment: event.type === "PARTNER" ? "PARTNER" : "DIRECT",
        target: { organization: event.organization, organizationDomain: event.email?.split("@").at(-1) || "unknown.invalid", domainSourceUrl: event.signalSource || "https://grantdeskhq.com", person: { firstName: event.contact.split(/\s+/)[0] || "Unknown", lastName: event.contact.split(/\s+/).at(-1) || "Contact", fullName: event.contact || "Unknown contact", currentTitle: event.persona || "Contact", titleSourceUrl: event.signalSource || "https://grantdeskhq.com" } },
        qualified: true,
        sourceUrl: event.signalSource || "https://grantdeskhq.com",
        whyNow: event.whyNowSignal || "Recorded outreach history",
        partnerType: event.type === "PARTNER" ? event.persona : undefined
      });
    }
  }

  const records = [...candidateByIdentity.entries()].map(([organizationId, candidate]) => {
    const enrichment = enrichmentByIdentity.get(organizationId);
    const history = outreachByIdentity.get(organizationId);
    return toCanonicalRecord(organizationId, candidate, enrichment, history);
  }).sort((left, right) => stateOrder(left.state) - stateOrder(right.state) || (right.lastUpdated || "").localeCompare(left.lastUpdated || "") || left.organization.localeCompare(right.organization));
  const queues = Object.fromEntries(STATES.map((state) => [state, records.filter((record) => record.state === state).map((record) => record.id)])) as CanonicalGtmModel["queues"];
  const count = (state: CanonicalGtmState, segment?: CanonicalSegment) => records.filter((record) => record.state === state && (!segment || record.segment === segment)).length;
  return {
    generatedAt: input.generatedAt || new Date().toISOString(), records, queues,
    metrics: {
      directReady: count("READY_TO_SEND", "DIRECT"), partnerReady: count("READY_TO_SEND", "PARTNER"),
      directNeedsVerification: count("NEEDS_VERIFICATION", "DIRECT"), partnerNeedsVerification: count("NEEDS_VERIFICATION", "PARTNER"),
      followUpsDue: count("FOLLOW_UP_DUE"), awaitingReply: count("AWAITING_REPLY"), replies: count("REPLIED") + count("POSITIVE"),
      positiveReplies: count("POSITIVE"), trials: count("TRIAL"), paid: count("PAID"), mrr: 0
    }
  };
}

function toCanonicalRecord(organizationId: string, candidate: CanonicalGtmCandidate, enrichment?: ContactEnrichmentRecord, history?: OutreachRecord): CanonicalGtmRecord {
  const organization = candidate.target.organization;
  const protectedPriorContact = PROTECTED_PRIOR_CONTACT_ORGANIZATIONS.has(ORGANIZATION_ALIASES[normalizeOutreachOrganization(organization)] || normalizeOutreachOrganization(organization));
  const state = history ? stateFromOutreach(history) : protectedPriorContact || enrichment?.verification.priorContactStatus === "ALREADY_CONTACTED" ? "ALREADY_CONTACTED" : enrichment?.verification.readyToSend ? "READY_TO_SEND" : enrichment ? "NEEDS_VERIFICATION" : "RESEARCH_BACKLOG";
  const blockers = state === "NEEDS_VERIFICATION" ? (enrichment?.verification.blockers.length ? enrichment.verification.blockers : ["VERIFICATION_MISSING"]) : state === "ALREADY_CONTACTED" ? ["ALREADY_CONTACTED"] : [];
  return {
    id: candidate.id, organizationId, organization, organizationDomain: candidate.target.organizationDomain, segment: candidate.segment, state,
    qualified: candidate.qualified, contact: enrichment?.target.person.fullName || candidate.target.person.fullName || null,
    title: enrichment?.target.person.currentTitle || candidate.target.person.currentTitle || null,
    email: enrichment?.verification.email || enrichment?.email || history?.email || null,
    verificationStatus: enrichment?.verification.verifierStatus || null,
    suppressionStatus: enrichment?.verification.suppressionStatus || null,
    priorContact: Boolean(history || protectedPriorContact || enrichment?.verification.priorContactStatus === "ALREADY_CONTACTED"), blockers,
    nextAction: nextAction(state, blockers), whyNow: candidate.whyNow, sourceUrl: candidate.sourceUrl, partnerType: candidate.partnerType || null,
    subject: candidate.subject || null, draft: candidate.draft || null, lastUpdated: history?.updatedAt || enrichment?.updatedAt || null
  };
}

function stateFromOutreach(record: OutreachRecord): CanonicalGtmState {
  if (record.customer) return "PAID";
  if (record.trial) return "TRIAL";
  if (record.replySentiment === "POSITIVE") return "POSITIVE";
  if (record.replied) return "REPLIED";
  if (record.followUpDueAt && Date.parse(record.followUpDueAt) <= Date.now()) return "FOLLOW_UP_DUE";
  return "AWAITING_REPLY";
}

function nextAction(state: CanonicalGtmState, blockers: string[]) {
  if (state === "READY_TO_SEND") return "COPY OR OPEN THE HUMAN-APPROVED DRAFT; OUTBOUND REMAINS MANUAL.";
  if (state === "FOLLOW_UP_DUE") return "REVIEW FOLLOW-UP; SEPARATE HUMAN AUTHORIZATION IS REQUIRED.";
  if (state === "AWAITING_REPLY") return "AWAIT RESPONSE; NO DELIVERY OR OUTCOME IS INFERRED.";
  if (state === "ALREADY_CONTACTED") return "PRESERVE HISTORY; DO NOT CREATE A NEW FIRST-TOUCH ACTION.";
  if (state === "NEEDS_VERIFICATION") return blockers[0] || "RESOLVE THE EXPLICIT VERIFICATION BLOCKER.";
  return "RESEARCH ONLY; DO NOT PLACE IN AN INITIAL-ACTION QUEUE.";
}

function stateOrder(state: CanonicalGtmState) {
  return STATES.indexOf(state);
}
