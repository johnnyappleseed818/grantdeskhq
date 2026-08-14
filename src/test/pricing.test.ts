import { describe, expect, it } from "vitest";
import { PLAN_ENTITLEMENTS, PRICING_PLANS, subscriptionIsEntitled } from "../content/pricing";

describe("subscription pricing and canonical entitlements", () => {
  it("publishes the approved monthly list and founding prices", () => {
    expect(PRICING_PLANS.map((plan) => [plan.id, plan.monthly, plan.foundingMonthly])).toEqual([
      ["starter", 99, 49],
      ["growth", 199, 99],
      ["agency", 499, 299]
    ]);
  });

  it("keeps one entitlement definition with the existing plan capacities", () => {
    expect(PLAN_ENTITLEMENTS.starter).toMatchObject({ activeGrants: 5, reportsPerYear: 24 });
    expect(PLAN_ENTITLEMENTS.growth).toMatchObject({ activeGrants: 20, reportsPerYear: 72 });
    expect(PLAN_ENTITLEMENTS.agency).toMatchObject({ activeGrants: 50, reportsPerYear: 200 });
    expect(subscriptionIsEntitled("active")).toBe(true);
    expect(subscriptionIsEntitled("past_due")).toBe(false);
  });
});
