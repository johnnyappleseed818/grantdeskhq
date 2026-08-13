import type { CompilationRequest, CompilationResult, CompiledRequirement, CompilerFile, SourceReference, ValidationFinding } from "../src/types/prototype.ts";
import { buildFinancialAnalysis, findBudgetCategoryFromLedgerSignals, findExactBudgetCategory, isMappingIncludedInFinancialAnalysis, parseReportingPeriod, type FinancialLedgerRow } from "./financialControls.ts";
import { extractDocxParagraphs } from "./programSourceNormalization.ts";

interface WorkflowFacts {
  programMetrics?: Array<{ label: string; target: number; actual: number }>;
  budgetVsActual?: Array<{ approvedAmount: number; actualEligibleExpenditure: number; remainingAmount: number; percentageSpent: number; varianceAmount: number; spendRateAgainstElapsedPlan: number | null }>;
  knownFinancialAmounts?: number[];
}

export function applyDeterministicAccuracyChecks(request: CompilationRequest, result: CompilationResult, ledgerOverride?: FinancialLedgerRow[]): CompilationResult {
  const ledger = ledgerOverride ?? parseLedger(request);
  const financialRequirements = [...result.requirements, ...deterministicAwardFinancialRequirements(request)];
  const hasLedgerFile = request.files.some((item) => item.role === "ledgerExport");
  const deterministicFindings: ValidationFinding[] = [];
  const seen = new Set<string>();
  const ledgerIds = new Set(ledger.map((row) => row.id));
  const duplicateCount = ledger.length - ledgerIds.size;
  const assistanceApprovalThreshold = findAssistanceApprovalThreshold(request, financialRequirements);
  let hardMappingIssue = hasLedgerFile && ledger.length === 0;
  if (duplicateCount) deterministicFindings.push(finding("ledger", "review", `${duplicateCount} duplicate ledger ${duplicateCount === 1 ? "row was" : "rows were"} detected and excluded from provisional totals.`));
  const mappings = result.mappings.map((mapping) => {
    const row = ledger.find((candidate) => candidate.id === mapping.transactionId);
    if (!row) {
      hardMappingIssue = true;
      const malformedRow = /malformed/i.test(mapping.rationale);
      const detail = malformedRow
        ? `Malformed ledger row — category suggested: ${mapping.suggestedCategory || "not determined"}. Review the source row and mapping before inclusion.`
        : "This mapping could not be reconciled to a readable row in the uploaded ledger. Review the source row before inclusion.";
      deterministicFindings.push(finding(`mapping:${mapping.transactionId}`, "blocked", detail));
      return { ...mapping, confidence: 0, status: "blocked" as const, mappingConfidence: "unmapped" as const, complianceStatus: "not_applicable" as const, complianceDetail: detail, reportTreatment: "needs_category_review" as const, reviewReason: "ambiguous" as const, requiresHumanAction: true };
    }
    if (seen.has(mapping.transactionId)) {
      deterministicFindings.push(finding(`mapping:${mapping.transactionId}`, "review", "Duplicate ledger row excluded from provisional report totals. Confirm whether one or both rows should be kept."));
      const category = findExactBudgetCategory(row.account, financialRequirements) || findExactBudgetCategory(mapping.suggestedCategory, financialRequirements) || mapping.suggestedCategory;
      return { ...mapping, date: row.date, description: row.description, amount: row.amount, suggestedCategory: category, confidence: category && !/^unmapped$/i.test(category) ? 0.95 : 0, status: "review" as const, mappingConfidence: category && !/^unmapped$/i.test(category) ? "high" as const : "unmapped" as const, complianceStatus: "duplicate" as const, complianceDetail: "A matching ledger row with the same transaction ID is already included in provisional totals.", reportTreatment: "excluded_duplicate" as const, reviewReason: "duplicate" as const, requiresHumanAction: true, rationale: "Duplicate ledger row detected and excluded from provisional totals until reviewed." };
    }
    seen.add(mapping.transactionId);
    const amountMatches = Math.abs(mapping.amount - row.amount) < 0.005;
    if (!amountMatches) {
      hardMappingIssue = true;
      deterministicFindings.push(finding(mapping.transactionId, "blocked", `The suggested amount ${mapping.amount} did not match the ledger amount ${row.amount}. The uploaded ledger value replaced it.`));
    }
    const periodIssue = dateExclusion(row.date, request.reportingPeriod, result.grantProfile.grantStartDate?.value, result.grantProfile.grantEndDate?.value);
    if (periodIssue) deterministicFindings.push(finding(`mapping:${mapping.transactionId}`, "source_matched", periodIssue.detail));
    const exactCategory = findExactBudgetCategory(row.account, financialRequirements);
    const suggestedBudgetCategory = findExactBudgetCategory(mapping.suggestedCategory, financialRequirements);
    const signalCategory = findBudgetCategoryFromLedgerSignals(row, financialRequirements);
    const deterministicCategory = exactCategory || suggestedBudgetCategory || signalCategory;
    const category = deterministicCategory || "Unmapped";
    const ambiguous = !deterministicCategory;
    const highConfidenceMapping = amountMatches && Boolean(deterministicCategory) && !ambiguous;
    const inferredComplianceStatus = mappingCompliance(mapping.rationale);
    const assistanceTransaction = /^emergency client assistance$/i.test(category);
    const assistanceDisbursement = assistanceTransaction && row.amount > 0;
    const assistanceCredit = assistanceTransaction && row.amount < 0;
    const additionalApprovalRequired = assistanceDisbursement && assistanceApprovalThreshold !== null && row.amount > assistanceApprovalThreshold;
    const categoryDetail = `The ledger label “${row.account || "Unspecified"}” does not match a source-verified approved budget category. Select a category before inclusion.`;
    const assistanceDetail = assistanceCredit
      ? "Refund or credit reconciled against Emergency Client Assistance spending. It does not create a new payment or housing-purpose documentation request."
      : assistanceDisbursement
        ? `Payment and housing-purpose documentation required.${additionalApprovalRequired ? ` Written Program Director approval is also required because this disbursement exceeds ${formatMoney(assistanceApprovalThreshold)}.` : ""}`
        : "";
    const complianceStatus = ambiguous
      ? "not_applicable" as const
      : assistanceDisbursement
        ? "evidence_required" as const
        : assistanceCredit
          ? "clear" as const
          : inferredComplianceStatus;
    const complianceDetail = ambiguous
      ? categoryDetail
      : assistanceDetail || (complianceStatus === "clear" ? "No additional transaction-level exception was detected." : mapping.rationale);
    const reportTreatment = periodIssue
      ? periodIssue.reason === "outside_report_period" ? "excluded_outside_period" as const
        : periodIssue.reason === "outside_grant_period" ? "excluded_grant_period" as const
          : periodIssue.reason === "invalid_transaction_date" ? "excluded_invalid_date" as const
            : "excluded_period_unavailable" as const
      : ambiguous ? "needs_category_review" as const
        : complianceStatus === "evidence_required" ? "pending_evidence" as const
          : complianceStatus === "eligibility_review" ? "provisional" as const
            : "included" as const;
    return {
      ...mapping,
      date: row.date,
      description: row.description,
      amount: row.amount,
      suggestedCategory: category,
      confidence: highConfidenceMapping ? exactCategory ? 0.98 : 0.9 : ambiguous ? 0 : Math.max(mapping.confidence, 0.5),
      status: periodIssue ? periodIssue.reason === "invalid_transaction_date" ? "blocked" as const : "not_evaluated" as const : !amountMatches || ambiguous ? "blocked" as const : highConfidenceMapping ? "verified" as const : "review" as const,
      mappingConfidence: highConfidenceMapping ? "high" as const : ambiguous ? "unmapped" as const : "review" as const,
      complianceStatus,
      complianceDetail,
      reportTreatment,
      reviewReason: periodIssue?.reason || (ambiguous ? "ambiguous" as const : highConfidenceMapping ? "exact_budget_match" as const : undefined),
      requiresHumanAction: periodIssue?.reason === "invalid_transaction_date" || (!periodIssue && (!highConfidenceMapping || ambiguous)),
      rationale: periodIssue
        ? `${periodIssue.detail} Excluded from current-period mapped totals.`
        : ambiguous
          ? `${categoryDetail} The transaction amount was confirmed against the uploaded ledger.`
        : highConfidenceMapping
          ? `${exactCategory ? `The ledger account “${row.account}”` : signalCategory ? `The transaction description and vendor` : `The suggested category “${category}”`} match${signalCategory ? "" : "es"} a source-verified budget category. ${mapping.rationale} The transaction amount comes directly from the uploaded ledger.`
          : `${mapping.rationale} The transaction amount was confirmed against the uploaded ledger.`
    };
  });
  for (const row of ledger) {
    if (!seen.has(row.id)) {
      hardMappingIssue = true;
      deterministicFindings.push(finding(`ledger:${row.id}`, "blocked", `Ledger transaction ${row.id} was omitted from the AI mapping output.`));
    }
  }

  const sourceNames = new Set(request.files.map((file) => file.name));
  const citedItems = [
    ...Object.entries(result.grantProfile).flatMap(([key, field]) => field ? [{ id: `profile:${key}`, sources: [field.source] }] : []),
    ...result.requirements.map((item) => ({ id: `requirement:${item.id}`, sources: [item.source] })),
    ...result.narrative.map((item) => ({ id: `narrative:${item.id}`, sources: [item.source] })),
    ...(result.programChecks || []).map((item) => ({ id: `program:${item.id}`, sources: item.sources }))
  ];
  for (const item of citedItems) {
    if (!item.sources.length || item.sources.some((source) => !sourceNames.has(source.sourceName) || !source.locator.trim() || !source.excerpt.trim())) {
      deterministicFindings.push(finding(item.id, "blocked", "The citation does not contain a complete reference to an uploaded source."));
    }
  }

  const workflowFacts = parseWorkflowFacts(request);
  const hasWorkflowFacts = Boolean(workflowFacts.programMetrics?.length || workflowFacts.budgetVsActual?.length || workflowFacts.knownFinancialAmounts?.length);
  const sourceMatchedRequirementIds = new Set(result.validation.findings.filter((item) => item.verdict === "source_matched" && item.itemId.startsWith("requirement:")).map((item) => item.itemId.slice("requirement:".length)));
  const sourceMatchedRequirementAmounts = result.requirements
    .filter((item) => sourceMatchedRequirementIds.has(item.id))
    .flatMap((item) => extractFinancialAmounts(`${item.requirement} ${item.source.excerpt}`));
  const sourceMatchedNarrativeIds = new Set(result.validation.findings.filter((item) => item.verdict === "source_matched" && item.itemId.startsWith("narrative:")).map((item) => item.itemId.slice("narrative:".length)));
  const sourceMatchedNarrativeAmounts = result.narrative
    .filter((item) => sourceMatchedNarrativeIds.has(item.id))
    .flatMap((item) => extractFinancialAmounts(`${item.text} ${item.source.excerpt}`));
  const includedMappings = mappings.filter((mapping) => isMappingIncludedInFinancialAnalysis(mapping, financialRequirements));
  const categoryActuals = [...new Set(includedMappings.map((mapping) => mapping.suggestedCategory))]
    .map((category) => includedMappings.filter((mapping) => mapping.suggestedCategory === category).reduce((sum, mapping) => sum + mapping.amount, 0));
  const derivedLedgerAmounts = [
    ledger.reduce((sum, row) => sum + row.amount, 0),
    includedMappings.reduce((sum, mapping) => sum + mapping.amount, 0),
    ...categoryActuals
  ];
  const sourceFinancialAmounts = [...ledger.map((row) => row.amount), ...derivedLedgerAmounts, ...sourceMatchedRequirementAmounts, ...sourceMatchedNarrativeAmounts];
  let workflowFactIssue = false;
  const narrative = result.narrative.map((item) => {
    const reasons = narrativeContradictions(item.text, workflowFacts, sourceFinancialAmounts, extractFinancialAmounts(item.source.excerpt));
    if (!reasons.length) return item;
    workflowFactIssue = true;
    deterministicFindings.push(finding(item.id, "blocked", reasons.join(" ")));
    return { ...item, status: "blocked" as const };
  });

  const exactLedgerCoverage = hasLedgerFile && ledger.length > 0 && ledgerIds.size === seen.size && !hardMappingIssue;
  const ledgerStatus = !hasLedgerFile ? "not_evaluated" as const : hardMappingIssue ? "blocked" as const : duplicateCount ? "review" as const : exactLedgerCoverage ? "passed" as const : "blocked" as const;
  const workflowFactStatus = !hasWorkflowFacts ? "not_evaluated" as const : workflowFactIssue ? "blocked" as const : "passed" as const;
  const piiTypes = obviousProhibitedPiiTypes(narrative.map((item) => item.text).join("\n"));
  const privacyStatus = !narrative.length ? "not_evaluated" as const : piiTypes.length ? "blocked" as const : "passed" as const;
  const financialAnalysis = buildFinancialAnalysis(request, financialRequirements, result.grantProfile, ledger, mappings, { assistanceApprovalThreshold });
  const qualityChecks = [
    ...result.qualityChecks.filter((check) => !["deterministic-ledger", "deterministic-workflow-facts", "deterministic-privacy-scan"].includes(check.id)),
    {
      id: "deterministic-ledger",
      label: "Ledger reconciliation",
      detail: !hasLedgerFile ? "Not evaluated — no accounting export has been added yet." : hardMappingIssue ? `${ledger.length} accounting rows were read; ${seen.size} unique transaction IDs matched. Correct the missing or conflicting rows.` : duplicateCount ? `${ledger.length} accounting rows were read; ${duplicateCount} duplicate ${duplicateCount === 1 ? "row was" : "rows were"} excluded from provisional totals pending one review decision.` : `${ledger.length} accounting rows match by transaction ID and amount.`,
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
    {
      id: "deterministic-privacy-scan",
      label: "Prohibited PII scan",
      detail: !narrative.length
        ? "Not evaluated — no draft language is available yet."
        : piiTypes.length
          ? `Action required — the current draft may contain ${piiTypes.join(", ")}. Remove or de-identify this information before submission.`
          : "No obvious Social Security numbers, bank-account numbers, full birth dates, medical-diagnosis details, or immigration-status details were detected in the current draft. Human review is still required.",
      required: true,
      status: privacyStatus
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
  const findings = dedupeMappingFindings(dedupeFindings([...result.validation.findings, ...deterministicFindings]).map((item) => {
    const transactionId = item.itemId.replace(/^mapping:/, "");
    const mapping = mappingById.get(transactionId);
    if (!mapping) return item;
    if (mapping.reportTreatment === "excluded_duplicate") {
      return item.verdict === "source_matched" ? item : { ...item, verdict: "review" as const, reason: "One matching ledger row is already included. This duplicate is excluded until the reviewer decides whether both entries are valid." };
    }
    if (mapping.mappingConfidence === "unmapped") {
      return item.verdict === "blocked" ? item : { ...item, verdict: "blocked" as const, reason: "The uploaded row does not contain enough information to select a verified budget category." };
    }
    if (["excluded_outside_period", "excluded_grant_period", "excluded_period_unavailable"].includes(mapping.reportTreatment || "")) {
      return { ...item, verdict: "source_matched" as const, reason: mapping.complianceDetail || mapping.rationale };
    }
    if (mapping.mappingConfidence === "high" && item.verdict !== "source_matched") {
      return { ...item, verdict: "source_matched" as const, reason: `The transaction amount matches the ledger and the suggested category matches a source-verified budget category. ${mapping.complianceStatus === "clear" ? "No separate transaction-level exception was detected." : "Any evidence or eligibility question is tracked separately from the mapping."}` };
    }
    return item;
  }));
  const sourceMatchedItems = findings.filter((item) => item.verdict === "source_matched").length;
  const itemsNeedingReview = findings.filter((item) => item.verdict === "review").length;
  const blockedItems = findings.filter((item) => item.verdict === "blocked").length;
  const missingInputs = [...result.missingInputs];
  for (const mapping of mappings.filter((item) => item.reportTreatment === "needs_category_review" || item.mappingConfidence === "unmapped")) {
    const alreadyRequested = missingInputs.some((item) => new RegExp(`\\b${escapeRegExp(mapping.transactionId)}\\b`, "i").test(`${item.question} ${item.reason}`));
    if (alreadyRequested) continue;
    missingInputs.push({
      id: `deterministic-category-input-${mapping.transactionId}`,
      question: `Select an approved grant budget category for transaction ${mapping.transactionId}.`,
      assignedRole: "Finance",
      reason: `${mapping.transactionId} cannot enter grant totals until its ledger details support an approved budget category.`,
      status: "open"
    });
  }
  return {
    ...result,
    mappings,
    missingInputs,
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

function obviousProhibitedPiiTypes(text: string) {
  const checks: Array<[string, RegExp]> = [
    ["a Social Security number", /\b\d{3}-\d{2}-\d{4}\b/],
    ["a bank-account number", /\b(?:bank\s+)?account\s*(?:number|no\.?|#)\s*[:#-]?\s*\d{6,17}\b/i],
    ["a full date of birth", /\b(?:date of birth|dob)\s*[:#-]?\s*(?:\d{1,2}[/-]){2}\d{4}\b/i],
    ["medical-diagnosis details", /\b(?:participant|client|patient)(?:'s)?\s+(?:medical )?diagnosis\s*(?:is|:|-)\s*(?!not\b|unknown\b|withheld\b)[a-z][a-z -]{2,40}\b/i],
    ["immigration-status details", /\b(?:participant|client)(?:'s)?\s+(?:immigration|visa) status\s*(?:is|:|-)\s*(?!not\b|unknown\b|withheld\b)[a-z][a-z -]{2,40}\b/i]
  ];
  return checks.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function parseWorkflowFacts(request: CompilationRequest): WorkflowFacts {
  const file = request.files.find((item) => item.name === "GrantDeskHQ_Confirmed_Workflow_Data.txt" && item.mimeType === "text/plain");
  const encoded = file?.data.split(",", 2)[1];
  if (!encoded) return {};
  try { return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as WorkflowFacts; }
  catch { return {}; }
}

function narrativeContradictions(text: string, facts: WorkflowFacts, sourceFinancialAmounts: number[], citedFinancialAmounts: number[] = []) {
  const reasons: string[] = [];
  for (const metric of facts.programMetrics || []) {
    const tokens = metric.label.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4);
    if (!tokens.length) continue;
    for (const sentence of text.split(/(?<=[.!?;])\s+/)) {
      const lower = sentence.toLowerCase();
      if (!tokens.every((token) => lower.includes(token))) continue;
      for (const match of sentence.matchAll(/\b\d+(?:\.\d+)?%?/g)) {
        const value = Number(match[0].replace("%", ""));
        if (value >= 1900 && value <= 2100) continue;
        const context = lower.slice(Math.max(0, (match.index || 0) - 36), (match.index || 0) + match[0].length + 36);
        if (!tokens.every((token) => context.includes(token))) continue;
        const achievement = metric.target === 0 ? null : (metric.actual / metric.target) * 100;
        const isAllowed = close(value, metric.actual) || close(value, metric.target) || close(value, metric.actual - metric.target) || (achievement !== null && close(value, achievement, 0.11));
        if (!isAllowed) reasons.push(`${metric.label} includes ${match[0]}, which is not present in the confirmed current-period KPI data.`);
        else if (close(value, metric.target) && !close(metric.target, metric.actual) && !/(target|goal|planned|plan)/.test(context)) reasons.push(`${metric.label} uses the target ${metric.target} as an achieved result; the confirmed actual is ${metric.actual}.`);
      }
    }
  }
  const allowedFinancialValues = [...(facts.budgetVsActual || []).flatMap((line) => [line.approvedAmount, line.actualEligibleExpenditure, line.remainingAmount, line.percentageSpent, line.varianceAmount, line.spendRateAgainstElapsedPlan]), ...(facts.knownFinancialAmounts || []), ...sourceFinancialAmounts, ...citedFinancialAmounts].filter((value): value is number => value !== null && Number.isFinite(value));
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
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

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
  if (!transactionDate) return { reason: "invalid_transaction_date" as const, detail: `Transaction date “${date || "blank"}” could not be validated. The row is excluded until the date is corrected.` };
  const grantStart = parseDate(grantStartValue || "");
  const grantEnd = parseDate(grantEndValue || "");
  if (transactionDate && grantStart && transactionDate < grantStart) return { reason: "outside_grant_period" as const, detail: `Transaction ${date} predates the grant start date.` };
  if (transactionDate && grantEnd && transactionDate > grantEnd) return { reason: "outside_grant_period" as const, detail: `Transaction ${date} falls after the grant end date.` };
  const period = parseReportingPeriod(reportingPeriod);
  if (!period) return { reason: "invalid_reporting_period" as const, detail: `The selected reporting period “${reportingPeriod}” does not provide exact start and end dates. The row is excluded until the reporting period is corrected.` };
  if (transactionDate && period && (transactionDate < period.start || transactionDate > period.end)) return { reason: "outside_report_period" as const, detail: `Transaction ${date} is outside the selected reporting period.` };
  return null;
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

function mappingCompliance(rationale: string): NonNullable<CompilationResult["mappings"][number]["complianceStatus"]> {
  if (/confirm (?:that )?.*allowable|eligibility|eligible expense|allowability/i.test(rationale)) return "eligibility_review";
  if (/supporting documentation|supporting approval|written (?:program[- ]director )?approval|receipt (?:is )?(?:needed|missing|required)|documentation is needed/i.test(rationale)) return "evidence_required";
  return "clear";
}

function deterministicAwardFinancialRequirements(request: CompilationRequest): CompiledRequirement[] {
  const derived: CompiledRequirement[] = [];
  for (const file of request.files.filter((item) => item.role === "awardAgreement" || item.role === "approvedBudget")) {
    const paragraphs = sourceParagraphs(file);
    if (!paragraphs.length) continue;
    const budgetStart = paragraphs.findIndex((value) => /approved (?:grant )?budget/i.test(value));
    const budgetEnd = budgetStart < 0
      ? -1
      : paragraphs.findIndex((value, index) => index > budgetStart && /^\d+\.\s+/.test(value));
    const budget = budgetStart < 0 ? [] : paragraphs.slice(budgetStart + 1, budgetEnd < 0 ? paragraphs.length : budgetEnd);
    for (let index = 0; index < budget.length - 1; index += 1) {
      const category = budget[index].trim();
      const amount = budget[index + 1].match(/^\$\s*([\d,]+(?:\.\d+)?)\s*(?:USD)?$/i)?.[1];
      if (!amount || /^(?:category|approved amount|% of award|notes|total)$/i.test(category) || /^\d/.test(category)) continue;
      const excerpt = `${category} — $${amount}`;
      derived.push(derivedRequirement(file, `budget-${category}`, excerpt, "Approved Grant Budget", excerpt));
    }
    const rulePatterns = [
      /indirect costs?.*(?:lesser of|% of).*direct costs?/i,
      /category variance.*\$.*(?:explain|explanation)|(?:explain|explanation).*category variance.*\$/i,
      /prior written approval.*(?:15\s*%|new budget category|indirect costs?)/i,
      /emergency client assistance.*(?:payment record|housing-related purpose|program[- ]director approval)/i,
      /assistance above\s*\$.*program[- ]director approval/i
    ];
    for (const paragraph of paragraphs) {
      if (!rulePatterns.some((pattern) => pattern.test(paragraph))) continue;
      derived.push(derivedRequirement(file, `rule-${derived.length + 1}`, paragraph, "Award financial rule", paragraph));
    }
  }
  return [...new Map(derived.map((item) => [item.requirement.toLowerCase().replace(/\s+/g, " "), item])).values()];
}

function sourceParagraphs(file: CompilerFile) {
  if (/\.docx$/i.test(file.name) || /wordprocessingml/i.test(file.mimeType)) return extractDocxParagraphs(file);
  if (!/text|csv|json/i.test(file.mimeType) && !/\.(?:txt|csv)$/i.test(file.name)) return [];
  const encoded = file.data.split(",", 2)[1];
  if (!encoded) return [];
  try {
    return Buffer.from(encoded, "base64").toString("utf8").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function derivedRequirement(file: CompilerFile, suffix: string, requirement: string, locator: string, excerpt: string): CompiledRequirement {
  const id = `SOURCE-FIN-${suffix.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)}`;
  const source: SourceReference = { sourceName: file.name, locator, excerpt: excerpt.slice(0, 700) };
  return { id, requirement, source, confidence: 1, status: "verified" };
}

function findAssistanceApprovalThreshold(request: CompilationRequest, requirements: CompilationResult["requirements"]) {
  for (const requirement of requirements.filter((item) => item.status === "verified")) {
    const text = `${requirement.requirement} ${requirement.source.excerpt}`;
    if (!/assistance/i.test(text) || !/approval/i.test(text)) continue;
    const match = text.match(/(?:above|over|exceed(?:s|ed|ing)?|greater than|more than)\s*\$\s*([\d,]+(?:\.\d+)?)/i);
    if (match) return Number(match[1].replaceAll(",", ""));
  }
  const award = request.files.find((file) => file.role === "awardAgreement" && /\.docx$/i.test(file.name));
  if (award) {
    for (const paragraph of extractDocxParagraphs(award)) {
      if (!/assistance/i.test(paragraph) || !/written\s+program[- ]director\s+approval/i.test(paragraph)) continue;
      const match = paragraph.match(/(?:above|over|exceed(?:s|ed|ing)?|greater than|more than)\s*\$\s*([\d,]+(?:\.\d+)?)/i);
      if (match) return Number(match[1].replaceAll(",", ""));
    }
  }
  return null;
}

function formatMoney(value: number | null) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

function finding(itemId: string, verdict: ValidationFinding["verdict"], reason: string): ValidationFinding {
  return { id: `det-${itemId}-${verdict}`, itemId, verdict, reason, source: { sourceName: "Source data check", locator: itemId.replace(/^ledger:/, "Transaction "), excerpt: reason } };
}

function dedupeFindings(findings: ValidationFinding[]) {
  const map = new Map<string, ValidationFinding>();
  for (const item of findings) map.set(item.id, item);
  return [...map.values()];
}

function dedupeMappingFindings(findings: ValidationFinding[]) {
  const map = new Map<string, ValidationFinding>();
  for (const item of findings) {
    const key = item.itemId.startsWith("mapping:") ? `${item.itemId}:${item.verdict}` : item.id;
    map.set(key, item);
  }
  return [...map.values()];
}
