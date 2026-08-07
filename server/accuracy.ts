import type { CompilationRequest, CompilationResult, ValidationFinding } from "../src/types/prototype.ts";

interface LedgerRow { id: string; date: string; description: string; amount: number }
interface WorkflowFacts {
  programMetrics?: Array<{ label: string; target: number; actual: number }>;
  budgetVsActual?: Array<{ approvedAmount: number; actualEligibleExpenditure: number; remainingAmount: number; percentageSpent: number; varianceAmount: number; spendRateAgainstElapsedPlan: number | null }>;
}

export function applyDeterministicAccuracyChecks(request: CompilationRequest, result: CompilationResult): CompilationResult {
  const ledger = parseLedger(request);
  const deterministicFindings: ValidationFinding[] = [];
  const seen = new Set<string>();
  const ledgerIds = new Set(ledger.map((row) => row.id));
  let mappingIssue = ledger.length === 0 || ledgerIds.size !== ledger.length;
  if (ledgerIds.size !== ledger.length) deterministicFindings.push(finding("ledger", "blocked", "The uploaded ledger contains duplicate transaction IDs."));
  const mappings = result.mappings.map((mapping) => {
    const row = ledger.find((candidate) => candidate.id === mapping.transactionId);
    if (!row || seen.has(mapping.transactionId)) {
      mappingIssue = true;
      deterministicFindings.push(finding(mapping.transactionId, "blocked", row ? "Duplicate transaction mapping detected." : "Transaction ID does not exist in the uploaded ledger."));
      return { ...mapping, confidence: 0, status: "blocked" as const };
    }
    seen.add(mapping.transactionId);
    const amountMatches = Math.abs(mapping.amount - row.amount) < 0.005;
    if (!amountMatches) {
      mappingIssue = true;
      deterministicFindings.push(finding(mapping.transactionId, "blocked", `AI amount ${mapping.amount} did not match ledger amount ${row.amount}. The ledger value replaced it.`));
    }
    return {
      ...mapping,
      date: row.date,
      description: row.description,
      amount: row.amount,
      status: amountMatches ? mapping.status : "blocked" as const,
      rationale: `${mapping.rationale} Ledger ID, date, description and amount were checked deterministically.`
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
  let workflowFactIssue = false;
  const narrative = result.narrative.map((item) => {
    const reasons = narrativeContradictions(item.text, workflowFacts);
    if (!reasons.length) return item;
    workflowFactIssue = true;
    deterministicFindings.push(finding(item.id, "blocked", reasons.join(" ")));
    return { ...item, status: "blocked" as const };
  });

  const exactLedgerCoverage = ledger.length > 0 && ledger.length === seen.size && !mappingIssue;
  const qualityChecks = [
    ...result.qualityChecks.filter((check) => !["deterministic-ledger", "deterministic-workflow-facts"].includes(check.id)),
    {
      id: "deterministic-ledger",
      label: "Every AI transaction matches the uploaded ledger",
      detail: exactLedgerCoverage ? `${ledger.length} ledger rows matched by ID and amount.` : `${ledger.length} ledger rows were parsed; ${seen.size} unique mappings matched. Review blocked or missing rows.`,
      required: true,
      status: exactLedgerCoverage ? "passed" as const : "blocked" as const
    },
    {
      id: "deterministic-workflow-facts",
      label: "Narrative figures agree with confirmed workflow data",
      detail: workflowFactIssue ? "At least one narrative figure contradicts or is not present in the confirmed current-period data." : "Narrative figures were checked against confirmed current-period KPI and financial values.",
      required: true,
      status: workflowFactIssue ? "blocked" as const : "passed" as const
    }
  ];
  const findings = dedupeFindings([...result.validation.findings, ...deterministicFindings]);
  const sourceMatchedItems = findings.filter((item) => item.verdict === "source_matched").length;
  const itemsNeedingReview = findings.filter((item) => item.verdict === "review").length;
  const blockedItems = findings.filter((item) => item.verdict === "blocked").length;
  return {
    ...result,
    mappings,
    narrative,
    qualityChecks,
    validation: {
      ...result.validation,
      findings,
      sourceMatchedItems,
      itemsNeedingReview,
      blockedItems,
      evidenceCoveragePercent: findings.length ? Math.round((sourceMatchedItems / findings.length) * 100) : 0,
      method: `${result.validation.method} Deterministic code separately checks ledger IDs, dates, descriptions, amounts, duplicates, mapping coverage, citation completeness, and current-period narrative figures.`
    },
    warnings: [...new Set([...result.warnings, "Ledger amounts shown in the draft come from deterministic source matching, not model-generated arithmetic."])]
  };
}

function parseWorkflowFacts(request: CompilationRequest): WorkflowFacts {
  const file = request.files.find((item) => item.name === "GrantDeskHQ_Confirmed_Workflow_Data.txt" && item.mimeType === "text/plain");
  const encoded = file?.data.split(",", 2)[1];
  if (!encoded) return {};
  try { return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as WorkflowFacts; }
  catch { return {}; }
}

function narrativeContradictions(text: string, facts: WorkflowFacts) {
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
  const allowedFinancialValues = (facts.budgetVsActual || []).flatMap((line) => [line.approvedAmount, line.actualEligibleExpenditure, line.remainingAmount, line.percentageSpent, line.varianceAmount, line.spendRateAgainstElapsedPlan]).filter((value): value is number => value !== null && Number.isFinite(value));
  for (const match of text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)) {
    const value = Number(match[1].replaceAll(",", ""));
    if (allowedFinancialValues.length && !allowedFinancialValues.some((allowed) => close(Math.abs(value), Math.abs(allowed), 0.011))) reasons.push(`The financial amount ${match[0]} is not present in the deterministic budget-versus-actual results.`);
  }
  return [...new Set(reasons)];
}

function close(left: number, right: number, tolerance = 0.005) { return Math.abs(left - right) < tolerance; }

export function parseLedger(request: CompilationRequest): LedgerRow[] {
  const file = request.files.find((item) => item.role === "ledgerExport" && (item.mimeType.includes("csv") || item.name.toLowerCase().endsWith(".csv")));
  if (!file) return [];
  const encoded = file.data.split(",", 2)[1];
  if (!encoded) return [];
  const lines = Buffer.from(encoded, "base64").toString("utf8").split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#"));
  if (lines.length < 2) return [];
  const header = csvRow(lines[0]).map((value) => value.toLowerCase());
  const column = (name: string) => header.indexOf(name);
  return lines.slice(1).map(csvRow).map((row) => ({
    id: row[column("transaction id")]?.trim() || "",
    date: row[column("date")]?.trim() || "",
    description: row[column("vendor or memo")]?.trim() || "",
    amount: Number(row[column("amount")] || NaN)
  })).filter((row) => row.id && Number.isFinite(row.amount));
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
  return { id: `det-${itemId}-${verdict}`, itemId, verdict, reason, source: { sourceName: "Deterministic source check", locator: itemId, excerpt: reason } };
}

function dedupeFindings(findings: ValidationFinding[]) {
  const map = new Map<string, ValidationFinding>();
  for (const item of findings) map.set(item.id, item);
  return [...map.values()];
}
