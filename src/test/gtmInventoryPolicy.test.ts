import { describe, expect, it } from "vitest";
import { boundedEnrichmentLimit, GTM_INVENTORY_POLICY, inventoryDecision, socialDiscoveryBreadth } from "../lib/gtmInventoryPolicy";

describe("canonical GTM inventory policy", () => {
  it("uses the exact Direct, Partner, and Content operating buffers", () => {
    expect(GTM_INVENTORY_POLICY.direct).toEqual({ floor: 600, target: 1000, ceiling: 1200 });
    expect(GTM_INVENTORY_POLICY.partner).toEqual({ floor: 300, target: 500, ceiling: 600 });
    expect(GTM_INVENTORY_POLICY.content).toEqual({ floor: 2, target: 4, ceiling: 6 });
  });

  it("triggers below floor, permits modest work below target, and stops paid enrichment at target", () => {
    expect(inventoryDecision("direct", 599)).toMatchObject({ triggered: true, desired: 401, state: "REPLENISHING" });
    expect(inventoryDecision("direct", 800)).toMatchObject({ triggered: false, desired: 200, state: "HEALTHY" });
    expect(boundedEnrichmentLimit("direct", 1000, 100)).toBe(0);
    expect(boundedEnrichmentLimit("partner", 299, 100)).toBe(100);
    expect(boundedEnrichmentLimit("partner", 500, 100)).toBe(0);
  });

  it("caps every buffer and naturally resumes work after Ready inventory is consumed", () => {
    expect(inventoryDecision("direct", 1200)).toMatchObject({ desired: 0, state: "HEALTHY" });
    expect(boundedEnrichmentLimit("direct", 1199, 100)).toBe(0);
    expect(inventoryDecision("content", 6)).toMatchObject({ desired: 0, state: "HEALTHY" });
    expect(inventoryDecision("partner", 299)).toMatchObject({ triggered: true, desired: 201, state: "REPLENISHING" });
  });

  it("keeps Social quality gating intact while expanding only discovery breadth below its preferred floor", () => {
    expect(socialDiscoveryBreadth(2)).toBe("EXPANDED");
    expect(socialDiscoveryBreadth(3)).toBe("STANDARD");
  });
});
