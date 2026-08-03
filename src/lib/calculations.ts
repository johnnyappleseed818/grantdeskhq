import type { BudgetCategoryName, BudgetLine, Transaction } from "../data/grantData";
import { budget, transactions } from "../data/grantData";

export const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

export const formatCurrency = (value: number) => currency.format(value);
export const formatPercent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

export const annualBudgetTotal = (lines: BudgetLine[] = budget) =>
  lines.reduce((sum, line) => sum + line.annualBudget, 0);

export const transactionTotal = (items: Transaction[] = transactions) =>
  items.reduce((sum, transaction) => sum + transaction.amount, 0);

export const mappedTransactions = (items: Transaction[] = transactions) =>
  items.filter((transaction) => transaction.suggestedCategory !== null);

export const mappedActualTotal = (items: Transaction[] = transactions) =>
  transactionTotal(mappedTransactions(items));

export const remainingMappedBalance = (
  lines: BudgetLine[] = budget,
  items: Transaction[] = transactions
) => annualBudgetTotal(lines) - mappedActualTotal(items);

export const categoryActualTotals = (items: Transaction[] = transactions) => {
  const initial: Record<BudgetCategoryName, number> = {
    Personnel: 0,
    "Program Supplies": 0,
    "Local Travel": 0,
    "Indirect Overhead": 0
  };

  return items.reduce((totals, transaction) => {
    if (transaction.suggestedCategory) {
      totals[transaction.suggestedCategory] += transaction.amount;
    }
    return totals;
  }, initial);
};

export const elapsedExpectedSpend = (lines: BudgetLine[] = budget, elapsed = 0.5) =>
  Object.fromEntries(
    lines.map((line) => [line.category, line.annualBudget * elapsed])
  ) as Record<BudgetCategoryName, number>;

export interface VarianceResult {
  category: BudgetCategoryName;
  annualBudget: number;
  actual: number;
  expected: number;
  remaining: number;
  varianceAmount: number;
  variancePercentage: number;
  status: "Above plan" | "Below plan" | "Within plan";
}

export const varianceForCategory = (
  category: BudgetCategoryName,
  lines: BudgetLine[] = budget,
  items: Transaction[] = transactions,
  elapsed = 0.5
): VarianceResult => {
  const annual = lines.find((line) => line.category === category)?.annualBudget ?? 0;
  const actual = categoryActualTotals(items)[category];
  const expected = annual * elapsed;
  const varianceAmount = actual - expected;
  const variancePercentage = expected === 0 ? 0 : (varianceAmount / expected) * 100;
  const status = variancePercentage > 10
    ? "Above plan"
    : variancePercentage < -10
      ? "Below plan"
      : "Within plan";

  return {
    category,
    annualBudget: annual,
    actual,
    expected,
    remaining: annual - actual,
    varianceAmount,
    variancePercentage,
    status
  };
};

export const youthAchievementPercentage = (served = 118, target = 120) =>
  target === 0 ? 0 : (served / target) * 100;

const unsupportedTravelTerms = ["hotel", "airfare", "lodging", "overnight"];

export const isUnsupportedStatement = (statement: string) => {
  const normalized = statement.toLowerCase();
  return unsupportedTravelTerms.some((term) => normalized.includes(term));
};

export const hasNumericContradiction = (claimed: number, confirmed: number) => claimed !== confirmed;

export interface RequiredReviewState {
  unmappedTransaction: boolean;
  missingReceipt: boolean;
  certification: boolean;
}

export const unresolvedReviewCount = (state: RequiredReviewState) =>
  Object.values(state).filter((resolved) => !resolved).length;

export const canGenerateReviewPackage = (state: RequiredReviewState) =>
  unresolvedReviewCount(state) === 0;
