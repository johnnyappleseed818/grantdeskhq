import type { GtmOpportunity } from "./gtm";

export type ControlPlaneLeadState =
  | "DISQUALIFIED"
  | "QUALIFIED"
  | "CONTACT_RESEARCH_REQUIRED"
  | "ENRICHMENT_READY"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "SUPPRESSION_CHECK_REQUIRED"
  | "DRAFT_REQUIRED"
  | "READY_FOR_HUMAN_REVIEW"
  | "ALREADY_CONTACTED"
  | "CUSTOMER"
  | "DUPLICATE";

export type QueueSuppressionStatus = "CLEAR" | "BLOCKED" | "UNKNOWN";

export interface ControlPlaneQueueInput {
  cards: GtmOpportunity[];
  suppressionByEmail?: Record<string, QueueSuppressionStatus>;
  alreadyContactedOrganizations?: readonly string[];
  customerOrganizations?: readonly string[];
  draftOrganizations?: readonly string[];
}

export interface ControlPlaneQueueLead {
  cardId: string;
  canonicalCardId: string;
  organization: string;
  normalizedOrganization: string;
  signalKind: GtmOpportunity["signalKind"];
  observedAt: string;
  sourceUrls: string[];
  directBusinessEmail?: string;
  state: ControlPlaneLeadState;
  reason: string;
}

export interface ControlPlaneQueueReconciliation {
  generatedAt?: string;
  cards: ControlPlaneQueueLead[];
  uniqueOrganizations: number;
  counts: Record<ControlPlaneLeadState, number>;
  // Optional only for legacy persisted reconciliations; newly reconciled
  // inventories always include this field.
  replenishment?: DirectProspectReplenishment;
}

export interface DirectProspectReplenishmentMetric {
  actual: number;
  threshold: number;
  gap: number;
}

/**
 * Inventory-only thresholds. Reconciliation can identify a gap, but never
 * initiates enrichment, creates a contact, or authorizes delivery.
 */
export interface DirectProspectReplenishment {
  sourceQualified: DirectProspectReplenishmentMetric;
  enrichmentReady: DirectProspectReplenishmentMetric;
  humanReview: DirectProspectReplenishmentMetric;
  needsReplenishment: boolean;
}

const STATES: ControlPlaneLeadState[] = [
  "DISQUALIFIED",
  "QUALIFIED",
  "CONTACT_RESEARCH_REQUIRED",
  "ENRICHMENT_READY",
  "EMAIL_VERIFICATION_REQUIRED",
  "SUPPRESSION_CHECK_REQUIRED",
  "DRAFT_REQUIRED",
  "READY_FOR_HUMAN_REVIEW",
  "ALREADY_CONTACTED",
  "CUSTOMER",
  "DUPLICATE"
];

export const DIRECT_PROSPECT_REPLENISHMENT_THRESHOLDS = {
  sourceQualified: 100,
  enrichmentReady: 50,
  humanReview: 25
} as const;

const ORGANIZATION_ALIASES: Record<string, string> = {
  "interdistrict committee for project oceanology": "project oceanology"
};

export function normalizeControlPlaneOrganization(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/\b(the|inc|incorporated|corp|corporation|co|company|foundation)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return ORGANIZATION_ALIASES[normalized] || normalized;
}

export function reconcileControlPlaneQueue(input: ControlPlaneQueueInput): ControlPlaneQueueReconciliation {
  const suppressionByEmail = Object.fromEntries(Object.entries(input.suppressionByEmail || {}).map(([email, status]) => [email.trim().toLowerCase(), status]));
  const contacted = organizationSet(input.alreadyContactedOrganizations);
  const customers = organizationSet(input.customerOrganizations);
  const drafted = organizationSet(input.draftOrganizations);
  const canonicalByOrganization = new Map<string, GtmOpportunity>();
  for (const card of input.cards) {
    const organization = normalizeControlPlaneOrganization(card.organization);
    const current = canonicalByOrganization.get(organization);
    if (!current || canonicalSortKey(card) < canonicalSortKey(current)) canonicalByOrganization.set(organization, card);
  }

  const cards = input.cards.map((card) => {
    const organization = normalizeControlPlaneOrganization(card.organization);
    const canonical = canonicalByOrganization.get(organization)!;
    if (card.id !== canonical.id) return toLead(card, canonical.id, "DUPLICATE", "This Control Plane card is a repeated organization signal; its source is retained on the canonical organization record.");
    const directEmail = card.primaryContact?.emailKind === "direct" ? normalizeEmail(card.primaryContact.email) : undefined;
    const state = classifyLead(card, organization, directEmail, suppressionByEmail, contacted, customers, drafted);
    return toLead(card, card.id, state.state, state.reason);
  });

  const counts = Object.fromEntries(STATES.map((state) => [state, 0])) as Record<ControlPlaneLeadState, number>;
  for (const card of cards) counts[card.state] += 1;
  const replenishment = directProspectReplenishment(canonicalByOrganization.size, counts);
  return { cards, uniqueOrganizations: canonicalByOrganization.size, counts, replenishment };
}

export function directProspectReplenishment(uniqueOrganizations: number, counts: Record<ControlPlaneLeadState, number>): DirectProspectReplenishment {
  const sourceQualified = Math.max(0, uniqueOrganizations - counts.DISQUALIFIED);
  const metrics = {
    sourceQualified: replenishmentMetric(sourceQualified, DIRECT_PROSPECT_REPLENISHMENT_THRESHOLDS.sourceQualified),
    enrichmentReady: replenishmentMetric(counts.ENRICHMENT_READY, DIRECT_PROSPECT_REPLENISHMENT_THRESHOLDS.enrichmentReady),
    humanReview: replenishmentMetric(counts.READY_FOR_HUMAN_REVIEW, DIRECT_PROSPECT_REPLENISHMENT_THRESHOLDS.humanReview)
  };
  return { ...metrics, needsReplenishment: Object.values(metrics).some((metric) => metric.gap > 0) };
}

function replenishmentMetric(actual: number, threshold: number): DirectProspectReplenishmentMetric {
  return { actual, threshold, gap: Math.max(0, threshold - actual) };
}

function canonicalSortKey(card: GtmOpportunity) {
  // IDs are immutable source-card keys. Sorting them makes the canonical card
  // stable if a scanner returns the same cards in a different order.
  return card.id.toLowerCase();
}

function classifyLead(
  card: GtmOpportunity,
  organization: string,
  directEmail: string | undefined,
  suppressionByEmail: Record<string, QueueSuppressionStatus>,
  contacted: Set<string>,
  customers: Set<string>,
  drafted: Set<string>
): { state: Exclude<ControlPlaneLeadState, "DUPLICATE">; reason: string } {
  if (!card.entityVerified || !card.nonprofitVerified || card.conflicts.length) return { state: "DISQUALIFIED", reason: "Entity, nonprofit, or source-conflict gate is not satisfied." };
  if (customers.has(organization)) return { state: "CUSTOMER", reason: "Organization is present in the canonical customer/suppression source." };
  if (contacted.has(organization)) return { state: "ALREADY_CONTACTED", reason: "Organization is present in the canonical prior-outreach/suppression source." };
  if (!card.primaryContact?.name || !card.primaryContact?.title) return { state: "CONTACT_RESEARCH_REQUIRED", reason: "A current finance or grants contact has not been established." };
  if (!directEmail) return { state: "ENRICHMENT_READY", reason: "A current relevant contact is known, but no direct publicly verified business email is attached." };
  const suppression = suppressionByEmail[directEmail];
  if (suppression === "BLOCKED") return { state: "DISQUALIFIED", reason: "The direct business email is suppressed; it cannot enter a target-email queue." };
  if (suppression !== "CLEAR") return { state: "SUPPRESSION_CHECK_REQUIRED", reason: "The published direct business email is preserved, but canonical suppression and customer-history checks are not confirmed CLEAR." };
  if (!card.emailSubject.trim() || !card.draftMessage.trim()) return { state: "DRAFT_REQUIRED", reason: "Contact and suppression gates are clear, but a source-grounded draft is absent." };
  if (drafted.has(organization)) return { state: "READY_FOR_HUMAN_REVIEW", reason: "Direct business email, suppression, and a human-review-only draft are present. No delivery is authorized." };
  return { state: "QUALIFIED", reason: "Contact and suppression gates are clear; preserve the lead for source-grounded draft preparation." };
}

function toLead(card: GtmOpportunity, canonicalCardId: string, state: ControlPlaneLeadState, reason: string): ControlPlaneQueueLead {
  const directBusinessEmail = card.primaryContact?.emailKind === "direct" ? normalizeEmail(card.primaryContact.email) : undefined;
  return {
    cardId: card.id,
    canonicalCardId,
    organization: card.organization,
    normalizedOrganization: normalizeControlPlaneOrganization(card.organization),
    signalKind: card.signalKind,
    observedAt: card.observedAt,
    sourceUrls: card.evidence.map((evidence) => evidence.url).filter((url) => /^https:\/\//.test(url)),
    ...(directBusinessEmail ? { directBusinessEmail } : {}),
    state,
    reason
  };
}

function organizationSet(values: readonly string[] | undefined) {
  return new Set((values || []).map(normalizeControlPlaneOrganization));
}

function normalizeEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase() || "";
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : "";
}
