import { createHash } from "node:crypto";
import type {
  CompilationRequest,
  CompilationResult,
  CompiledRequirement,
  MissingInput,
  ProgramCheck,
  QualityCheck,
  ValidationFinding
} from "../src/types/prototype.ts";
import { extractDocxParagraphs } from "./programSourceNormalization.ts";

type RequirementType = NonNullable<CompiledRequirement["canonicalType"]>;
type Applicability = NonNullable<CompiledRequirement["applicability"]>;

/**
 * The model proposes semantic content. This boundary owns every durable identity
 * consumed by evidence reconciliation, workflow state, and customer actions.
 */
export function canonicalizeCompilationState(request: CompilationRequest, input: CompilationResult): CompilationResult {
  const sourceHashes = sourceHashMap(request);
  const authoritativeRequirementSources = new Set(request.files
    .filter((file) => ["awardAgreement", "approvedBudget", "funderTemplate"].includes(file.role))
    .map((file) => file.name.trim().toLowerCase()));
  const requirementIds = new Map<string, string>();
  const requirements = dedupeCanonical(input.requirements.map((item) => {
    const text = `${item.requirement} ${item.source.excerpt}`;
    const canonicalSubject = semanticSubject(text);
    const applicability = requirementApplicability(text, request.reportingPeriod);
    const canonicalType = requirementType(text, applicability);
    const id = stableId("requirement", [
      sourceIdentity(item.source.sourceName, sourceHashes),
      canonicalType,
      canonicalSubject,
      applicability,
      materialValues(text),
      canonicalSubject === "other" ? normalizeLocator(item.source.locator) : ""
    ]);
    requirementIds.set(item.id, id);
    return { ...item, id, canonicalType, canonicalSubject, applicability };
  }), preferredRequirement).filter((item) => item.canonicalType !== "award_fact" && authoritativeRequirementSources.has(item.source.sourceName.trim().toLowerCase()));
  const retainedRequirementIds = new Set(requirements.map((item) => item.id));

  const programIds = new Map<string, string>();
  const programChecks = dedupeCanonical((input.programChecks || []).map((item) => {
    const subject = programSubject(item);
    const id = stableId("program", [item.type, subject, normalizePeriod(request.reportingPeriod), sourceSetIdentity(item.sources, sourceHashes)]);
    programIds.set(item.id, id);
    return { ...item, id };
  }), preferredProgramCheck);

  const missingIds = new Map<string, string>();
  const missingInputs = dedupeCanonical(input.missingInputs.map((item) => {
    const context = `${item.question} ${item.reason}`;
    const id = stableId("missing", [semanticSubject(context), semanticEntityTargets(context), normalizedRole(item.assignedRole), normalizePeriod(request.reportingPeriod)]);
    missingIds.set(item.id, id);
    return { ...item, id };
  }), preferredMissingInput);

  const qualityChecks = dedupeCanonical(input.qualityChecks.map((item) => {
    const subject = semanticSubject(`${item.label} ${item.detail}`);
    const remappedProgram = item.id.startsWith("program-") ? programIds.get(item.id.slice("program-".length)) : undefined;
    const id = remappedProgram
      ? `program-${remappedProgram}`
      : deterministicApplicationId(item.id)
        ? item.id
        : stableId("quality", [subject, item.required ? "required" : "advisory", normalizePeriod(request.reportingPeriod)]);
    const factOnly = ["award-id", "award-amount", "grantee", "grant-period", "program-officer", "geography"].includes(subject);
    return factOnly ? { ...item, id, required: false, status: "passed" as const } : { ...item, id };
  }), preferredQualityCheck);

  const narrativeIds = new Map(input.narrative.map((item) => [
    item.id,
    stableId("narrative", [item.evidenceType, semanticSubject(item.text), sourceIdentity(item.source.sourceName, sourceHashes), normalizeLocator(item.source.locator)])
  ]));
  const narrative = dedupeCanonical(input.narrative.map((item) => ({ ...item, id: narrativeIds.get(item.id)! })), (left, right) => right.text.length > left.text.length ? right : left);

  const findings = dedupeFindingsByItem(input.validation.findings.map((finding) => {
    const itemId = remapItemId(finding.itemId, requirementIds, programIds, narrativeIds);
    const id = stableId("finding", [itemId, finding.verdict, semanticSubject(finding.reason)]);
    return { ...finding, id, itemId };
  })).filter((finding) => !finding.itemId.startsWith("requirement:") || retainedRequirementIds.has(finding.itemId.slice("requirement:".length)));
  const counts = validationCounts(findings);

  return {
    ...input,
    requirements,
    programChecks,
    missingInputs,
    narrative,
    qualityChecks,
    validation: {
      ...input.validation,
      ...counts,
      evidenceCoveragePercent: Math.round((counts.sourceMatchedItems / Math.max(findings.length, 1)) * 100),
      findings
    }
  };
}

/** Deterministically proposes explicit source clauses so contractual coverage is
 * not dependent on whether the model happened to split a dense paragraph. */
export function deriveExplicitSourceRequirements(request: CompilationRequest): CompiledRequirement[] {
  const requirements: CompiledRequirement[] = [];
  for (const file of request.files.filter((item) => item.role === "awardAgreement")) {
    const paragraphs = sourceParagraphs(file);
    let inApprovedBudgetSection = false;
    paragraphs.forEach((paragraph, paragraphIndex) => {
      if (isApprovedBudgetHeading(paragraph)) { inApprovedBudgetSection = true; return; }
      if (isSectionHeading(paragraph)) inApprovedBudgetSection = false;
      const clauses = paragraph.split(/(?<=[.;])\s+/).map((item) => item.trim()).filter(Boolean);
      clauses.forEach((clause, clauseIndex) => {
        if (!isExplicitObligationClause(clause) && !(inApprovedBudgetSection && isExplicitApprovedBudgetLine(clause))) return;
        const id = stableId("source-clause", [sourceIdentity(file.name, sourceHashMap(request)), String(paragraphIndex), String(clauseIndex), normalizeText(clause)]);
        requirements.push({
          id,
          requirement: clause,
          source: { sourceName: file.name, locator: `Source clause ${paragraphIndex + 1}.${clauseIndex + 1}`, excerpt: clause },
          confidence: 1,
          status: "verified"
        });
      });
    });
  }
  return requirements;
}

function sourceParagraphs(file: CompilationRequest["files"][number]) {
  if (/\.docx$/i.test(file.name) || /wordprocessingml/i.test(file.mimeType)) return extractDocxParagraphs(file);
  if (!/text|csv|json/i.test(file.mimeType) && !/\.(?:txt|csv)$/i.test(file.name)) return [];
  const encoded = file.data.split(",", 2)[1];
  if (!encoded) return [];
  try { return Buffer.from(encoded, "base64").toString("utf8").split(/\r?\n/).map((value) => value.trim()).filter(Boolean); }
  catch { return []; }
}

function isExplicitObligationClause(value: string) {
  const explicitDirective = /\b(?:must|shall|required|requires?|may not|cannot exceed|prohibited|allowable costs?|due|retain(?:ed)?|notify|submit(?:ted)?|include|limited to|released only after)\b/i.test(value);
  const quantifiedOutcome = /\b(?:serve|complete|secure|place|screen|assess|retain|house|deliver|enroll|provide|achieve)\b.{0,120}\b(?:at least|no fewer than|target(?: of| is|:)?|minimum of)\b/i.test(value)
    || /\b(?:at least|no fewer than|target(?: of| is|:)?|minimum of)\b.{0,120}\b(?:households?|participants?|clients?|assessments?|placements?|screenings?|responses?|percent|%)\b/i.test(value);
  return (explicitDirective || quantifiedOutcome)
    && !/^\s*(?:grant id|grantee|effective date|grant period|total .*award)\s*:/i.test(value);
}

function isApprovedBudgetHeading(value: string) {
  return /^\s*approved(?:\s+grant)?\s+budget\s*:?\s*$/i.test(value);
}

function isSectionHeading(value: string) {
  const letters = value.replace(/[^a-z]/gi, "");
  return letters.length >= 3 && value === value.toUpperCase() && !/[\d$]/.test(value);
}

function isExplicitApprovedBudgetLine(value: string) {
  return /^[a-z][a-z0-9 &/()_-]{1,100}:\s*\$\s*[\d,]+(?:\.\d{1,2})?\s*$/i.test(value);
}

function sourceHashMap(request: CompilationRequest) {
  const map = new Map<string, string>();
  for (const file of request.files) {
    const payload = file.data.includes(",") ? file.data.slice(file.data.indexOf(",") + 1) : file.data;
    const contentHash = payload ? createHash("sha256").update(payload).digest("hex") : "persisted-source";
    map.set(file.name.trim().toLowerCase(), createHash("sha256").update(`${file.role}\0${contentHash}`).digest("hex"));
  }
  return map;
}

function sourceIdentity(name: string, hashes: Map<string, string>) {
  return hashes.get(name.trim().toLowerCase()) || stableHash(name.trim().toLowerCase());
}

function sourceSetIdentity(sources: ProgramCheck["sources"], hashes: Map<string, string>) {
  return [...new Set(sources.map((source) => sourceIdentity(source.sourceName, hashes)))].sort().join("|");
}

function requirementType(text: string, applicability: Applicability): RequirementType {
  if (isAwardFact(text)) return "award_fact";
  if (applicability === "future") return "future_obligation";
  if (applicability === "conditional") return "conditional_obligation";
  if (/evidence|documentation|record|receipt|attachment|index|checklist|certif/i.test(text)) return "evidence_requirement";
  if (/budget|cost|expend|financial|variance|indirect|match|payment|funds?|assistance/i.test(text)) return "financial_rule";
  if (/report|submit|portal|narrative|kpi|metric|deadline|due/i.test(text)) return "reporting_requirement";
  return "contractual_obligation";
}

function requirementApplicability(text: string, selectedPeriod: string): Applicability {
  const normalized = normalizeText(text);
  const selected = normalizePeriod(selectedPeriod);
  if (/\bif\b|only if|unless|when requested|in the event|seeks? (?:a )?(?:no-cost )?extension|unspent balance|prior written approval/i.test(text)) return "conditional";
  if (/final report|interim report [234]|second interim|third interim|after (?:the )?(?:grant end|final report)|seven years|closeout/i.test(text)
    && !(selected.includes("final") && /final report/i.test(text))) return "future";
  if (/interim report 1|first interim/i.test(text) || (selected.includes("interim report 1") && /reporting period|current report/i.test(text))) return "current";
  return normalized.includes("future") ? "future" : "general";
}

function isAwardFact(text: string) {
  const obligationVerb = /\b(?:must|shall|required|submit|retain|notify|return|provide|include|complete|obtain|use|do not|may not|cannot exceed)\b/i.test(text);
  return !obligationVerb && /award (?:number|id|amount)|grantee|effective date|program officer|geograph|funder (?:name|contact)/i.test(text);
}

function semanticSubject(value: string) {
  const text = normalizeText(value);
  const rules: Array<[RegExp, string]> = [
    [/\bp1\b|unduplicated households? served|enrollment records?/, "kpi-p1-households-served"],
    [/\bp2\b|housing stability assessments?|assessment[- ]count/, "kpi-p2-assessments"],
    [/\bp3\b|households? placed|stable[- ]housing placements?/, "kpi-p3-placements"],
    [/\bp4\b|120[- ]day|housing retention|stably housed/, "kpi-p4-retention"],
    [/\bp5\b|benefits screenings?/, "kpi-p5-benefits"],
    [/\bp6\b|client satisfaction|satisfaction survey/, "kpi-p6-satisfaction"],
    [/evidence index|kpi.{0,30}underlying source|linking each reported kpi/, "kpi-evidence-index"],
    [/program director|executive director|leadership change/, "leadership-change-notification"],
    [/emergency.{0,40}assistance.{0,80}(?:approval|\$\s*1,?500|program director)/, "emergency-assistance-approval"],
    [/emergency.{0,40}assistance|housing[- ]purpose documentation/, "emergency-assistance-documentation"],
    [/indirect (?:cost|charge)|8\s*%/, "indirect-cost-limit"],
    [/budget.{0,40}(?:reallocation|modification)|15\s*%/, "budget-modification-approval"],
    [/variance|\$\s*7,?500/, "budget-variance-explanation"],
    [/matching[- ]funds?|cash contributions?/, "matching-funds"],
    [/installment|payment schedule|payment milestone/, "payment-schedule"],
    [/budget[- ]to[- ]actual|general[- ]ledger|ledger detail/, "financial-report-support"],
    [/(?:map|categorize|select).{0,80}(?:transaction|ledger)|(?:transaction|ledger).{0,80}(?:map|categor|approved grant category)/, "transaction-category-decision"],
    [/approved (?:grant )?budget|budget category|budget line/, `approved-budget-${budgetCategory(text)}`],
    [/reporting schedule|report cadence|report due|submission deadline/, `report-schedule-${reportLabel(text)}`],
    [/fund portal|submission portal/, "report-submission-portal"],
    [/narrative questions?|report narrative|major activities/, "report-narrative"],
    [/privacy|de-identified|social security|participant-level evidence|secure transfer/, "data-privacy"],
    [/record retention|retain.{0,30}(?:seven|7) years/, "records-retention"],
    [/incident|data breach|misuse of grant funds|material change/, "material-incident-notification"],
    [/no-cost extension|extension request/, "no-cost-extension"],
    [/unspent|return.{0,30}(?:balance|funds)/, "unspent-funds-return"],
    [/certification|signature|signed by/, "report-certification"],
    [/completeness and accuracy|professional review|human review/, "report-approval-review"],
    [/allowable|prohibited cost|eligible cost/, "cost-allowability"],
    [/evidence checklist|supporting evidence/, "supporting-evidence-checklist"],
    [/award (?:number|id)/, "award-id"],
    [/award amount|\$\s*325,?000/, "award-amount"],
    [/grantee/, "grantee"],
    [/effective date|grant period/, "grant-period"],
    [/program officer/, "program-officer"],
    [/geograph|service area|district/, "geography"]
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] || "other";
}

function programSubject(item: ProgramCheck) {
  const text = `${item.title} ${item.detail} ${item.action}`;
  const subject = semanticSubject(text);
  if (subject !== "other") return `${subject}:${item.type}`;
  return `${item.type}:${normalizeText(item.title).split(" ").slice(0, 10).join("-")}`;
}

function budgetCategory(text: string) {
  const categories = ["personnel", "fringe benefits", "emergency client assistance", "legal & benefits navigation", "technology & data systems", "local travel", "evaluation", "indirect costs"];
  return categories.find((category) => text.includes(category))?.replace(/[^a-z]+/g, "-") || "general";
}

function reportLabel(text: string) {
  if (/interim report 1|first interim/.test(text)) return "interim-1";
  if (/interim report 2|second interim/.test(text)) return "interim-2";
  if (/interim report 3|third interim/.test(text)) return "interim-3";
  if (/final report/.test(text)) return "final";
  return "general";
}

function normalizedRole(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "-");
}

function semanticEntityTargets(value: string) {
  return [...new Set(normalizeText(value).match(/\b[a-z][a-z0-9]*[-_][a-z0-9][a-z0-9_-]*\b/g) || [])].sort().join("|");
}

function normalizePeriod(value: string) {
  const text = normalizeText(value);
  if (/interim report 1|feb(?:ruary)?\s+1.{0,20}jul(?:y)?\s+31.{0,20}2027/.test(text)) return "interim-report-1";
  return text.replace(/[^a-z0-9]+/g, "-");
}

function normalizeLocator(value: string) {
  const text = normalizeText(value);
  const sections = [...text.matchAll(/section(?:s)?\s+([0-9]+(?:\s*(?:,|and|–|-)\s*[0-9]+)*)/g)].flatMap((match) => match[1].match(/\d+/g) || []);
  const pages = [...text.matchAll(/page(?:s)?\s+([0-9]+(?:\s*(?:,|and|–|-)\s*[0-9]+)*)/g)].flatMap((match) => match[1].match(/\d+/g) || []);
  if (!sections.length && !pages.length) return text;
  return `${sections.length ? `sections:${[...new Set(sections)].sort().join(",")}` : ""}|${pages.length ? `pages:${[...new Set(pages)].sort().join(",")}` : ""}`;
}

function materialValues(value: string) {
  return [...value.matchAll(/\$\s*[\d,]+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*%|\b\d{4}-\d{2}-\d{2}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?|\b\d+(?:\.\d+)?\b/gi)]
    .map((match) => normalizeText(match[0])).sort().join("|");
}

function remapItemId(itemId: string, requirements: Map<string, string>, programs: Map<string, string>, narratives: Map<string, string>) {
  if (itemId.startsWith("requirement:")) return `requirement:${requirements.get(itemId.slice(12)) || itemId.slice(12)}`;
  if (itemId.startsWith("program:")) return `program:${programs.get(itemId.slice(8)) || itemId.slice(8)}`;
  if (itemId.startsWith("narrative:")) return `narrative:${narratives.get(itemId.slice(10)) || itemId.slice(10)}`;
  return itemId;
}

function deterministicApplicationId(id: string) {
  return id.startsWith("deterministic-") || id.startsWith("transaction-") || id.startsWith("financial-");
}

function stableId(prefix: string, parts: string[]) {
  return `${prefix}_${stableHash(parts.join("\0")).slice(0, 24)}`;
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
}

function dedupeCanonical<T extends { id: string }>(items: T[], prefer: (left: T, right: T) => T) {
  const byId = new Map<string, T>();
  for (const item of items) byId.set(item.id, byId.has(item.id) ? prefer(byId.get(item.id)!, item) : item);
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function preferredRequirement(left: CompiledRequirement, right: CompiledRequirement) {
  return requirementScore(right) > requirementScore(left) ? right : left;
}
function requirementScore(item: CompiledRequirement) { return item.confidence * 1_000 + item.source.excerpt.length + item.source.locator.length; }
function preferredProgramCheck(left: ProgramCheck, right: ProgramCheck) { return programScore(right) > programScore(left) ? right : left; }
function programScore(item: ProgramCheck) { return item.sources.length * 1_000 + item.detail.length + item.action.length; }
function preferredMissingInput(left: MissingInput, right: MissingInput) { return right.reason.length > left.reason.length ? right : left; }
function preferredQualityCheck(left: QualityCheck, right: QualityCheck) {
  const rank = { blocked: 3, review: 2, not_evaluated: 1, passed: 0 } as const;
  return rank[right.status] > rank[left.status] ? right : left;
}
function preferredFinding(left: ValidationFinding, right: ValidationFinding) {
  const rank = { blocked: 3, review: 2, source_matched: 1 } as const;
  return rank[right.verdict] > rank[left.verdict] ? right : left;
}

function dedupeFindingsByItem(items: ValidationFinding[]) {
  const byItem = new Map<string, ValidationFinding>();
  for (const item of items) byItem.set(item.itemId, byItem.has(item.itemId) ? preferredFinding(byItem.get(item.itemId)!, item) : item);
  return [...byItem.values()].sort((left, right) => left.itemId.localeCompare(right.itemId));
}

function validationCounts(findings: ValidationFinding[]) {
  return {
    sourceMatchedItems: findings.filter((item) => item.verdict === "source_matched" || item.evidenceSatisfiedBy?.length).length,
    itemsNeedingReview: findings.filter((item) => item.verdict === "review" && !item.evidenceSatisfiedBy?.length).length,
    blockedItems: findings.filter((item) => item.verdict === "blocked" && !item.evidenceSatisfiedBy?.length).length
  };
}
