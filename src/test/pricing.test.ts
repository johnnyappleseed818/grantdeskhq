import { describe, expect, it } from "vitest";
import { PRICING_PLANS } from "../content/pricing";

describe("subscription pricing", () => {
  it("makes every annual plan exactly 10% less expensive than twelve monthly payments", () => {
    for (const plan of PRICING_PLANS) {
      expect(Math.round(plan.annual * 100)).toBe(plan.monthly * 12 * 90);
    }
  });
});
