import type {
  CompilationRequest,
  CompilationResult,
  GrantProfile,
  GrantReportingPeriod,
  ReportInputStatus,
  SetupConflict,
  SourceRole
} from "../src/types/prototype.ts";

type ResultBeforeWorkflow = Omit<CompilationResult, "setupConflicts" | "inputStatus" | "workflow">;

const inputDefinitions: Array<{
  role: SourceRole;
  label: string;
  core: boolean;
  requiredForCompletion: boolean;
  missingDetail: string;
  actionLabel: string;
}> = [
  { role: "awardAgreement", label: "Award document", core: true, requiredForCompletion: true, missingDetail: "Add the award agreement or Notice of Award.", actionLabel: "Add award document" },
  { role: "approvedBudget", label: "Approved budget", core: true, requiredForCompletion: true, missingDetail: "Add the approved grant budget when it becomes available.", actionLabel: "Add approved budget" },
  { role: "ledgerExport", label: "Accounting data", core: true, requiredForCompletion: true, missingDetail: "Add a GL export to calculate spend and budget versus actual.", actionLabel: "Add accounting data" },
  { role: "funderTemplate", label: "Funder report form", core: true, requiredForCompletion: false, missingDetail: "Optional unless the funder provides a required form or portal questions.", actionLabel: "Add funder form" },
  { role: "programUpdate", label: "Program results", core: true, requiredForCompletion: true, missingDetail: "Add program results or request them from the Program team.", actionLabel: "Add program update" },
  { role: "supportingEvidence", label: "Supporting evidence", core: false, requiredForCompletion: false, missingDetail: "Add only the attachments required by this award.", actionLabel: "Add supporting evidence" }
];

export function applyWorkflowState(request: CompilationRequest, result: ResultBeforeWorkflow): CompilationResult {
  const setupConflicts = detectSetupConflicts(request, result.grantProfile);
  const inputStatus = buildInputStatus(request, result);
  const blockedChecks = result.qualityChecks.filter((check) => check.required && check.status === "blocked").length;
  const reviewChecks = result.qualityChecks.filter((check) => check.required && check.status === "review").length;
  const blockedFindings = result.validation.findings.filter((finding) => finding.verdict === "blocked").length;
  const reviewFindings = result.validation.findings.filter((finding) => finding.verdict === "review").length;
  const missingRequiredSources = inputStatus.filter((item) => item.requiredForCompletion && !item.available).length;
  const openMissingInputs = result.missingInputs.filter((item) => item.status === "open").length;
  const actionRequiredCount = setupConflicts.length + blockedChecks + blockedFindings;
  const needsReviewCount = reviewChecks + reviewFindings;
  const missingInputCount = Math.max(openMissingInputs, missingRequiredSources);
  const readiness = actionRequiredCount > 0 || missingInputCount > 0
    ? "not_ready" as const
    : needsReviewCount > 0
      ? "needs_review" as const
      : "ready_for_review" as const;
  return {
    ...result,
    summary: humanizeSourceSummary(result.summary, inputStatus),
    warnings: customerWarnings(result.warnings, Boolean(result.financialAnalysis)),
    setupConflicts,
    inputStatus,
    workflow: { readiness, actionRequiredCount, needsReviewCount, missingInputCount }
  };
}

export function buildInputStatus(request: CompilationRequest, result?: Pick<ResultBeforeWorkflow, "missingInputs" | "requirements">): ReportInputStatus[] {
  const available = new Set(request.files.map((file) => file.role));
  const evidenceRequired = Boolean(result?.missingInputs.some((item) => /receipt|attachment|supporting evidence|documentation/i.test(`${item.question} ${item.reason}`)));
  const budgetFoundInAward = Boolean(result?.requirements.some((item) => item.status === "verified" && /\$\s*[\d,]+/.test(`${item.requirement} ${item.source.excerpt}`) && /approved budget|budget(?:ed)?|allocation|(?:personnel|travel|supplies|indirect|technology|assistance|occupancy|training|equipment)/i.test(`${item.requirement} ${item.source.excerpt}`)));
  return inputDefinitions.map((definition) => {
    const isAvailable = available.has(definition.role) || (definition.role === "approvedBudget" && budgetFoundInAward);
    return {
      role: definition.role,
      label: definition.label,
      available: isAvailable,
      core: definition.core,
      requiredForCompletion: definition.requiredForCompletion || (definition.role === "supportingEvidence" && evidenceRequired),
      detail: isAvailable ? definition.role === "approvedBudget" && !available.has("approvedBudget") ? "Budget details were found in the award document." : "Available for this report." : definition.missingDetail,
      actionLabel: definition.actionLabel
    };
  });
}

function humanizeSourceSummary(summary: string, inputStatus: ReportInputStatus[]) {
  const sentences = summary.split(/(?<=[.!?])\s+/).filter((sentence) => !containsInternalSourceRole(sentence));
  const missingRequired = inputStatus.filter((item) => item.requiredForCompletion && !item.available).map((item) => item.label.toLowerCase());
  const missingSentence = missingRequired.length ? `Still needed: ${humanList(missingRequired)}.` : "";
  return [...sentences, missingSentence].filter(Boolean).join(" ").trim();
}

function humanList(items: string[]) {
  if (items.length < 2) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function detectSetupConflicts(
  request: Pick<CompilationRequest, "grantName" | "reportingPeriod"> & Partial<Pick<CompilationRequest, "organizationName">>,
  profile: GrantProfile,
  reportingPeriods: GrantReportingPeriod[] = []
): SetupConflict[] {
  const conflicts: SetupConflict[] = [];
  const extractedGrantee = usable(profile.granteeName);
  if (request.organizationName && extractedGrantee && clearlyDifferentIdentity(request.organizationName, extractedGrantee)) {
    conflicts.push({
      id: "setup-organization-identity",
      type: "organization_identity",
      title: "Organization details do not match",
      detail: `This report is set up for “${request.organizationName},” but the uploaded award identifies “${extractedGrantee}” as the grantee.`,
      enteredValue: request.organizationName,
      sourceValue: extractedGrantee,
      source: profile.granteeName!.source,
      status: "action_required"
    });
  }
  const extractedIdentity = [usable(profile.funderName), usable(profile.grantName)].filter(Boolean).join(" — ");
  if (extractedIdentity && clearlyDifferentIdentity(request.grantName, extractedIdentity)) {
    conflicts.push({
      id: "setup-grant-identity",
      type: "grant_identity",
      title: "Grant details do not match",
      detail: `This report is set up for “${request.grantName},” but the uploaded award identifies “${extractedIdentity}.”`,
      enteredValue: request.grantName,
      sourceValue: extractedIdentity,
      source: profile.grantName.source,
      status: "action_required"
    });
  }

  const requested = parseReportingPeriod(request.reportingPeriod);
  const grantStart = parseDate(usable(profile.grantStartDate));
  const grantEnd = parseDate(usable(profile.grantEndDate));
  if (requested && grantStart && grantEnd && (requested.start < grantStart || requested.end > grantEnd)) {
    const recommended = firstVerifiedReportingPeriod(reportingPeriods);
    conflicts.push({
      id: "setup-reporting-period",
      type: "reporting_period",
      title: "Reporting period is outside the grant period",
      detail: `The report period ${formatDateRange(requested.start, requested.end)} falls outside the grant period ${formatDateRange(grantStart, grantEnd)}.`,
      enteredValue: request.reportingPeriod,
      sourceValue: `${profile.grantStartDate.value} through ${profile.grantEndDate.value}`,
      source: requested.start < grantStart ? profile.grantStartDate.source : profile.grantEndDate.source,
      status: "action_required",
      ...(recommended ? {
        suggestedValue: formatDateRange(recommended.start, recommended.end),
        suggestedPeriodId: recommended.period.id,
        suggestedLabel: recommended.period.title,
        suggestedDueDate: recommended.due ? formatDate(recommended.due) : undefined
      } : {})
    });
  }
  return conflicts;
}

export function customerWarnings(warnings: string[], hasFinancialAnalysis = false) {
  return warnings.filter((warning) => {
    const value = warning.toLowerCase();
    if (containsInternalSourceRole(value)) return false;
    if (/internal document|not been submitted to the funder|synthetic (?:test )?document|test content detected/.test(value)) return false;
    if (/source package identifies .* as grantee|request identifies|resolve before submission/.test(value)) return false;
    if (/financial totals|transaction amounts/.test(value)) return false;
    if (hasFinancialAnalysis && /mapped .*spending|annual category amount|budget variance|variance explanation/.test(value)) return false;
    return true;
  });
}

function containsInternalSourceRole(value: string) {
  return /approvedbudget|fundertemplate|supportingevidence|programupdate|ledgerexport|approved-budget|program-update|funder-template|supporting-evidence|source roles?/i.test(value);
}

function firstVerifiedReportingPeriod(reportingPeriods: GrantReportingPeriod[]) {
  return reportingPeriods
    .filter((period) => period.status === "verified" && period.confidence >= 0.85)
    .map((period) => ({ period, start: parseDate(period.startDate), end: parseDate(period.endDate), due: parseDate(period.dueDate) }))
    .filter((item): item is { period: GrantReportingPeriod; start: Date; end: Date; due: Date | null } => Boolean(item.start && item.end))
    .sort((left, right) => left.start.getTime() - right.start.getTime())[0];
}

function formatDateRange(start: Date, end: Date) {
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  if (startYear === endYear) return `${monthDay.format(start)} – ${monthDay.format(end)}, ${endYear}`;
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value);
}

function usable(field: GrantProfile[keyof GrantProfile] | undefined) {
  if (!field) return "";
  if (field.confidence < 0.85 || field.status === "blocked" || field.status === "not_evaluated" || /^information required|unknown|not (found|stated)/i.test(field.value.trim())) return "";
  return field.value.trim();
}

function clearlyDifferentIdentity(entered: string, extracted: string) {
  const enteredTokens = meaningfulTokens(entered);
  const extractedTokens = meaningfulTokens(extracted);
  if (!enteredTokens.size || !extractedTokens.size) return false;
  const overlap = [...enteredTokens].filter((token) => extractedTokens.has(token)).length;
  return overlap / Math.min(enteredTokens.size, extractedTokens.size) < 0.25;
}

function meaningfulTokens(value: string) {
  const common = new Set(["and", "the", "for", "of", "grant", "award", "program", "project", "foundation", "initiative", "services", "community", "youth"]);
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((token) => token.length > 2 && !common.has(token)));
}

function parseReportingPeriod(value: string) {
  const normalized = value.replace(/[–—]/g, "-").trim();
  const iso = normalized.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|-)\s*(\d{4}-\d{2}-\d{2})/i);
  if (iso) {
    const start = parseDate(iso[1]);
    const end = parseDate(iso[2]);
    return start && end ? { start, end } : null;
  }
  const named = normalized.match(/([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s*-\s*([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (!named) return null;
  const start = parseDate(`${named[1]} ${named[2]}, ${named[3] || named[6]}`);
  const end = parseDate(`${named[4]} ${named[5]}, ${named[6]}`);
  return start && end ? { start, end } : null;
}

function parseDate(value: string) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}
