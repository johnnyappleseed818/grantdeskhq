import type { CompilationRequest, CompilationResult, ValidationFinding } from "../src/types/prototype.ts";
import { buildFinancialAnalysis, findExactBudgetCategory, type FinancialLedgerRow } from "./financialControls.ts";

interface WorkflowFacts {
  programMetrics?: Array<{ label: string; target: number; actual: number }>;
  budgetVsActual?: Array<{ approvedAmount: number; actualEligibleExpenditure: number; remainingAmount: number; percentageSpent: number; varianceAmount: number; spendRateAgainstElapsedPlan: number | null }>;
  knownFinancialAmounts?: number[];
}

export function applyDeterministicAccuracyChecks(request: CompilationRequest, result: CompilationResult): CompilationResult {
  const ledger = parseLedger(request);
  const hasLedgerFile = request.files.some((item) => item.role === "ledgerExport");
  const deterministicFindings: ValidationFinding[] = [];
  const seen = new Set<string>();
  const ledgerIds = new Set(ledger.map((row) => row.id));
  let mappingIssue = hasLedgerFile && (ledger.length === 0 || ledgerIds.size !== ledger.length);
  if (ledgerIds.size !== ledger.length) deterministicFindings.push(finding("ledger", "blocked", "The uploaded ledger contains duplicate transaction IDs."));
  const mappings = result.mappings.map((mapping) => {
    const row = ledger.find((candidate) => candidate.id === mapping.transactionId);
    if (!row || seen.has(mapping.transactionId)) {
      mappingIssue = true;
      deterministicFindings.push(finding(mapping.transactionId, "blocked", row ? "Duplicate transaction mapping detected." : "Transaction ID does not exist in the uploaded ledger."));
      return { ...mapping, confidence: 0, status: "blocked" as const, reviewReason: row ? "duplicate" as const : "ambiguous" as const, requiresHumanAction: true };
    }
    seen.add(mapping.transactionId);
    const amountMatches = Math.abs(mapping.amount - row.amount) < 0.005;
    if (!amountMatches) {
      mappingIssue = true;
      deterministicFindings.push(finding(mapping.transactionId, "blocked", `AI amount ${mapping.amount} did not match ledger amount ${row.amount}. The ledger value replaced it.`));
    }
    const periodIssue = dateExclusion(row.date, request.reportingPeriod, result.grantProfile.grantStartDate?.value, result.grantProfile.grantEndDate?.value);
    if (periodIssue) deterministicFindings.push(finding(mapping.transactionId, "review", periodIssue.detail));
    const exactCategory = findExactBudgetCategory(row.account, result.requirements);
    const modelUnresolved = mapping.status === "blocked" || /^unmapped$/i.test(mapping.suggestedCategory);
    const exactBudgetSuggestion = !periodIssue && amountMatches && modelUnresolved && Boolean(exactCategory);
    return {
      ...mapping,
      date: row.date,
      description: row.description,
      amount: row.amount,
      suggestedCategory: exactBudgetSuggestion ? exactCategory : mapping.suggestedCategory,
      confidence: exactBudgetSuggestion ? 0.95 : mapping.confidence,
      status: periodIssue || !amountMatches ? "blocked" as const : exactBudgetSuggestion ? "review" as const : mapping.status,
      reviewReason: periodIssue?.reason || (exactBudgetSuggestion ? "exact_budget_match" as const : modelUnresolved ? "ambiguous" as const : undefined),
      requiresHumanAction: periodIssue ? false : exactBudgetSuggestion || modelUnresolved || mapping.status === "review",
      rationale: periodIssue
        ? `${periodIssue.detail} Excluded from current-period mapped totals.`
        : exactBudgetSuggestion
          ? `The ledger account “${row.account}” exactly matches a source-verified budget category. Suggested for controller review; the transaction amount comes directly from the uploaded ledger.`
          : `${mapping.rationale} Confirmed against the uploaded ledger by transaction ID, date, description and amount.`
    };
  });
  for (const row of ledger) {
    if (!seen.has(row.id)) {
      mappingIssue = true;
      deterministicFindings.push(finding(`ledger:${row.id}`, "blocked", `Ledger transaction ${row.id} was omitted from the AI mapping output.`));
    }
  }

  const sourceNames = new Set(request.files.map((file) => file.name));
  for (const item of [...result.requirements, ...result.narrative]) {
    if (!sourceNames.has(item.source.sourceName) || !item.source.locator.trim() || !item.source.excerpt.trim()) {
      deterministicFindings.push(finding(item.id, "blocked", "The citation does not contain a complete reference to an uploaded source."));
    }
  }

  const workflowFacts = parseWorkflowFacts(request);
  const hasWorkflowFacts = Boolean(workflowFacts.programMetrics?.length || workflowFacts.budgetVsActual?.length || workflowFacts.knownFinancialAmounts?.length);
  const sourceMatchedRequirementIds = new Set(result.validation.findings.filter((item) => item.verdict === "source_matched" && item.itemId.startsWith("requirement:")).map((item) => item.itemId.slice("requirement:".length)));
  const sourceMatchedRequirementAmounts = result.requirements
    .filter((item) => sourceMatchedRequirementIds.has(item.id))
    .flatMap((item) => extractFinancialAmounts(`${item.requirement} ${item.source.excerpt}`));
  const sourceFinancialAmounts = [...ledger.map((row) => row.amount), ...sourceMatchedRequirementAmounts];
  let workflowFactIssue = false;
  const narrative = result.narrative.map((item) => {
    const reasons = narrativeContradictions(item.text, workflowFacts, sourceFinancialAmounts);
    if (!reasons.length) return item;
    workflowFactIssue = true;
    deterministicFindings.push(finding(item.id, "blocked", reasons.join(" ")));
    return { ...item, status: "blocked" as const };
  });

  const exactLedgerCoverage = hasLedgerFile && ledger.length > 0 && ledger.length === seen.size && !mappingIssue;
  const ledgerStatus = !hasLedgerFile ? "not_evaluated" as const : exactLedgerCoverage ? "passed" as const : "blocked" as const;
  const workflowFactStatus = !hasWorkflowFacts ? "not_evaluated" as const : workflowFactIssue ? "blocked" as const : "passed" as const;
  const financialAnalysis = buildFinancialAnalysis(request, result.requirements, result.grantProfile, ledger, mappings);
  const qualityChecks = [
    ...result.qualityChecks.filter((check) => !["deterministic-ledger", "deterministic-workflow-facts"].includes(check.id)),
    {
      id: "deterministic-ledger",
      label: "Ledger reconciliation",
      detail: !hasLedgerFile ? "Not evaluated — no accounting export has been added yet." : exactLedgerCoverage ? `${ledger.length} accounting rows match by transaction ID and amount.` : `${ledger.length} accounting rows were read; ${seen.size} unique mappings matched. Correct the missing or conflicting rows.`,
      required: true,
      status: ledgerStatus
    },
    {
      id: "deterministic-workflow-facts",
      label: "Current-period results check",
      detail: !hasWorkflowFacts ? "Not evaluated — no confirmed current-period program or financial figures have been supplied." : workflowFactIssue ? "At least one draft figure conflicts with the confirmed current-period information." : "Draft figures agree with the confirmed current-period information.",
      required: true,
      status: workflowFactStatus
    },
    ...financialAnalysis.controls.map((control) => ({
      id: `deterministic-financial-${control.id}`,
      label: control.title,
      detail: control.detail,
      required: control.requiresAction,
      status: control.status
    }))
  ];
  const mappingById = new Map(mappings.map((mapping) => [mapping.transactionId, mapping]));
  const findings = dedupeFindings([...result.validation.findings, ...deterministicFindings]).map((item) => {
    const transactionId = item.itemId.replace(/^mapping:/, "");
    const mapping = mappingById.get(transactionId);
    if (mapping?.reviewReason === "exact_budget_match" && item.verdict === "blocked") {
      return { ...item, verdict: "review" as const, reason: "The ledger account exactly matches a verified budget category. Review the suggested mapping before approval." };
    }
    return item;
  });
  const sourceMatchedItems = findings.filter((item) => item.verdict === "source_matched").length;
  const itemsNeedingReview = findings.filter((item) => item.verdict === "review").length;
  const blockedItems = findings.filter((item) => item.verdict === "blocked").length;
  return {
    ...result,
    mappings,
    narrative,
    qualityChecks,
    financialAnalysis,
    validation: {
      ...result.validation,
      findings,
      sourceMatchedItems,
      itemsNeedingReview,
      blockedItems,
      evidenceCoveragePercent: findings.length ? Math.round((sourceMatchedItems / findings.length) * 100) : 0,
      method: `${result.validation.method} Financial values are compared with uploaded accounting rows, and narrative figures are compared with confirmed current-period information when those inputs are available.`
    },
    warnings: [...new Set([
      ...result.warnings,
      ...(hasLedgerFile ? ["Financial totals are calculated directly from your uploaded ledger. Our AI-powered solution may suggest transaction mappings and explanations, but it never invents transaction amounts."] : [])
    ])]
  };
}

function parseWorkflowFacts(request: CompilationRequest): WorkflowFacts {
  const file = request.files.find((item) => item.name === "GrantDeskHQ_Confirmed_Workflow_Data.txt" && item.mimeType === "text/plain");
  const encoded = file?.data.split(",", 2)[1];
  if (!encoded) return {};
  try { return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as WorkflowFacts; }
  catch { return {}; }
}

function narrativeContradictions(text: string, facts: WorkflowFacts, sourceFinancialAmounts: number[]) {
  const reasons: string[] = [];
  const lower = text.toLowerCase();
  for (const metric of facts.programMetrics || []) {
    const tokens = metric.label.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4);
    if (!tokens.length || !tokens.every((token) => lower.includes(token))) continue;
    for (const match of text.matchAll(/\b\d+(?:\.\d+)?%?/g)) {
      const value = Number(match[0].replace("%", ""));
      if (value >= 1900 && value <= 2100) continue;
      const context = lower.slice(Math.max(0, (match.index || 0) - 24), (match.index || 0) + match[0].length + 24);
      const achievement = metric.target === 0 ? null : (metric.actual / metric.target) * 100;
      const isAllowed = close(value, metric.actual) || close(value, metric.target) || close(value, metric.actual - metric.target) || (achievement !== null && close(value, achievement, 0.11));
      if (!isAllowed) reasons.push(`${metric.label} includes ${match[0]}, which is not present in the confirmed current-period KPI data.`);
      else if (close(value, metric.target) && !close(metric.target, metric.actual) && !/(target|goal|planned|plan)/.test(context)) reasons.push(`${metric.label} uses the target ${metric.target} as an achieved result; the confirmed actual is ${metric.actual}.`);
    }
  }
  const allowedFinancialValues = [...(facts.budgetVsActual || []).flatMap((line) => [line.approvedAmount, line.actualEligibleExpenditure, line.remainingAmount, line.percentageSpent, line.varianceAmount, line.spendRateAgainstElapsedPlan]), ...(facts.knownFinancialAmounts || []), ...sourceFinancialAmounts].filter((value): value is number => value !== null && Number.isFinite(value));
  for (const match of text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)) {
    const value = Number(match[1].replaceAll(",", ""));
    if (allowedFinancialValues.length && !allowedFinancialValues.some((allowed) => close(Math.abs(value), Math.abs(allowed), 0.011))) reasons.push(`The financial amount ${match[0]} is not present in the deterministic budget-versus-actual results.`);
  }
  return [...new Set(reasons)];
}

function extractFinancialAmounts(text: string) {
  return [...text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((match) => Number(match[1].replaceAll(",", ""))).filter(Number.isFinite);
}

function close(left: number, right: number, tolerance = 0.005) { return Math.abs(left - right) < tolerance; }

export function parseLedger(request: CompilationRequest): FinancialLedgerRow[] {
  const file = request.files.find((item) => item.role === "ledgerExport" && (item.mimeType.includes("csv") || item.name.toLowerCase().endsWith(".csv")));
  if (!file) return [];
  const encoded = file.data.split(",", 2)[1];
  if (!encoded) return [];
  const lines = Buffer.from(encoded, "base64").toString("utf8").split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#"));
  if (lines.length < 2) return [];
  const header = csvRow(lines[0]).map((value) => value.toLowerCase());
  const column = (...names: string[]) => header.findIndex((value) => names.includes(value));
  return lines.slice(1).map(csvRow).map((row) => ({
    id: row[column("transaction id", "transaction id #", "transaction number", "id")]?.trim() || "",
    date: row[column("date", "transaction date")]?.trim() || "",
    description: row[column("vendor or memo", "description", "memo", "vendor/payee")]?.trim() || "",
    amount: parseAmount(row[column("amount", "transaction amount")] || ""),
    account: row[column("gl account", "account", "account name", "general ledger account")]?.trim() || "",
    vendor: row[column("vendor/payee", "vendor", "payee", "vendor or memo")]?.trim() || ""
  })).filter((row) => row.id && Number.isFinite(row.amount));
}

function parseAmount(value: string) {
  const normalized = value.trim().replaceAll(",", "").replace(/^\((.+)\)$/, "-$1").replace(/[$\s]/g, "");
  return normalized === "" ? Number.NaN : Number(normalized);
}

function dateExclusion(date: string, reportingPeriod: string, grantStartValue?: string, grantEndValue?: string) {
  const transactionDate = parseDate(date);
  const grantStart = parseDate(grantStartValue || "");
  const grantEnd = parseDate(grantEndValue || "");
  if (transactionDate && grantStart && transactionDate < grantStart) return { reason: "outside_grant_period" as const, detail: `Transaction ${date} predates the grant start date.` };
  if (transactionDate && grantEnd && transactionDate > grantEnd) return { reason: "outside_grant_period" as const, detail: `Transaction ${date} falls after the grant end date.` };
  const period = parsePeriod(reportingPeriod);
  if (transactionDate && period && (transactionDate < period.start || transactionDate > period.end)) return { reason: "outside_report_period" as const, detail: `Transaction ${date} is outside the selected reporting period.` };
  return null;
}

function parsePeriod(value: string) {
  const normalized = value.replace(/[–—]/g, "-");
  const matches = normalized.match(/(.+?)\s+(?:through|to|-)\s+(.+)/i);
  if (!matches) return null;
  const start = parseDate(matches[1]);
  const end = parseDate(matches[2]);
  return start && end ? { start, end } : null;
}

function parseDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function csvRow(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { values.push(value); value = ""; }
    else value += character;
  }
  values.push(value);
  return values;
}

function finding(itemId: string, verdict: "review" | "blocked", reason: string): ValidationFinding {
  return { id: `det-${itemId}-${verdict}`, itemId, verdict, reason, source: { sourceName: "Source data check", locator: itemId.replace(/^ledger:/, "Transaction "), excerpt: reason } };
}

function dedupeFindings(findings: ValidationFinding[]) {
  const map = new Map<string, ValidationFinding>();
  for (const item of findings) map.set(item.id, item);
  return [...map.values()];
}
