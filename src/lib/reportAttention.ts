import type { CompilationResult } from "../types/prototype";

export interface ReportAttentionItem {
  id: string;
  kind: "setup" | "transactions" | "financial" | "input" | "review";
  title: string;
  detail: string;
}

export function buildReportAttention(result: CompilationResult): ReportAttentionItem[] {
  const items: ReportAttentionItem[] = result.setupConflicts.map((conflict) => ({
    id: conflict.id,
    kind: "setup",
    title: conflict.title,
    detail: conflict.detail
  }));

  const categoryExceptions = uniqueByTransaction(result.mappings.filter((mapping) => mapping.reportTreatment === "needs_category_review"));
  if (categoryExceptions.length) {
    items.push({
      id: "transaction-category-exceptions",
      kind: "transactions",
      title: `${categoryExceptions.length} ${categoryExceptions.length === 1 ? "transaction needs" : "transactions need"} a category decision`,
      detail: humanList(categoryExceptions.map((mapping) => mapping.transactionId))
    });
  }

  const duplicateExceptions = uniqueByTransaction(result.mappings.filter((mapping) => mapping.reportTreatment === "excluded_duplicate"));
  if (duplicateExceptions.length) {
    items.push({
      id: "transaction-duplicate-exceptions",
      kind: "transactions",
      title: `${duplicateExceptions.length} potential ${duplicateExceptions.length === 1 ? "duplicate needs" : "duplicates need"} review`,
      detail: `${humanList(duplicateExceptions.map((mapping) => mapping.transactionId))} ${duplicateExceptions.length === 1 ? "is" : "are"} excluded from provisional totals.`
    });
  }

  const otherTransactionExceptions = uniqueByTransaction(result.mappings.filter((mapping) => {
    if (["needs_category_review", "excluded_duplicate", "excluded_outside_period", "excluded_grant_period"].includes(mapping.reportTreatment || "")) return false;
    return mapping.requiresHumanAction || ["review", "blocked"].includes(mapping.status);
  }));
  if (otherTransactionExceptions.length) {
    items.push({
      id: "transaction-other-exceptions",
      kind: "transactions",
      title: `Review ${otherTransactionExceptions.length} additional transaction ${otherTransactionExceptions.length === 1 ? "exception" : "exceptions"}`,
      detail: humanList(otherTransactionExceptions.map((mapping) => mapping.transactionId))
    });
  }

  const openFinancialControls = result.financialAnalysis?.controls.filter((item) => item.requiresAction && result.qualityChecks.find((check) => check.id === `deterministic-financial-${item.id}`)?.status !== "passed") || [];
  for (const control of openFinancialControls) {
    items.push({ id: control.id, kind: "financial", title: control.title, detail: control.detail });
  }

  const financialEvidenceAction = openFinancialControls.some((item) => /approval|support/i.test(`${item.title} ${item.detail}`));
  for (const input of result.inputStatus.filter((item) => item.requiredForCompletion && !item.available)) {
    if (input.role === "supportingEvidence" && financialEvidenceAction) continue;
    items.push({ id: `input-${input.role}`, kind: "input", title: `Add ${input.label.toLowerCase()}`, detail: input.detail });
  }

  const remainingReview = result.qualityChecks.filter((check) => check.required && ["blocked", "review"].includes(check.status) && !check.id.startsWith("deterministic-financial-") && check.id !== "deterministic-ledger");
  if (remainingReview.length) {
    items.push({ id: "remaining-review", kind: "review", title: "Review the remaining report checks", detail: `${remainingReview.length} related checks are grouped here instead of being presented as separate tasks.` });
  }

  return items;
}

export function machineCheckCount(result: CompilationResult) {
  return result.validation.findings.length + result.qualityChecks.length;
}

function uniqueByTransaction<T extends { transactionId: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.transactionId, item])).values()];
}

function humanList(items: string[]) {
  if (items.length < 2) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
