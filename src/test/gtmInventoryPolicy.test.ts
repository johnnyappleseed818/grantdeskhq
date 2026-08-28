import { describe, expect, it } from "vitest";
import { boundedEnrichmentLimit, GTM_INVENTORY_POLICY, inventoryDecision, socialDiscoveryBreadth } from "../lib/gtmInventoryPolicy";

describe("canonical GTM inventory policy", () => {
  it("uses the exact Direct, Partner, and Content operating buffers", () => {
    expect(GTM_INVENTORY_POLICY.direct).toEqual({ floor: 75, target: 150, ceiling: 225 });
    expect(GTM_INVENTORY_POLICY.partner).toEqual({ floor: 25, target: 50, ceiling: 75 });
    expect(GTM_INVENTORY_POLICY.content).toEqual({ floor: 2, target: 4, ceiling: 6 });
  });

  it("triggers below floor, permits modest work below target, and stops paid enrichment at target", () => {
    expect(inventoryDecision("direct", 74)).toMatchObject({ triggered: true, desired: 76, state: "REPLENISHING" });
    expect(inventoryDecision("direct", 100)).toMatchObject({ triggered: false, desired: 50, state: "HEALTHY" });
    expect(boundedEnrichmentLimit("direct", 150, 10)).toBe(0);
    expect(boundedEnrichmentLimit("partner", 24, 10)).toBe(10);
    expect(boundedEnrichmentLimit("partner", 50, 10)).toBe(0);
  });

  it("caps every buffer and naturally resumes work after Ready inventory is consumed", () => {
    expect(inventoryDecision("direct", 225)).toMatchObject({ desired: 0, state: "HEALTHY" });
    expect(boundedEnrichmentLimit("direct", 224, 10)).toBe(0);
    expect(inventoryDecision("content", 6)).toMatchObject({ desired: 0, state: "HEALTHY" });
    expect(inventoryDecision("partner", 24)).toMatchObject({ triggered: true, desired: 26, state: "REPLENISHING" });
  });

  it("keeps Social quality gating intact while expanding only discovery breadth below its preferred floor", () => {
    expect(socialDiscoveryBreadth(2)).toBe("EXPANDED");
    expect(socialDiscoveryBreadth(3)).toBe("STANDARD");
  });
});
