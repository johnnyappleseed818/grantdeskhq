import type { CompilationResult } from "../types/prototype";
import { satisfiedProgramCheckIds } from "./programInsights";

export interface ReportAttentionItem {
  id: string;
  kind: "setup" | "transactions" | "financial" | "input" | "review";
  title: string;
  detail: string;
}

export interface FinancialExceptionItem extends ReportAttentionItem {
  transactionIds: string[];
}

export function buildReportAttention(result: CompilationResult): ReportAttentionItem[] {
  const items: ReportAttentionItem[] = result.setupConflicts.map((conflict) => ({
    id: conflict.id,
    kind: "setup",
    title: conflict.title,
    detail: conflict.detail
  }));

  const financialExceptions = buildFinancialExceptionSummary(result);
  items.push(...financialExceptions);

  const satisfiedProgramChecks = satisfiedProgramCheckIds(result);
  for (const check of (result.programChecks || []).filter((item) => item.severity !== "info" && item.resolution === "open" && !satisfiedProgramChecks.has(item.id))) {
    items.push({
      id: `program-${check.id}`,
      kind: check.severity === "action_required" ? "review" : "input",
      title: check.title,
      detail: check.detail
    });
  }

  const financialEvidenceAction = financialExceptions.some((item) => /approval|support|evidence/i.test(`${item.title} ${item.detail}`));
  for (const input of result.inputStatus.filter((item) => item.requiredForCompletion && !item.available)) {
    if (input.role === "supportingEvidence" && financialEvidenceAction) continue;
    items.push({ id: `input-${input.role}`, kind: "input", title: `Add ${input.label.toLowerCase()}`, detail: input.detail });
  }

  const remainingReview = result.qualityChecks.filter((check) => check.required && ["blocked", "review"].includes(check.status) && !check.id.startsWith("deterministic-financial-") && !check.id.startsWith("program-") && check.id !== "deterministic-ledger");
  if (remainingReview.length) {
    items.push({ id: "remaining-review", kind: "review", title: "Review the remaining report checks", detail: `${remainingReview.length} related checks are grouped here instead of being presented as separate tasks.` });
  }

  return items;
}

export function buildFinancialExceptionSummary(result: CompilationResult): FinancialExceptionItem[] {
  const items: FinancialExceptionItem[] = [];
  const categoryExceptions = uniqueByTransaction(result.mappings.filter((mapping) => mapping.reportTreatment === "needs_category_review"));
  if (categoryExceptions.length) {
    items.push({
      id: "transaction-category-exceptions",
      kind: "transactions",
      title: `${categoryExceptions.length} ${categoryExceptions.length === 1 ? "transaction needs" : "transactions need"} a category decision`,
      detail: `${humanList(categoryExceptions.map((mapping) => mapping.transactionId))} cannot be included until a category is selected.`,
      transactionIds: categoryExceptions.map((mapping) => mapping.transactionId)
    });
  }

  const duplicateExceptions = uniqueByTransaction(result.mappings.filter((mapping) => mapping.reportTreatment === "excluded_duplicate"));
  if (duplicateExceptions.length) {
    const total = duplicateExceptions.reduce((sum, mapping) => sum + Math.abs(mapping.amount), 0);
    items.push({
      id: "transaction-duplicate-exceptions",
      kind: "transactions",
      title: `${duplicateExceptions.length} potential ${duplicateExceptions.length === 1 ? "duplicate needs" : "duplicates need"} review`,
      detail: `${humanList(duplicateExceptions.map((mapping) => mapping.transactionId))} (${currency(total)}) ${duplicateExceptions.length === 1 ? "is" : "are"} excluded from provisional totals.`,
      transactionIds: duplicateExceptions.map((mapping) => mapping.transactionId)
    });
  }

  const duplicateAlreadyRepresented = items.some((item) => item.id === "transaction-duplicate-exceptions");
  const openControls = result.financialAnalysis?.controls.filter((item) => item.requiresAction
    && result.qualityChecks.find((check) => check.id === `deterministic-financial-${item.id}`)?.status !== "passed"
    && !(item.id === "duplicate-transactions" && duplicateAlreadyRepresented)) || [];
  const controlGroups = connectedControlGroups(openControls);
  for (const group of controlGroups) {
    const transactionIds = [...new Set(group.flatMap((control) => control.transactionIds))];
    const variance = result.financialAnalysis?.budgetVariances.find((item) => item.transactionIds.some((id) => transactionIds.includes(id)) && item.explanationRequired);
    const combinesEligibilityAndVariance = group.length > 1 && variance && group.some((control) => /eligib|allowab/i.test(`${control.id} ${control.title} ${control.detail}`));
    items.push({
      id: group.map((control) => control.id).sort().join("+"),
      kind: "financial",
      title: combinesEligibilityAndVariance ? `Review ${variance.category} allowability and variance` : group[0].title,
      detail: combinesEligibilityAndVariance
        ? `${variance.category} is ${currency(Math.abs(variance.varianceAmount))} above its approved budget. Confirm allowability, add the variance explanation, and attach approval if the overage reflects a budget reallocation.`
        : group.map((control) => control.detail).filter((value, index, values) => values.indexOf(value) === index).join(" "),
      transactionIds
    });
  }

  const covered = new Set(items.flatMap((item) => item.transactionIds));
  const otherTransactionExceptions = uniqueByTransaction(result.mappings.filter((mapping) => {
    if (covered.has(mapping.transactionId)) return false;
    if (["needs_category_review", "excluded_duplicate", "excluded_outside_period", "excluded_grant_period"].includes(mapping.reportTreatment || "")) return false;
    return mapping.requiresHumanAction || ["review", "blocked"].includes(mapping.status);
  }));
  if (otherTransactionExceptions.length) {
    items.push({
      id: "transaction-other-exceptions",
      kind: "transactions",
      title: `Review ${otherTransactionExceptions.length} additional transaction ${otherTransactionExceptions.length === 1 ? "exception" : "exceptions"}`,
      detail: humanList(otherTransactionExceptions.map((mapping) => mapping.transactionId)),
      transactionIds: otherTransactionExceptions.map((mapping) => mapping.transactionId)
    });
  }
  return items;
}

export function machineCheckCount(result: CompilationResult) {
  return result.validation.findings.length + result.qualityChecks.length;
}

function connectedControlGroups<T extends { transactionIds: string[] }>(controls: T[]) {
  const remaining = [...controls];
  const groups: T[][] = [];
  while (remaining.length) {
    const group = [remaining.shift()!];
    let expanded = true;
    while (expanded) {
      expanded = false;
      const ids = new Set(group.flatMap((control) => control.transactionIds));
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        const overlaps = remaining[index].transactionIds.some((id) => ids.has(id));
        if (!overlaps || (!ids.size && !remaining[index].transactionIds.length)) continue;
        group.push(remaining.splice(index, 1)[0]);
        expanded = true;
      }
    }
    groups.push(group);
  }
  return groups;
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function uniqueByTransaction<T extends { transactionId: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.transactionId, item])).values()];
}

function humanList(items: string[]) {
  if (items.length < 2) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
