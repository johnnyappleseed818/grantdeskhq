import { describe, expect, it } from "vitest";
import { boundedEnrichmentLimit, GTM_INVENTORY_POLICY, inventoryDecision, socialDiscoveryBreadth } from "../lib/gtmInventoryPolicy";

describe("canonical GTM inventory policy", () => {
  it("uses the exact Direct, Partner, and Content operating buffers", () => {
    expect(GTM_INVENTORY_POLICY.direct).toEqual({ floor: 20, target: 30, ceiling: 45 });
    expect(GTM_INVENTORY_POLICY.partner).toEqual({ floor: 10, target: 15, ceiling: 25 });
    expect(GTM_INVENTORY_POLICY.content).toEqual({ floor: 2, target: 4, ceiling: 6 });
  });

  it("triggers below floor, permits modest work below target, and stops paid enrichment at target", () => {
    expect(inventoryDecision("direct", 19)).toMatchObject({ triggered: true, desired: 11, state: "REPLENISHING" });
    expect(inventoryDecision("direct", 25)).toMatchObject({ triggered: false, desired: 5, state: "HEALTHY" });
    expect(boundedEnrichmentLimit("direct", 30, 10)).toBe(0);
    expect(boundedEnrichmentLimit("partner", 9, 10)).toBe(6);
    expect(boundedEnrichmentLimit("partner", 15, 10)).toBe(0);
  });

  it("caps every buffer and naturally resumes work after Ready inventory is consumed", () => {
    expect(inventoryDecision("direct", 45)).toMatchObject({ desired: 0, state: "HEALTHY" });
    expect(boundedEnrichmentLimit("direct", 44, 10)).toBe(0);
    expect(inventoryDecision("content", 6)).toMatchObject({ desired: 0, state: "HEALTHY" });
    expect(inventoryDecision("partner", 9)).toMatchObject({ triggered: true, desired: 6, state: "REPLENISHING" });
  });

  it("keeps Social quality gating intact while expanding only discovery breadth below its preferred floor", () => {
    expect(socialDiscoveryBreadth(2)).toBe("EXPANDED");
    expect(socialDiscoveryBreadth(3)).toBe("STANDARD");
  });
});
