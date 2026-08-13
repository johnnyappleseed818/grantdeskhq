import type {
  BudgetVarianceResult,
  CompilationRequest,
  CompiledMapping,
  CompiledRequirement,
  FinancialAnalysis,
  FinancialControlResult,
  GrantProfile
} from "../src/types/prototype.ts";

export interface FinancialLedgerRow {
  id: string;
  date: string;
  description: string;
  amount: number;
  account: string;
  vendor: string;
}

interface BudgetCategory {
  category: string;
  approvedAmount: number;
}

export function buildFinancialAnalysis(
  request: Pick<CompilationRequest, "reportingPeriod" | "files">,
  requirements: CompiledRequirement[],
  grantProfile: GrantProfile,
  ledger: FinancialLedgerRow[],
  mappings: CompiledMapping[],
  overrides: { assistanceApprovalThreshold?: number | null } = {}
): FinancialAnalysis {
  if (!ledger.length) return { ledgerTransactionCount: 0, mappedTransactionCount: 0, excludedTransactionCount: 0, mappedActualTotal: 0, budgetVariances: [], controls: [] };

  const reportPeriod = parseReportingPeriod(request.reportingPeriod);
  if (!reportPeriod) {
    return {
      ledgerTransactionCount: ledger.length,
      mappedTransactionCount: 0,
      excludedTransactionCount: ledger.length,
      mappedActualTotal: 0,
      budgetVariances: [],
      controls: [{
        id: "reporting-period-boundary",
        title: "Confirm the reporting-period dates",
        detail: `GrantDeskHQ could not determine exact start and end dates from “${request.reportingPeriod}.” No ledger rows were included in current-period totals. Enter a date range before continuing.`,
        status: "blocked",
        requiresAction: true,
        transactionIds: []
      }]
    };
  }
  const grantStart = safeDate(grantProfile.grantStartDate?.value);
  const grantEnd = safeDate(grantProfile.grantEndDate?.value);
  const seenIds = new Set<string>();
  const usable: Array<FinancialLedgerRow & { category: string }> = [];
  const duplicateRows: FinancialLedgerRow[] = [];
  let excludedTransactionCount = 0;

  for (const row of ledger) {
    if (seenIds.has(row.id)) { duplicateRows.push(row); excludedTransactionCount += 1; continue; }
    seenIds.add(row.id);
    const rowDate = safeDate(row.date);
    if (!rowDate || (grantStart && rowDate < grantStart) || (grantEnd && rowDate > grantEnd) || (reportPeriod && (rowDate < reportPeriod.start || rowDate > reportPeriod.end))) {
      excludedTransactionCount += 1;
      continue;
    }
    const mapping = mappings.find((item) => item.transactionId === row.id && item.reportTreatment !== "excluded_duplicate");
    const exactCategory = findExactBudgetCategory(row.account, requirements);
    const category = exactCategory || (mapping ? mappedBudgetCategory(mapping, requirements) : "");
    if (!category) { excludedTransactionCount += 1; continue; }
    usable.push({ ...row, category });
  }

  const categoryNames = [...new Set(usable.map((row) => row.category))];
  const budgets = categoryNames.map((category) => ({ category, approvedAmount: findApprovedAmount(category, requirements) })).filter((item): item is BudgetCategory => Number.isFinite(item.approvedAmount));
  const varianceThreshold = findMoneyThreshold(requirements, /variance/i);
  const budgetVariances: BudgetVarianceResult[] = budgets.map((budget) => {
    const rows = usable.filter((row) => sameCategory(row.category, budget.category));
    const actualAmount = roundMoney(rows.reduce((total, row) => total + row.amount, 0));
    const varianceAmount = roundMoney(actualAmount - budget.approvedAmount);
    const variancePercent = budget.approvedAmount === 0 ? 0 : roundPercent((varianceAmount / budget.approvedAmount) * 100);
    // Without a period-specific spending plan, partial-period underspend is not a
    // reliable exception. A category that exceeds the approved amount can still
    // trigger the agreement's absolute-dollar explanation rule.
    const explanationRequired = varianceThreshold !== null && varianceAmount >= varianceThreshold;
    return {
      category: budget.category,
      approvedAmount: budget.approvedAmount,
      actualAmount,
      varianceAmount,
      variancePercent,
      explanationThreshold: varianceThreshold,
      explanationRequired,
      status: explanationRequired ? "explanation_required" : "within_budget",
      transactionIds: rows.map((row) => row.id)
    };
  });

  const controls: FinancialControlResult[] = [];
  if (duplicateRows.length) {
    const duplicateIds = [...new Set(duplicateRows.map((row) => row.id))];
    controls.push({
      id: "duplicate-transactions",
      title: `${duplicateIds.length} potential ${duplicateIds.length === 1 ? "duplicate needs" : "duplicates need"} review`,
      detail: `${duplicateIds.join(", ")} ${duplicateIds.length === 1 ? "is" : "are"} excluded from provisional totals because the same transaction ID appears more than once in the ledger.`,
      status: "review",
      requiresAction: true,
      transactionIds: duplicateIds
    });
  }
  const materialVariances = budgetVariances.filter((item) => item.explanationRequired);
  if (varianceThreshold !== null) {
    controls.push(materialVariances.length ? {
      id: "material-variance",
      title: `${materialVariances.length} budget ${materialVariances.length === 1 ? "variance requires" : "variances require"} explanation`,
      detail: materialVariances.map((item) => `${item.category}: ${money(item.actualAmount)} actual vs ${money(item.approvedAmount)} approved; ${money(item.varianceAmount)} above budget (${signedPercent(item.variancePercent)}). This exceeds the award's ${money(varianceThreshold)} reporting threshold.`).join(" "),
      status: "review",
      requiresAction: true,
      transactionIds: materialVariances.flatMap((item) => item.transactionIds)
    } : {
      id: "material-variance",
      title: "No material budget variance detected",
      detail: `No mapped category reached the ${money(varianceThreshold)} explanation threshold.`,
      status: "passed",
      requiresAction: false,
      transactionIds: []
    });
  }

  const reallocationThreshold = findReallocationThreshold(requirements);
  if (reallocationThreshold !== null) {
    const possibleReallocations = budgetVariances.filter((item) => item.variancePercent >= reallocationThreshold);
    if (possibleReallocations.length) {
      controls.push({
        id: "budget-reallocation-approval",
        title: "Confirm whether the budget was formally modified",
        detail: `${possibleReallocations.map((item) => `${item.category} is ${signedPercent(item.variancePercent)} above its approved amount`).join(" · ")}. This overage is a variance, not evidence that a formal budget modification occurred. The award requires prior written approval only if funds were reallocated or the approved budget was changed by ${reallocationThreshold}% or more.`,
        status: "review",
        requiresAction: true,
        transactionIds: possibleReallocations.flatMap((item) => item.transactionIds)
      });
    }
  }

  const eligibilityRows = mappings
    .filter((mapping) => mapping.reportTreatment === "provisional" && mapping.complianceStatus === "eligibility_review")
    .filter((mapping) => usable.some((row) => row.id === mapping.transactionId));
  if (eligibilityRows.length) {
    controls.push({
      id: "eligibility-review",
      title: `${eligibilityRows.length} ${eligibilityRows.length === 1 ? "transaction needs" : "transactions need"} an eligibility review`,
      detail: `The budget category is clear, but the award language does not establish whether ${eligibilityRows.length === 1 ? "this purchase is" : "these purchases are"} allowable. Confirm eligibility before final inclusion.`,
      status: "review",
      requiresAction: true,
      transactionIds: eligibilityRows.map((mapping) => mapping.transactionId)
    });
  }

  const assistanceRule = matchingRequirement(requirements, /assistance/i, /approval|written/i);
  const assistanceThreshold = overrides.assistanceApprovalThreshold ?? (assistanceRule ? thresholdAfterComparator(assistanceRule) : null);
  const assistanceDocumentationRule = matchingRequirement(requirements, /assistance/i, /payment record|housing.{0,30}purpose|supporting documentation|documentation/i);
  const assistanceRows = usable.filter((row) => /\b(?:emergency|client|participant|housing)(?:\s+\w+){0,2}\s+assistance\b/i.test(`${row.account} ${row.category}`));
  const assistanceDisbursements = assistanceRows.filter((row) => row.amount > 0);
  const assistanceCredits = assistanceRows.filter((row) => row.amount < 0);
  if (assistanceDocumentationRule && assistanceDisbursements.length) {
    controls.push({
      id: "assistance-documentation",
      title: "Emergency assistance documentation",
      detail: `Payment and housing-purpose documentation must be confirmed for ${assistanceDisbursements.length} report-period assistance disbursements.${assistanceCredits.length ? ` ${assistanceCredits.length} refund or credit ${assistanceCredits.length === 1 ? "is" : "are"} reconciled separately and does not create a new participant-evidence request.` : ""}`,
      status: "review",
      requiresAction: true,
      transactionIds: assistanceDisbursements.map((row) => row.id)
    });
  }
  if (assistanceCredits.length) {
    controls.push({
      id: "assistance-credits",
      title: `${assistanceCredits.length} assistance ${assistanceCredits.length === 1 ? "refund or credit reconciled" : "refunds or credits reconciled"}`,
      detail: `${assistanceCredits.map((row) => `${row.id} (${preciseMoney(row.amount)})`).join(", ")} ${assistanceCredits.length === 1 ? "reduces" : "reduce"} assistance spending and ${assistanceCredits.length === 1 ? "does" : "do"} not represent a new participant disbursement.`,
      status: "passed",
      requiresAction: false,
      transactionIds: assistanceCredits.map((row) => row.id)
    });
  }
  if (assistanceThreshold !== null) {
    const aboveThreshold = assistanceDisbursements.filter((row) => row.amount > assistanceThreshold);
    controls.push(aboveThreshold.length ? {
      id: "assistance-approvals",
      title: `${aboveThreshold.length} assistance ${aboveThreshold.length === 1 ? "transaction requires" : "transactions require"} approval support`,
      detail: `The award requires written approval for assistance above ${money(assistanceThreshold)}. Confirm supporting approval for ${aboveThreshold.map((row) => `${row.id} (${money(row.amount)})`).join(", ")}.`,
      status: "review",
      requiresAction: true,
      transactionIds: aboveThreshold.map((row) => row.id)
    } : {
      id: "assistance-approvals",
      title: "Assistance approval threshold not triggered",
      detail: `No mapped assistance transaction exceeds ${money(assistanceThreshold)}.`,
      status: "passed",
      requiresAction: false,
      transactionIds: []
    });
  }

  const indirectLimit = findIndirectLimit(requirements);
  if (indirectLimit) {
    const { percent: indirectPercent, fixedCap: indirectCap } = indirectLimit;
    const indirectRows = usable.filter((row) => /indirect/i.test(`${row.account} ${row.category}`));
    const indirectActual = roundMoney(indirectRows.reduce((total, row) => total + row.amount, 0));
    const directActual = roundMoney(usable.filter((row) => !/indirect/i.test(`${row.account} ${row.category}`)).reduce((total, row) => total + row.amount, 0));
    const percentageLimit = roundMoney(directActual * indirectPercent / 100);
    const allowed = indirectCap === null ? percentageLimit : Math.min(indirectCap, percentageLimit);
    const withinLimit = indirectActual <= allowed + 0.005;
    const remainingCapacity = roundMoney(allowed - indirectActual);
    controls.push({
      id: "indirect-cost-limit",
      title: withinLimit ? "Indirect costs are within the current allowable limit" : "Indirect costs exceed the current allowable limit",
      detail: `${preciseMoney(indirectActual)} charged · ${preciseMoney(directActual)} eligible direct costs · current limit ${preciseMoney(allowed)} (${indirectPercent}%${indirectCap === null ? "" : `, capped at ${preciseMoney(indirectCap)}`}) · ${withinLimit ? `${preciseMoney(remainingCapacity)} remaining capacity` : `${preciseMoney(Math.abs(remainingCapacity))} above the current limit`}.`,
      status: withinLimit ? "passed" : "blocked",
      requiresAction: !withinLimit,
      transactionIds: indirectRows.map((row) => row.id)
    });
  }

  return {
    ledgerTransactionCount: ledger.length,
    mappedTransactionCount: usable.length,
    excludedTransactionCount,
    mappedActualTotal: roundMoney(usable.reduce((total, row) => total + row.amount, 0)),
    budgetVariances,
    controls
  };
}

const excludedFinancialTreatments = new Set([
  "excluded_duplicate",
  "excluded_outside_period",
  "excluded_grant_period",
  "excluded_period_unavailable",
  "excluded_invalid_date",
  "needs_category_review"
]);

/** One authoritative predicate for whether a compiled mapping represents a
 * source-verified approved category that can enter mapped financial totals.
 * Date and duplicate controls assign excluded treatments before this check. */
export function isMappingIncludedInFinancialAnalysis(mapping: CompiledMapping, requirements: CompiledRequirement[]) {
  return !excludedFinancialTreatments.has(mapping.reportTreatment || "")
    && Boolean(mappedBudgetCategory(mapping, requirements));
}

function mappedBudgetCategory(mapping: CompiledMapping, requirements: CompiledRequirement[]) {
  if (/^unmapped$/i.test(mapping.suggestedCategory)) return "";
  return findExactBudgetCategory(mapping.suggestedCategory, requirements);
}

export function findExactBudgetCategory(account: string, requirements: CompiledRequirement[]) {
  const cleanAccount = account.trim();
  if (!cleanAccount || /^(misc|miscellaneous|other|unallocated|uncategorized|community outreach)$/i.test(cleanAccount)) return "";
  const accountTokens = meaningfulTokens(cleanAccount);
  if (accountTokens.length < 1) return "";
  const match = verifiedRequirements(requirements).find((requirement) => {
    const text = `${requirement.requirement} ${requirement.source.excerpt}`;
    const normalized = normalize(text);
    if (!accountTokens.every((token) => normalized.includes(token))) return false;
    // A ledger label is an approved grant category only when that exact label is
    // tied to a budget amount. Merely appearing elsewhere in a requirement with
    // a dollar value (for example "Program Director" near a $1,500 approval
    // threshold) cannot create a new budget category.
    return amountAdjacentToCategory(text, cleanAccount) !== null;
  });
  return match ? cleanAccount : "";
}

export function findBudgetCategoryFromLedgerSignals(row: Pick<FinancialLedgerRow, "description" | "vendor">, requirements: CompiledRequirement[]) {
  const signals = normalize(`${row.description} ${row.vendor}`);
  const candidates: Array<[string, RegExp]> = [
    ["Personnel", /\bpayroll\b|\bsalar(?:y|ies)\b|\bwages?\b|\bpay period\b/],
    ["Fringe Benefits", /\bfringe\b|\bemployee benefits?\b/],
    ["Emergency Client Assistance", /\b(?:emergency|client|participant|housing|rent|utility|security deposit|move in|stabilization)(?:\s+\w+){0,3}\s+assistance\b|\barrears?\b/],
    ["Legal & Benefits Navigation", /\blegal (?:clinic|services?)\b|\bbenefits? navigation\b/],
    ["Technology & Data Systems", /\btechnology\b|\bsoftware\b|\bdata (?:system|migration)\b|\bcase management\b|\blaptops?\b/],
    ["Local Travel", /\bmileage\b|\blocal travel\b|\boutreach transit\b|\btransit passes?\b/],
    ["Evaluation", /\bevaluation\b|\bbaseline (?:design|review|assessment)\b|\bdata quality\b|\bimpact metrics?\b|\boutcome measurement\b/],
    ["Indirect Costs", /\bindirect (?:cost|allocation|charge)s?\b/]
  ];
  for (const [name, pattern] of candidates) {
    const category = findExactBudgetCategory(name, requirements)
      || (Number.isFinite(findApprovedAmount(name, requirements)) ? name : "");
    if (category && pattern.test(signals)) return category;
  }
  return "";
}

function findApprovedAmount(category: string, requirements: CompiledRequirement[]) {
  const tokens = meaningfulTokens(category);
  for (const requirement of verifiedRequirements(requirements)) {
    const text = `${requirement.requirement} ${requirement.source.excerpt}`;
    const normalized = normalize(text);
    if (!tokens.every((token) => normalized.includes(token))) continue;
    const adjacentAmount = amountAdjacentToCategory(text, category);
    if (adjacentAmount !== null) return adjacentAmount;
  }
  return Number.NaN;
}

function findMoneyThreshold(requirements: CompiledRequirement[], pattern: RegExp) {
  for (const requirement of verifiedRequirements(requirements)) {
    const text = `${requirement.requirement} ${requirement.source.excerpt}`;
    if (!pattern.test(text) || !/explain|explanation|required|threshold/i.test(text)) continue;
    const threshold = text.match(/(?:variance|difference)[^.]{0,100}?(?:of|reaches?|equals?|exceeds?|above|over|at least)?\s*\$\s*([\d,]+(?:\.\d+)?)/i)?.[1]
      || text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:or more|or greater|and above)?[^.]{0,100}?(?:variance|difference)/i)?.[1];
    if (threshold) return Number(threshold.replaceAll(",", ""));
  }
  return null;
}

function findReallocationThreshold(requirements: CompiledRequirement[]) {
  for (const requirement of verifiedRequirements(requirements)) {
    const text = `${requirement.requirement} ${requirement.source.excerpt}`;
    if (!/(?:reallocat|budget (?:change|modification)|change[^.]{0,50}(?:category|approved budget))/i.test(text) || !/(?:prior|written)\s+(?:fund\s+)?approval/i.test(text)) continue;
    const threshold = text.match(/(?:reallocat\w*|budget (?:change|modification)|change (?:of|to))[^.]{0,100}?(\d+(?:\.\d+)?)\s*%/i)?.[1]
      || text.match(/(\d+(?:\.\d+)?)\s*%[^.]{0,100}?(?:reallocat\w*|budget (?:change|modification)|change (?:to|of) (?:a |any )?(?:single )?(?:approved )?category)/i)?.[1];
    if (threshold) return Number(threshold);
  }
  return null;
}

function matchingRequirement(requirements: CompiledRequirement[], ...patterns: RegExp[]) {
  const item = verifiedRequirements(requirements).find((requirement) => {
    const text = `${requirement.requirement} ${requirement.source.excerpt}`;
    return patterns.every((pattern) => pattern.test(text));
  });
  return item ? `${item.requirement} ${item.source.excerpt}` : "";
}

function verifiedRequirements(requirements: CompiledRequirement[]) {
  return requirements.filter((item) => item.status === "verified");
}

function amountAdjacentToCategory(value: string, category: string) {
  const categoryPattern = category.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
  const after = value.match(new RegExp(`${categoryPattern}\\s*(?:[:—–-]|is|of)?\\s*\\$\\s*([\\d,]+(?:\\.\\d+)?)`, "i"));
  if (after) return Number(after[1].replaceAll(",", ""));
  const before = value.match(new RegExp(`\\$\\s*([\\d,]+(?:\\.\\d+)?)\\s*(?:[:—–-]|for)?\\s*${categoryPattern}`, "i"));
  return before ? Number(before[1].replaceAll(",", "")) : null;
}
function thresholdAfterComparator(value: string) {
  const match = value.match(/(?:above|over|exceed(?:s|ed|ing)?|greater than|more than)\s*\$\s*([\d,]+(?:\.\d+)?)/i);
  return match ? Number(match[1].replaceAll(",", "")) : null;
}
function findIndirectLimit(requirements: CompiledRequirement[]) {
  for (const requirement of verifiedRequirements(requirements)) {
    const text = `${requirement.requirement} ${requirement.source.excerpt}`;
    if (!/indirect/i.test(text)) continue;
    // The rate must be grammatically tied to the direct-cost base. A nearby
    // percentage can describe an entirely different rule (for example a 15%
    // budget-reallocation threshold) and must never become the indirect rate.
    const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s+of\s+(?:the\s+)?(?:total\s+)?(?:actual\s+)?(?:eligible\s+)?direct costs?(?:\s+actually charged(?:\s+to\s+the\s+grant)?)?/i);
    if (!percentMatch) continue;
    const percent = Number(percentMatch[1]);
    if (!Number.isFinite(percent)) continue;
    const beforeRate = text.slice(Math.max(0, (percentMatch.index || 0) - 180), percentMatch.index || 0);
    const lesserClause = beforeRate.match(/lesser\s+of\s+\$\s*([\d,]+(?:\.\d+)?)\s*(?:,?\s*or)?\s*$/i);
    const fixedCap = lesserClause ? Number(lesserClause[1].replaceAll(",", "")) : null;
    return { percent, fixedCap: fixedCap !== null && Number.isFinite(fixedCap) ? fixedCap : null };
  }
  return null;
}
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function meaningfulTokens(value: string) { return normalize(value).split(" ").filter((token) => token.length >= 3 && !["and", "the", "for", "systems", "costs"].includes(token)); }
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function sameCategory(left: string, right: string) { return normalize(left) === normalize(right); }
function safeDate(value: string | undefined) { const timestamp = Date.parse(value || ""); return Number.isFinite(timestamp) ? new Date(timestamp) : null; }
export function parseReportingPeriod(value: string) {
  const normalized = value.trim().replace(/[–—]/g, " - ").replace(/\s+/g, " ");
  const iso = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+(?:through|to|-)\s+(\d{4}-\d{2}-\d{2})$/i);
  if (iso) return orderedPeriod(safeDate(iso[1]), safeDate(iso[2]));
  const separator = /\s+(?:through|to|-)\s+/i.exec(normalized)
    || /(?<=[A-Za-z])-(?=[A-Za-z])/i.exec(normalized);
  if (!separator || separator.index === undefined) return null;
  const startText = normalized.slice(0, separator.index).trim();
  const endText = normalized.slice(separator.index + separator[0].length).trim();
  const endYear = Number(endText.match(/\b(\d{4})\b/)?.[1]);
  if (!Number.isInteger(endYear)) return null;
  const monthOnlyStart = monthNumber(startText);
  const monthOnlyEnd = monthNumber(endText.replace(/,?\s*\d{4}\s*$/, ""));
  if (monthOnlyStart !== null && monthOnlyEnd !== null) {
    return orderedPeriod(
      new Date(Date.UTC(endYear, monthOnlyStart, 1)),
      new Date(Date.UTC(endYear, monthOnlyEnd + 1, 0))
    );
  }
  const end = safeDate(endText);
  const startWithYear = !/\b\d{4}\b/.test(startText) ? `${startText}, ${endYear}` : startText;
  return orderedPeriod(safeDate(startWithYear), end);
}
function orderedPeriod(start: Date | null, end: Date | null) { return start && end && start <= end ? { start, end } : null; }
function monthNumber(value: string) {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const normalized = value.trim().toLowerCase();
  const index = months.findIndex((month) => month === normalized || month.slice(0, 3) === normalized);
  return index >= 0 ? index : null;
}
function roundMoney(value: number) { return Math.round(value * 100) / 100; }
function roundPercent(value: number) { return Math.round(value * 10) / 10; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function preciseMoney(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
function signedPercent(value: number) { return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(1)}%`; }
