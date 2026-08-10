import type {
  CompilationRequest,
  CompilationResult,
  GrantProfile,
  GrantReportingPeriod,
  ReportInputStatus,
  SetupConflict,
  SourceRole
} from "../src/types/prototype.ts";
import { buildProgramInsights, buildRetentionInsight, satisfiedProgramCheckIds } from "../src/lib/programInsights.ts";

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
  const normalized = applyVerifiedProgramConclusions(normalizeProgramWorkflow(result));
  const setupConflicts = detectSetupConflicts(request, normalized.grantProfile);
  const inputStatus = buildInputStatus(request, normalized);
  const blockedChecks = normalized.qualityChecks.filter((check) => check.required && check.status === "blocked").length;
  const reviewChecks = normalized.qualityChecks.filter((check) => check.required && check.status === "review").length;
  const blockedFindings = normalized.validation.findings.filter((finding) => finding.verdict === "blocked").length;
  const reviewFindings = normalized.validation.findings.filter((finding) => finding.verdict === "review").length;
  const missingRequiredSources = inputStatus.filter((item) => item.requiredForCompletion && !item.available).length;
  const openMissingInputs = normalized.missingInputs.filter((item) => item.status === "open").length;
  const actionRequiredCount = setupConflicts.length + blockedChecks + blockedFindings;
  const needsReviewCount = reviewChecks + reviewFindings;
  const missingInputCount = Math.max(openMissingInputs, missingRequiredSources);
  const readiness = actionRequiredCount > 0 || missingInputCount > 0
    ? "not_ready" as const
    : needsReviewCount > 0
      ? "needs_review" as const
      : "ready_for_review" as const;
  return {
    ...normalized,
    summary: humanizeSourceSummary(normalized.summary, inputStatus),
    warnings: customerWarnings(normalized.warnings, Boolean(normalized.financialAnalysis)),
    setupConflicts,
    inputStatus,
    workflow: { readiness, actionRequiredCount, needsReviewCount, missingInputCount }
  };
}

function normalizeProgramWorkflow(result: ResultBeforeWorkflow): ResultBeforeWorkflow {
  if (!result.programChecks?.length) return result;
  const superseded = new Map<string, string>();
  const hasFinancialAnalysis = Boolean(result.financialAnalysis?.ledgerTransactionCount);
  const controls = new Set(result.financialAnalysis?.controls.map((control) => control.id) || []);
  const controlById = new Map(result.financialAnalysis?.controls.map((control) => [control.id, control]) || []);
  const hasDateExclusions = result.mappings.some((mapping) => ["excluded_outside_period", "excluded_grant_period"].includes(mapping.reportTreatment || ""));
  const hasUnmappedTransaction = result.mappings.some((mapping) => mapping.reportTreatment === "needs_category_review" || mapping.mappingConfidence === "unmapped");
  const retention = buildRetentionInsight(result);

  for (const check of result.programChecks) {
    const text = `${check.title} ${check.detail} ${check.action}`.toLowerCase();
    if (/installment|payment milestone/.test(text) && /acceptance|after submission|follows acceptance|conditional/.test(text)) {
      superseded.set(check.id, "Future milestone — no action is required until the report has been submitted and reviewed by the funder.");
    } else if (hasFinancialAnalysis && /budget[- ]to[- ]actual|budget versus actual|variance explanation/.test(text)) {
      superseded.set(check.id, "GrantDeskHQ generated the budget-to-actual schedule from the verified award budget and uploaded ledger. Any required explanation is tracked with the financial exception.");
    } else if (controlById.get("indirect-cost-limit")?.status === "passed" && /indirect/.test(text) && /cap|limit|reconcil|direct[- ]cost base|calculate/.test(text)) {
      superseded.set(check.id, controlById.get("indirect-cost-limit")!.detail);
    } else if (hasUnmappedTransaction && /new (?:grant )?budget category|creation of a new (?:grant )?budget category|program services budget category/.test(text)) {
      superseded.set(check.id, "The ledger account label is not an approved grant-budget category. GrantDeskHQ will ask the reviewer to classify the transaction first and will evaluate the prior-approval rule only if a new budget category is deliberately selected.");
    } else if (retention?.tone === "success" && /\bp4\b|120[- ]day|housing retention/.test(text) && /denominator|cohort|eligible|follow[- ]up/.test(text)) {
      superseded.set(check.id, `${retention.value}. ${retention.detail} Underlying follow-up records remain required as supporting evidence.`);
    } else if (controls.has("duplicate-transactions") && /duplicate/.test(text) && /ledger|transaction|general[- ]ledger/.test(text)) {
      superseded.set(check.id, "The duplicate is already excluded from provisional totals and tracked as one financial decision.");
    } else if (hasDateExclusions && /out[- ]of[- ]period|outside.*period|pre[- ]grant|financial population/.test(text)) {
      superseded.set(check.id, "Transactions outside the selected report or grant period were automatically excluded from current-period totals.");
    } else if ([...controls].some((id) => id.startsWith("assistance-")) && /emergency.{0,30}assistance|assistance.{0,30}(approval|support|documentation)/.test(text)) {
      superseded.set(check.id, "Emergency-assistance documentation and approvals are grouped into one financial evidence decision.");
    }
  }

  const active = result.programChecks.filter((check) => check.severity !== "info" && check.resolution === "open" && !superseded.has(check.id));
  const families = new Map<string, typeof active>();
  for (const check of active) {
    const family = programIssueFamily(check);
    if (!family) continue;
    families.set(family, [...(families.get(family) || []), check]);
  }
  for (const checks of families.values()) {
    if (checks.length < 2) continue;
    const preferred = [...checks].sort((left, right) => programCheckPriority(left.type) - programCheckPriority(right.type))[0];
    for (const check of checks) if (check.id !== preferred.id) superseded.set(check.id, `Combined with “${preferred.title}” so your team has one decision for this issue.`);
  }
  if (!superseded.size) return result;
  return {
    ...result,
    programChecks: result.programChecks.map((check) => superseded.has(check.id) ? {
      ...check,
      detail: superseded.get(check.id)!,
      action: "No separate action needed.",
      severity: "info" as const,
      resolution: "resolved" as const,
      status: "verified" as const
    } : check),
    qualityChecks: result.qualityChecks.map((check) => {
      const programId = check.id.startsWith("program-") ? check.id.slice("program-".length) : "";
      return superseded.has(programId) ? { ...check, detail: superseded.get(programId)!, required: false, status: "passed" as const } : check;
    })
  };
}

function programIssueFamily(check: NonNullable<ResultBeforeWorkflow["programChecks"]>[number]) {
  const text = `${check.title} ${check.detail}`.toLowerCase();
  if (/\bp2\b|housing stability assessment/.test(text) && /assessment/.test(text)) return "kpi-p2-assessment";
  if (/\bp6\b|client satisfaction/.test(text) && /satisfaction|survey/.test(text)) return "kpi-p6-satisfaction";
  return "";
}

function programCheckPriority(type: NonNullable<ResultBeforeWorkflow["programChecks"]>[number]["type"]) {
  return type === "data_conflict" ? 0 : type === "kpi_result" ? 1 : type === "award_trigger" ? 2 : 3;
}

function applyVerifiedProgramConclusions(result: ResultBeforeWorkflow): ResultBeforeWorkflow {
  const leadership = buildProgramInsights(result).find((item) => item.id === "leadership-notification" && item.tone === "success");
  if (!leadership || !result.programChecks?.length) return result;
  const satisfiedIds = satisfiedProgramCheckIds(result);
  if (!satisfiedIds.size) return result;
  return {
    ...result,
    programChecks: result.programChecks.map((check) => satisfiedIds.has(check.id) ? {
      ...check,
      title: leadership.title,
      detail: `${leadership.value}. ${leadership.detail}`,
      action: "No action needed.",
      severity: "info" as const,
      sources: leadership.sources,
      status: "verified" as const
    } : check),
    qualityChecks: result.qualityChecks.map((check) => {
      const programId = check.id.startsWith("program-") ? check.id.slice("program-".length) : "";
      return satisfiedIds.has(programId) ? { ...check, label: leadership.title, detail: leadership.detail, required: false, status: "passed" as const } : check;
    })
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
