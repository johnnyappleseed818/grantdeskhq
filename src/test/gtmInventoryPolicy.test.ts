import { describe, expect, it } from "vitest";
import { boundedEnrichmentLimit, GTM_INVENTORY_POLICY, inventoryDecision, socialDiscoveryBreadth } from "../lib/gtmInventoryPolicy";

describe("canonical GTM inventory policy", () => {
  it("uses the exact Direct, Partner, and Content operating buffers", () => {
    expect(GTM_INVENTORY_POLICY.direct).toEqual({ floor: 25, target: 50, ceiling: 75 });
    expect(GTM_INVENTORY_POLICY.partner).toEqual({ floor: 10, target: 25, ceiling: 40 });
    expect(GTM_INVENTORY_POLICY.content).toEqual({ floor: 2, target: 4, ceiling: 6 });
  });

  it("triggers below floor, permits modest work below target, and stops paid enrichment at target", () => {
    expect(inventoryDecision("direct", 24)).toMatchObject({ triggered: true, desired: 26, state: "REPLENISHING" });
    expect(inventoryDecision("direct", 30)).toMatchObject({ triggered: false, desired: 20, state: "HEALTHY" });
    expect(boundedEnrichmentLimit("direct", 50, 10)).toBe(0);
    expect(boundedEnrichmentLimit("partner", 9, 10)).toBe(10);
    expect(boundedEnrichmentLimit("partner", 25, 10)).toBe(0);
  });

  it("caps every buffer and naturally resumes work after Ready inventory is consumed", () => {
    expect(inventoryDecision("direct", 75)).toMatchObject({ desired: 0, state: "HEALTHY" });
    expect(boundedEnrichmentLimit("direct", 74, 10)).toBe(0);
    expect(inventoryDecision("content", 6)).toMatchObject({ desired: 0, state: "HEALTHY" });
    expect(inventoryDecision("partner", 9)).toMatchObject({ triggered: true, desired: 16, state: "REPLENISHING" });
  });

  it("keeps Social quality gating intact while expanding only discovery breadth below its preferred floor", () => {
    expect(socialDiscoveryBreadth(2)).toBe("EXPANDED");
    expect(socialDiscoveryBreadth(3)).toBe("STANDARD");
  });
});
