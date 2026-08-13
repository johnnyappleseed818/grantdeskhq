import type { CompilationResult } from "../src/types/prototype.ts";
import { buildProgramReadiness, expectedProgramKpiCount } from "../src/lib/programInsights.ts";
import { isMappingIncludedInFinancialAnalysis } from "./financialControls.ts";

type AnalysisResult = Pick<CompilationResult, "requirements" | "mappings" | "narrative" | "programChecks" | "qualityChecks" | "validation"> & Partial<Pick<CompilationResult, "financialAnalysis" | "evidenceFiles">>;

export function applyAnalysisIntegrityCheck<T extends AnalysisResult>(result: T): T {
  const issues = analysisIntegrityIssues(result);
  const qualityChecks = [
    ...result.qualityChecks.filter((check) => check.id !== "deterministic-analysis-integrity"),
    {
      id: "deterministic-analysis-integrity",
      label: "Analysis consistency",
      detail: issues.length
        ? `Action required — GrantDeskHQ detected ${issues.length} internal consistency ${issues.length === 1 ? "problem" : "problems"} and blocked the affected output: ${issues.join(" ")}`
        : "KPI counts, evidence references, transaction treatments, financial totals, and output identifiers are internally consistent.",
      required: true,
      status: issues.length ? "blocked" as const : "passed" as const
    }
  ];
  return { ...result, qualityChecks };
}

export function analysisIntegrityIssues(result: AnalysisResult) {
  const issues: string[] = [];
  duplicateIds("requirement", result.requirements.map((item) => item.id), issues);
  duplicateIds("narrative", result.narrative.map((item) => item.id), issues);
  duplicateIds("program check", (result.programChecks || []).map((item) => item.id), issues);
  duplicateIds("quality check", result.qualityChecks.filter((item) => item.id !== "deterministic-analysis-integrity").map((item) => item.id), issues);

  const evidenceIds = new Set((result.evidenceFiles || []).map((file) => file.id));
  for (const file of result.evidenceFiles || []) {
    if (file.relevance === "irrelevant" && file.matches.some((match) => match.status === "matched" || match.confirmedByUser)) issues.push(`Irrelevant evidence ${file.name} contains an accepted match.`);
  }
  for (const [label, ids] of evidenceReferences(result)) {
    const missing = ids.filter((id) => !evidenceIds.has(id));
    if (missing.length) issues.push(`${label} refers to evidence that is no longer attached.`);
  }

  const financial = result.financialAnalysis;
  if (financial?.ledgerTransactionCount) {
    const included = result.mappings.filter((mapping) => isMappingIncludedInFinancialAnalysis(mapping, result.requirements));
    const includedTotal = roundMoney(included.reduce((sum, mapping) => sum + mapping.amount, 0));
    const excludedCount = result.mappings.length - included.length;
    if (result.mappings.length !== financial.ledgerTransactionCount) issues.push(`The ledger contains ${financial.ledgerTransactionCount} rows but ${result.mappings.length} row treatments are present.`);
    if (included.length !== financial.mappedTransactionCount) issues.push(`The included-row count (${included.length}) does not match the financial summary (${financial.mappedTransactionCount}).`);
    if (excludedCount !== financial.excludedTransactionCount) issues.push(`The excluded-row count (${excludedCount}) does not match the financial summary (${financial.excludedTransactionCount}).`);
    if (!sameMoney(includedTotal, financial.mappedActualTotal)) issues.push(`Included transaction amounts total ${includedTotal}, but the financial summary reports ${financial.mappedActualTotal}.`);
    const categoryTotal = roundMoney(financial.budgetVariances.reduce((sum, item) => sum + item.actualAmount, 0));
    if (!sameMoney(categoryTotal, financial.mappedActualTotal)) issues.push(`Budget-to-actual category totals (${categoryTotal}) do not reconcile to mapped spend (${financial.mappedActualTotal}).`);
    duplicateIds("budget category", financial.budgetVariances.map((item) => item.category.toLowerCase()), issues);
    if (![financial.mappedActualTotal, ...financial.budgetVariances.flatMap((item) => [item.approvedAmount, item.actualAmount, item.varianceAmount, item.variancePercent])].every(Number.isFinite)) issues.push("The financial analysis contains a non-finite value.");
  }

  const readiness = buildProgramReadiness(result);
  const expectedKpis = expectedProgramKpiCount(result);
  const countedKpis = readiness.ready + readiness.conflicts + readiness.awaitingConfirmation;
  if (countedKpis !== expectedKpis) issues.push(`Program readiness accounts for ${countedKpis} of ${expectedKpis} identified KPI families.`);
  return [...new Set(issues)];
}

function evidenceReferences(result: AnalysisResult): Array<[string, string[]]> {
  return [
    ...result.requirements.map((item) => [`Requirement ${item.id}`, item.evidenceSatisfiedBy || []] as [string, string[]]),
    ...result.mappings.map((item) => [`Transaction ${item.transactionId}`, item.evidenceSatisfiedBy || []] as [string, string[]]),
    ...(result.programChecks || []).map((item) => [`Program check ${item.id}`, item.evidenceSatisfiedBy || []] as [string, string[]]),
    ...result.qualityChecks.map((item) => [`Quality check ${item.id}`, item.evidenceSatisfiedBy || []] as [string, string[]]),
    ...result.validation.findings.map((item) => [`Source check ${item.id}`, item.evidenceSatisfiedBy || []] as [string, string[]]),
    ...(result.financialAnalysis?.controls || []).map((item) => [`Financial control ${item.id}`, item.evidenceSatisfiedBy || []] as [string, string[]])
  ].filter(([, ids]) => ids.length);
}

function duplicateIds(label: string, ids: string[], issues: string[]) {
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) issues.push(`Duplicate ${label} identifiers were found: ${duplicates.join(", ")}.`);
}

function sameMoney(left: number, right: number) { return Math.abs(left - right) < 0.005; }
function roundMoney(value: number) { return Math.round(value * 100) / 100; }
