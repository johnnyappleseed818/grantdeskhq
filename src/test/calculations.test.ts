import { describe, expect, it } from "vitest";
import { budget, transactions } from "../data/grantData";
import {
  annualBudgetTotal,
  canGenerateReviewPackage,
  categoryActualTotals,
  elapsedExpectedSpend,
  hasNumericContradiction,
  isUnsupportedStatement,
  mappedActualTotal,
  remainingMappedBalance,
  transactionTotal,
  unresolvedReviewCount,
  varianceForCategory,
  youthAchievementPercentage
} from "../lib/calculations";

describe("synthetic financial source model", () => {
  it("contains an approved annual budget totaling exactly $150,000", () => {
    expect(annualBudgetTotal()).toBe(150000);
    expect(budget).toHaveLength(4);
  });

  it("contains exactly 20 transactions totaling $75,400", () => {
    expect(transactions).toHaveLength(20);
    expect(transactionTotal()).toBe(75400);
  });

  it("excludes the single unmapped transaction from the $74,150 mapped total", () => {
    const unmapped = transactions.filter((transaction) => transaction.suggestedCategory === null);
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]).toMatchObject({ id: "UNM-001", amount: 1250 });
    expect(mappedActualTotal()).toBe(74150);
  });

  it("calculates the remaining mapped budget as exactly $75,850", () => {
    expect(remainingMappedBalance()).toBe(75850);
  });

  it("matches every required mapped category total exactly", () => {
    expect(categoryActualTotals()).toEqual({
      Personnel: 44500,
      "Program Supplies": 14850,
      "Local Travel": 9800,
      "Indirect Overhead": 5000
    });
  });

  it("matches the required transaction distribution", () => {
    expect(transactions.filter((item) => item.suggestedCategory === "Personnel")).toHaveLength(8);
    expect(transactions.filter((item) => item.suggestedCategory === "Program Supplies")).toHaveLength(6);
    expect(transactions.filter((item) => item.suggestedCategory === "Local Travel")).toHaveLength(3);
    expect(transactions.filter((item) => item.suggestedCategory === "Indirect Overhead")).toHaveLength(2);
    expect(transactions.filter((item) => item.suggestedCategory === null)).toHaveLength(1);
  });

  it("calculates the exact six-month elapsed-period plan", () => {
    expect(elapsedExpectedSpend()).toEqual({
      Personnel: 45000,
      "Program Supplies": 17500,
      "Local Travel": 7500,
      "Indirect Overhead": 5000
    });
  });

  it("calculates Local Travel as $2,300 and 30.67% above elapsed plan", () => {
    const travel = varianceForCategory("Local Travel");
    expect(travel.annualBudget).toBe(15000);
    expect(travel.expected).toBe(7500);
    expect(travel.actual).toBe(9800);
    expect(travel.varianceAmount).toBe(2300);
    expect(travel.variancePercentage).toBeCloseTo(30.6666667, 5);
    expect(travel.remaining).toBe(5200);
    expect(travel.status).toBe("Above plan");
  });
});

describe("narrative and quality controls", () => {
  it("calculates youth-served achievement as 98.3% when displayed to one decimal", () => {
    expect(youthAchievementPercentage()).toBeCloseTo(98.3333333, 5);
    expect(youthAchievementPercentage().toFixed(1)).toBe("98.3");
  });

  it("detects an unsupported hotel-cost statement", () => {
    expect(isUnsupportedStatement("Travel increased because of unexpected hotel costs.")).toBe(true);
    expect(isUnsupportedStatement("Mileage increased after approved school-site visits.")).toBe(false);
  });

  it("detects the contradiction between a claim of 120 and confirmed 118", () => {
    expect(hasNumericContradiction(120, 118)).toBe(true);
    expect(hasNumericContradiction(118, 118)).toBe(false);
  });

  it("keeps export disabled while any required review item remains", () => {
    const state = { unmappedTransaction: true, missingReceipt: false, certification: true };
    expect(unresolvedReviewCount(state)).toBe(1);
    expect(canGenerateReviewPackage(state)).toBe(false);
  });

  it("enables export only after all required review items are resolved", () => {
    const state = { unmappedTransaction: true, missingReceipt: true, certification: true };
    expect(unresolvedReviewCount(state)).toBe(0);
    expect(canGenerateReviewPackage(state)).toBe(true);
  });
});
