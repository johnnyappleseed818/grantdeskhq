import type { CanonicalGtmModel, CanonicalGtmRecord, CanonicalSegment } from "./gtmCanonical";

/**
 * Inventory policy is deliberately independent from send/canary state.  A
 * mailbox problem may stop enrollment, but never stops evidence collection or
 * contact verification.
 */
export const GTM_INVENTORY_TARGETS = {
  DIRECT: { evidenceQualified: { floor: 300, target: 500 }, ready: { floor: 75, target: 150 } },
  PARTNER: { evidenceQualified: { floor: 75, target: 150 }, ready: { floor: 25, target: 50 } }
} as const;

export const GTM_LIFECYCLE_STAGES = ["SIGNAL", "ACCOUNT", "EVIDENCE_VERIFIED", "CONTACT_FOUND", "EMAIL_VERIFIED", "READY", "STAGED", "SCHEDULED", "SENT", "REPLIED"] as const;
export type GtmLifecycleStage = typeof GTM_LIFECYCLE_STAGES[number];

export interface GtmScaleSegment {
  segment: CanonicalSegment;
  stages: Record<GtmLifecycleStage, number>;
  evidenceQualified: number;
  verifiedContacts: number;
  ready: number;
  target: typeof GTM_INVENTORY_TARGETS[CanonicalSegment];
  safeDailyCapacity: number | null;
  readyCoverageBusinessDays: number | null;
  readinessFloor: number | null;
  expectedDaysToTarget: number | null;
}

export interface GtmScaleModel {
  generatedAt: string;
  direct: GtmScaleSegment;
  partner: GtmScaleSegment;
}

/** Provider status is authoritative for the bottom-of-funnel lifecycle. */
export function lifecycleStageFor(record: CanonicalGtmRecord): GtmLifecycleStage {
  const status = String(record.instantlyStatus || "").toUpperCase();
  if (["REPLIED", "POSITIVE"].includes(status) || ["REPLIED", "POSITIVE"].includes(record.state)) return "REPLIED";
  if (status === "SENT" || record.state === "AWAITING_REPLY" || record.state === "FOLLOW_UP_DUE") return "SENT";
  if (["SCHEDULED", "IN_CAMPAIGN", "APPROVED_FOR_CAMPAIGN"].includes(status)) return "SCHEDULED";
  if (status === "STAGED") return "STAGED";
  if (record.state === "READY_TO_SEND") return "READY";
  if (String(record.verificationStatus || "").toUpperCase() === "VERIFIED") return "EMAIL_VERIFIED";
  if (record.contact) return "CONTACT_FOUND";
  return record.qualified ? "EVIDENCE_VERIFIED" : "SIGNAL";
}

export function buildGtmScaleModel(model: CanonicalGtmModel, input: { directSafeDailyCapacity?: number | null; partnerSafeDailyCapacity?: number | null; directDailyInflow?: number; partnerDailyInflow?: number } = {}): GtmScaleModel {
  return {
    generatedAt: model.generatedAt,
    direct: buildSegment(model.records, "DIRECT", input.directSafeDailyCapacity, input.directDailyInflow),
    partner: buildSegment(model.records, "PARTNER", input.partnerSafeDailyCapacity, input.partnerDailyInflow)
  };
}

function buildSegment(records: readonly CanonicalGtmRecord[], segment: CanonicalSegment, safeDailyCapacity: number | null | undefined, dailyInflow: number | undefined): GtmScaleSegment {
  const items = records.filter((record) => record.segment === segment);
  const stages = Object.fromEntries(GTM_LIFECYCLE_STAGES.map((stage) => [stage, 0])) as Record<GtmLifecycleStage, number>;
  for (const item of items) stages[lifecycleStageFor(item)] += 1;
  const evidenceQualified = items.filter((item) => item.qualified).length;
  const verifiedContacts = items.filter((item) => String(item.verificationStatus || "").toUpperCase() === "VERIFIED").length;
  const ready = stages.READY;
  const target = GTM_INVENTORY_TARGETS[segment];
  const capacity = typeof safeDailyCapacity === "number" && safeDailyCapacity > 0 ? safeDailyCapacity : null;
  const readinessFloor = capacity ? Math.max(target.ready.floor, capacity * 10) : target.ready.floor;
  const expectedDaysToTarget = dailyInflow && dailyInflow > 0 ? Math.ceil(Math.max(0, target.ready.target - ready) / dailyInflow) : null;
  return { segment, stages, evidenceQualified, verifiedContacts, ready, target, safeDailyCapacity: capacity, readyCoverageBusinessDays: capacity ? Math.floor(ready / capacity) : null, readinessFloor, expectedDaysToTarget };
}
