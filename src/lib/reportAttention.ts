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

  const transactionExceptions = uniqueByTransaction(result.mappings.filter((mapping) => {
    const needsReview = mapping.requiresHumanAction || (["review", "blocked"].includes(mapping.status) && !["outside_grant_period", "outside_report_period"].includes(mapping.reviewReason || ""));
    if (!needsReview) return false;
    const finding = result.validation.findings.find((item) => item.itemId === `mapping:${mapping.transactionId}`);
    return !finding || finding.verdict !== "source_matched";
  }));
  if (transactionExceptions.length) {
    items.push({
      id: "transaction-exceptions",
      kind: "transactions",
      title: `Review ${transactionExceptions.length} transaction ${transactionExceptions.length === 1 ? "exception" : "exceptions"}`,
      detail: humanList(transactionExceptions.map((mapping) => mapping.transactionId))
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
