export type PlanId = "essentials" | "growth" | "portfolio";
export type BillingInterval = "month" | "year";

export interface PricingPlan {
  id: PlanId;
  name: string;
  monthly: number;
  annual: number;
  activeGrants: number;
  reportsPerYear: number;
  bestFor: string;
  description: string;
  support: string;
  featured?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "essentials",
    name: "Essentials",
    monthly: 199,
    annual: 2_149.20,
    activeGrants: 5,
    reportsPerYear: 24,
    bestFor: "Smaller nonprofit grant teams",
    description: "For teams replacing spreadsheet-heavy report preparation across a focused grant portfolio.",
    support: "Standard email support"
  },
  {
    id: "growth",
    name: "Growth",
    monthly: 399,
    annual: 4_309.20,
    activeGrants: 20,
    reportsPerYear: 72,
    bestFor: "Growing nonprofit grant portfolios",
    description: "For nonprofits coordinating recurring reports across Grants, Finance, Program, and reviewers.",
    support: "Priority email support",
    featured: true
  },
  {
    id: "portfolio",
    name: "Portfolio",
    monthly: 699,
    annual: 7_549.20,
    activeGrants: 50,
    reportsPerYear: 200,
    bestFor: "Larger and more complex portfolios",
    description: "For organizations managing a high volume of funder-specific reports across multiple teams or programs.",
    support: "Priority support and onboarding guidance"
  }
];

export const INCLUDED_IN_EVERY_PLAN = [
  "AI-assisted award and reporting-requirement extraction",
  "Budget, accounting-data, and program-update workflow",
  "Suggested transaction mappings and budget-versus-actual schedules",
  "Source-linked narrative drafts and missing-input checks",
  "Quality review controls and report history",
  "No per-user pricing"
];

export const EARLY_ACCESS_DISCOUNT_PERCENT = 50;
export const EARLY_ACCESS_DISCOUNT_MONTHS = 12;
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
