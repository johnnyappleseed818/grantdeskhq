/**
 * The only acquisition-inventory thresholds used by GrantDeskHQ runtime jobs.
 * These are deliberately modest operating buffers, not quotas or send limits.
 */
export const GTM_INVENTORY_POLICY = {
  direct: { floor: 10, target: 15, ceiling: 20 },
  partner: { floor: 5, target: 10, ceiling: 15 },
  content: { floor: 2, target: 4, ceiling: 6 },
  social: { preferredFloor: 3, targetMin: 3, targetMax: 10 }
} as const;

export type InventoryChannel = keyof Pick<typeof GTM_INVENTORY_POLICY, "direct" | "partner" | "content">;
export type InventoryState = "HEALTHY" | "REPLENISHING" | "SUPPLY_CONSTRAINED" | "BLOCKED";
export interface InventoryDecision {
  ready: number;
  floor: number;
  target: number;
  ceiling: number;
  triggered: boolean;
  desired: number;
  state: InventoryState;
}

export interface InventoryChannelSnapshot {
  decision: InventoryDecision;
  replenishmentTriggered: boolean;
  supplyConstrained: boolean;
  bottleneck: string;
  telemetry: Record<string, number | boolean | string | null>;
}

export interface InventoryAutopilotSnapshot {
  generatedAt: string;
  direct: InventoryChannelSnapshot;
  partner: InventoryChannelSnapshot;
  content: InventoryChannelSnapshot;
  social: { actionable: number; preferredFloor: number; targetRange: readonly [number, number]; breadth: "STANDARD" | "EXPANDED"; state: InventoryState; bottleneck: string; telemetry: Record<string, number | boolean | string | null>; };
  safeguards: { autoHandoff: false; contentAutoPublish: false; socialAutoPost: false; };
}

export function inventoryDecision(channel: InventoryChannel, ready: number, options: { constrained?: boolean; blocked?: boolean } = {}): InventoryDecision {
  const policy = GTM_INVENTORY_POLICY[channel];
  const normalized = Math.max(0, Math.floor(Number(ready) || 0));
  const desired = normalized >= policy.target ? 0 : Math.min(policy.target - normalized, Math.max(0, policy.ceiling - normalized));
  const triggered = normalized < policy.floor;
  const state: InventoryState = options.blocked ? "BLOCKED" : options.constrained ? "SUPPLY_CONSTRAINED" : triggered ? "REPLENISHING" : "HEALTHY";
  return { ready: normalized, floor: policy.floor, target: policy.target, ceiling: policy.ceiling, triggered, desired, state };
}

/** A small gap (between floor and target) permits modest work, while a healthy
 * inventory performs no paid enrichment. */
export function boundedEnrichmentLimit(channel: "direct" | "partner", ready: number, configuredMaximum: number) {
  const decision = inventoryDecision(channel, ready);
  if (ready >= decision.target || ready >= decision.ceiling) return 0;
  const cap = Math.max(0, Math.floor(configuredMaximum));
  return Math.min(cap, decision.desired);
}

export function socialDiscoveryBreadth(actionable: number) {
  return Math.max(0, Math.floor(Number(actionable) || 0)) < GTM_INVENTORY_POLICY.social.preferredFloor ? "EXPANDED" as const : "STANDARD" as const;
}
