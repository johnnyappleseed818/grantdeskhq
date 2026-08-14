export const PLAN_KEYS = ["starter", "growth", "agency"] as const;
export type PlanId = typeof PLAN_KEYS[number];

export interface PricingPlan {
  id: PlanId;
  name: string;
  monthly: number;
  foundingMonthly: number;
  activeGrants: number;
  reportsPerYear: number;
  bestFor: string;
  description: string;
  support: string;
  featured?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter Nonprofit",
    monthly: 99,
    foundingMonthly: 49,
    activeGrants: 5,
    reportsPerYear: 24,
    bestFor: "Small nonprofit grant teams",
    description: "For a nonprofit moving its focused grant portfolio out of spreadsheet-heavy report preparation.",
    support: "Standard email support"
  },
  {
    id: "growth",
    name: "Growth",
    monthly: 199,
    foundingMonthly: 99,
    activeGrants: 20,
    reportsPerYear: 72,
    bestFor: "Growing nonprofit grant portfolios",
    description: "For nonprofits coordinating recurring reports across Grants, Finance, Program, and reviewers.",
    support: "Priority email support",
    featured: true
  },
  {
    id: "agency",
    name: "Fractional CFO Agency",
    monthly: 499,
    foundingMonthly: 299,
    activeGrants: 50,
    reportsPerYear: 200,
    bestFor: "Fractional CFO and nonprofit accounting firms",
    description: "For an agency supporting a larger, multi-client grant-reporting portfolio.",
    support: "Priority support and onboarding guidance"
  }
];

export interface PlanEntitlement {
  planKey: PlanId;
  activeGrants: number;
  reportsPerYear: number;
  audience: string;
}

export const PLAN_ENTITLEMENTS = Object.fromEntries(PRICING_PLANS.map((plan) => [plan.id, {
  planKey: plan.id,
  activeGrants: plan.activeGrants,
  reportsPerYear: plan.reportsPerYear,
  audience: plan.bestFor
}])) as Record<PlanId, PlanEntitlement>;

export function entitlementForPlan(planKey: PlanId) { return PLAN_ENTITLEMENTS[planKey]; }
export function subscriptionIsEntitled(status: string) { return status === "active" || status === "trialing"; }

export const INCLUDED_IN_EVERY_PLAN = [
  "AI-powered award and reporting-requirement extraction",
  "Budget, accounting-data, and program-update workflow",
  "Suggested transaction mappings and budget-versus-actual schedules",
  "Source-linked narrative drafts and missing-input checks",
  "Quality review controls and report history",
  "No per-user pricing"
];

export const ADDITIONAL_GRANTS_PRICE = 75;
export const ADDITIONAL_GRANTS_QUANTITY = 5;
export const ADDITIONAL_REPORT_PRICE = 25;

export function formatUsd(value: number) {
  const hasCents = !Number.isInteger(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0
  }).format(value);
}
