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
  mappings: CompiledMapping[]
): FinancialAnalysis {
  if (!ledger.length) return { ledgerTransactionCount: 0, mappedTransactionCount: 0, excludedTransactionCount: 0, mappedActualTotal: 0, budgetVariances: [], controls: [] };

  const reportPeriod = parsePeriod(request.reportingPeriod);
  const grantStart = safeDate(grantProfile.grantStartDate?.value);
  const grantEnd = safeDate(grantProfile.grantEndDate?.value);
  const seenIds = new Set<string>();
  const usable: Array<FinancialLedgerRow & { category: string }> = [];
  let excludedTransactionCount = 0;

  for (const row of ledger) {
    if (seenIds.has(row.id)) { excludedTransactionCount += 1; continue; }
    seenIds.add(row.id);
    const rowDate = safeDate(row.date);
    if (!rowDate || (grantStart && rowDate < grantStart) || (grantEnd && rowDate > grantEnd) || (reportPeriod && (rowDate < reportPeriod.start || rowDate > reportPeriod.end))) {
      excludedTransactionCount += 1;
      continue;
    }
    const mapping = mappings.find((item) => item.transactionId === row.id);
    const exactCategory = findExactBudgetCategory(row.account, requirements);
    const category = exactCategory || (mapping && mapping.status !== "blocked" && !/^unmapped$/i.test(mapping.suggestedCategory) ? mapping.suggestedCategory : "");
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
    const explanationRequired = varianceThreshold !== null && Math.abs(varianceAmount) >= varianceThreshold;
    return {
      category: budget.category,
      approvedAmount: budget.approvedAmount,
      actualAmount,
      varianceAmount,
      explanationThreshold: varianceThreshold,
      explanationRequired,
      status: explanationRequired ? "explanation_required" : "within_budget",
      transactionIds: rows.map((row) => row.id)
    };
  });

  const controls: FinancialControlResult[] = [];
  const materialVariances = budgetVariances.filter((item) => item.explanationRequired);
  if (varianceThreshold !== null) {
    controls.push(materialVariances.length ? {
      id: "material-variance",
      title: `${materialVariances.length} budget ${materialVariances.length === 1 ? "variance requires" : "variances require"} explanation`,
      detail: materialVariances.map((item) => `${item.category}: ${money(item.actualAmount)} actual against ${money(item.approvedAmount)} approved (${signedMoney(item.varianceAmount)})`).join(" · "),
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

  const assistanceRule = matchingRequirement(requirements, /assistance/i, /approval|written/i);
  const assistanceThreshold = assistanceRule ? firstMoney(assistanceRule) : null;
  if (assistanceThreshold !== null) {
    const assistanceRows = usable.filter((row) => /assistance/i.test(`${row.account} ${row.category} ${row.description}`) && Math.abs(row.amount) > assistanceThreshold);
    controls.push(assistanceRows.length ? {
      id: "assistance-approvals",
      title: `${assistanceRows.length} assistance ${assistanceRows.length === 1 ? "transaction requires" : "transactions require"} approval support`,
      detail: `The award requires written approval for assistance above ${money(assistanceThreshold)}. Confirm supporting approval for ${assistanceRows.map((row) => `${row.id} (${money(row.amount)})`).join(", ")}.`,
      status: "review",
      requiresAction: true,
      transactionIds: assistanceRows.map((row) => row.id)
    } : {
      id: "assistance-approvals",
      title: "Assistance approval threshold not triggered",
      detail: `No mapped assistance transaction exceeds ${money(assistanceThreshold)}.`,
      status: "passed",
      requiresAction: false,
      transactionIds: []
    });
  }

  const indirectRule = matchingRequirement(requirements, /indirect/i, /%/i);
  const indirectPercent = indirectRule ? firstPercent(indirectRule) : null;
  const indirectCap = indirectRule ? largestMoney(indirectRule) : null;
  if (indirectPercent !== null) {
    const indirectRows = usable.filter((row) => /indirect/i.test(`${row.account} ${row.category}`));
    const indirectActual = roundMoney(indirectRows.reduce((total, row) => total + row.amount, 0));
    const directActual = roundMoney(usable.filter((row) => !/indirect/i.test(`${row.account} ${row.category}`)).reduce((total, row) => total + row.amount, 0));
    const percentageLimit = roundMoney(directActual * indirectPercent / 100);
    const allowed = indirectCap === null ? percentageLimit : Math.min(indirectCap, percentageLimit);
    const withinLimit = indirectActual <= allowed + 0.005;
    controls.push({
      id: "indirect-cost-limit",
      title: withinLimit ? "Indirect costs are within the current allowable limit" : "Indirect costs exceed the current allowable limit",
      detail: `${money(indirectActual)} charged · ${money(directActual)} eligible direct costs · current limit ${money(allowed)} (${indirectPercent}%${indirectCap === null ? "" : `, capped at ${money(indirectCap)}`}).`,
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

export function findExactBudgetCategory(account: string, requirements: CompiledRequirement[]) {
  const cleanAccount = account.trim();
  if (!cleanAccount || /^(misc|miscellaneous|other|unallocated|uncategorized|community outreach)$/i.test(cleanAccount)) return "";
  const accountTokens = meaningfulTokens(cleanAccount);
  if (accountTokens.length < 1) return "";
  const match = verifiedRequirements(requirements).find((requirement) => {
    const text = `${requirement.requirement} ${requirement.source.excerpt}`;
    const normalized = normalize(text);
    return /\$\s*[\d,]+/.test(text) && accountTokens.every((token) => normalized.includes(token));
  });
  return match ? cleanAccount : "";
}

function findApprovedAmount(category: string, requirements: CompiledRequirement[]) {
  const tokens = meaningfulTokens(category);
  for (const requirement of verifiedRequirements(requirements)) {
    const text = `${requirement.requirement} ${requirement.source.excerpt}`;
    const normalized = normalize(text);
    if (!tokens.every((token) => normalized.includes(token))) continue;
    const amounts = moneyValues(text);
    if (amounts.length) return amounts[0];
  }
  return Number.NaN;
}

function findMoneyThreshold(requirements: CompiledRequirement[], pattern: RegExp) {
  const requirement = matchingRequirement(requirements, pattern, /explain|explanation|required|threshold|variance/i);
  return requirement ? firstMoney(requirement) : null;
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

function firstMoney(value: string) { return moneyValues(value)[0] ?? null; }
function largestMoney(value: string) { const values = moneyValues(value); return values.length ? Math.max(...values) : null; }
function moneyValues(value: string) { return [...value.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((match) => Number(match[1].replaceAll(",", ""))).filter(Number.isFinite); }
function firstPercent(value: string) { const match = value.match(/(\d+(?:\.\d+)?)\s*%/); return match ? Number(match[1]) : null; }
function meaningfulTokens(value: string) { return normalize(value).split(" ").filter((token) => token.length >= 3 && !["and", "the", "for", "systems", "costs"].includes(token)); }
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function sameCategory(left: string, right: string) { return normalize(left) === normalize(right); }
function safeDate(value: string | undefined) { const timestamp = Date.parse(value || ""); return Number.isFinite(timestamp) ? new Date(timestamp) : null; }
function parsePeriod(value: string) {
  const matches = value.replace(/[–—]/g, "-").match(/(.+?)\s+(?:through|to|-)\s+(.+)/i);
  if (!matches) return null;
  const start = safeDate(matches[1]);
  const end = safeDate(matches[2]);
  return start && end ? { start, end } : null;
}
function roundMoney(value: number) { return Math.round(value * 100) / 100; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function signedMoney(value: number) { return `${value >= 0 ? "+" : "-"}${money(Math.abs(value))}`; }
