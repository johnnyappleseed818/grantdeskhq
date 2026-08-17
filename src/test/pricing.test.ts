import fs from "node:fs";
import path from "node:path";
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

  it("keeps required public pricing copy free of legacy commercial explanations", () => {
    const pricingPage = fs.readFileSync(path.resolve("src/pages/PricingPage.tsx"), "utf8");
    const workspacePage = fs.readFileSync(path.resolve("src/pages/WorkspacePage.tsx"), "utf8");
    const metadata = fs.readFileSync(path.resolve("index.html"), "utf8");
    const publicCustomerCopy = [pricingPage, workspacePage, metadata].join("\n");

    expect(pricingPage).toContain("Choose the GrantDeskHQ workflow that fits your reporting needs.");
    expect(pricingPage).toContain("Choose the plan that fits your current grant workload and scale as your reporting needs grow.");
    expect(pricingPage).toContain("LIMITED-TIME PRICING");
    expect(pricingPage).toContain("Lock in your current price for as long as your subscription remains active.");
    expect(workspacePage).toContain("Current price retained");
    expect(publicCustomerCopy).not.toMatch(/\bfound(?:er|ing)\b|Stripe|coupon|\bserver\b/i);
  });
});
