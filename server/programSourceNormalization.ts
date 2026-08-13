import { strFromU8, unzipSync } from "fflate";
import type { CompilationRequest, CompilationResult, CompilerFile, SourceReference } from "../src/types/prototype.ts";

export function applyDeterministicProgramSourceFacts(request: CompilationRequest, result: CompilationResult): CompilationResult {
  const programFile = request.files.find((file) => file.role === "programUpdate" && /\.docx$/i.test(file.name));
  if (!programFile) return result;
  const paragraphs = extractDocxParagraphs(programFile);
  if (!paragraphs.length) return result;

  const narrative = [...result.narrative];
  const programChecks = [...(result.programChecks || [])];
  let requirements = [...result.requirements];
  const p2 = assessmentConflict(paragraphs);
  if (p2 && p2.tableValue !== p2.narrativeValue) {
    const source = sourceReference(programFile, "Program Performance Metrics and Major Activities", `${p2.tableExcerpt} ${p2.narrativeExcerpt}`);
    const existingIndex = programChecks.findIndex((check) => check.type === "data_conflict" && /\bp2\b|assessment/i.test(`${check.title} ${check.detail}`));
    const normalizedCheck: NonNullable<CompilationResult["programChecks"]>[number] = {
      id: "deterministic-p2-assessment-conflict",
      type: "data_conflict",
      title: "P2 — Assessment count needs confirmation",
      detail: `The KPI table reports ${p2.tableValue} completed assessments, while the activities narrative states ${p2.narrativeValue}.`,
      action: `Use the underlying assessment records to confirm ${p2.tableValue} or ${p2.narrativeValue}.`,
      owner: "Program",
      severity: "review",
      sources: [source],
      resolution: "open",
      status: "verified"
    };
    if (existingIndex >= 0) programChecks[existingIndex] = normalizedCheck;
    else programChecks.push(normalizedCheck);
    for (let index = programChecks.length - 1; index >= 0; index -= 1) {
      const check = programChecks[index];
      if (check.id !== normalizedCheck.id && check.type === "data_conflict" && /\bp2\b|assessment/i.test(`${check.title} ${check.detail}`)) programChecks.splice(index, 1);
    }
  }

  const pendingSatisfaction = satisfactionPending(paragraphs);
  if (pendingSatisfaction && !narrative.some((item) => /satisfaction/i.test(item.text) && /under validation|not finalized|not confirmed/i.test(item.text))) {
    narrative.push({
      id: "deterministic-p6-pending-history",
      text: pendingSatisfaction,
      evidenceType: "needs_confirmation",
      source: sourceReference(programFile, "Program Performance Metrics and Data Quality", pendingSatisfaction),
      status: "verified"
    });
  }

  const leadership = leadershipChange(paragraphs);
  if (leadership) {
    const programSource = sourceReference(programFile, "Challenges, Risks, and Corrective Actions — Program staffing change", leadership.excerpt);
    if (!narrative.some((item) => /program director/i.test(item.text) && /resigned|leadership change|staffing change/i.test(item.text) && /notif(?:ied|ication)/i.test(item.text))) {
      narrative.push({
        id: "deterministic-program-director-change",
        text: leadership.excerpt,
        evidenceType: "source_fact",
        source: programSource,
        status: "verified"
      });
    }
    let awardRequirement = requirements.find((requirement) => requirement.status === "verified"
      && /program director|leadership|key personnel/i.test(requirement.requirement)
      && /notify|notification/i.test(requirement.requirement));
    const awardFile = request.files.find((file) => file.role === "awardAgreement" && /\.docx$/i.test(file.name));
    const exactAwardClause = awardFile
      ? extractDocxParagraphs(awardFile).find((value) => /within\s+five(?:\s*\(5\))?\s+business\s+days\s+after\s+becoming\s+aware/i.test(value) && /program director/i.test(value))
      : undefined;
    if (!awardRequirement && awardFile && exactAwardClause) {
      const exactSource = sourceReference(awardFile, "Section 13 — Material Incident and Change Notification", exactAwardClause);
      awardRequirement = {
        id: "source-award-program-director-notification",
        requirement: exactAwardClause,
        confidence: 1,
        status: "verified",
        source: exactSource
      };
      requirements.push(awardRequirement);
    } else if (awardRequirement && awardFile && exactAwardClause) {
      const exactSource = sourceReference(awardFile, "Section 13 — Material Incident and Change Notification", exactAwardClause);
      requirements = requirements.map((requirement) => requirement.id === awardRequirement!.id ? {
        ...requirement,
        requirement: exactAwardClause,
        confidence: Math.max(requirement.confidence, 0.99),
        status: "verified" as const,
        source: exactSource
      } : requirement);
      awardRequirement = requirements.find((requirement) => requirement.id === awardRequirement!.id);
    }
    if (awardRequirement) {
      const awarenessRequired = /aware|awareness/i.test(awardRequirement.requirement);
      const existingIndex = programChecks.findIndex((check) => check.type === "award_trigger" && /program director|leadership|staffing change/i.test(`${check.title} ${check.detail}`));
      const normalizedCheck: NonNullable<CompilationResult["programChecks"]>[number] = {
        id: "deterministic-program-director-notification",
        type: "award_trigger",
        title: awarenessRequired ? "Program Director notification timing needs confirmation" : "Program Director change notification",
        detail: awarenessRequired
          ? `The Program Director change was effective ${leadership.effectiveDate} and the funder was notified ${leadership.notificationDate}. The award measures the deadline from awareness, but the supplied update does not establish the awareness date.`
          : `The Program Director change was effective ${leadership.effectiveDate} and the funder was notified ${leadership.notificationDate}.`,
        action: awarenessRequired ? "Confirm the date the organization became aware of the change and retain the notification evidence." : "Confirm the notification timing against the award requirement.",
        owner: "Grants",
        severity: awarenessRequired ? "review" : "info",
        sources: [programSource, awardRequirement.source],
        resolution: "open",
        status: "verified"
      };
      if (existingIndex >= 0) programChecks[existingIndex] = normalizedCheck;
      else programChecks.push(normalizedCheck);
      for (let index = programChecks.length - 1; index >= 0; index -= 1) {
        const check = programChecks[index];
        if (check.id !== normalizedCheck.id && check.type === "award_trigger" && /program director|leadership|staffing change/i.test(`${check.title} ${check.detail}`)) programChecks.splice(index, 1);
      }
    }
  }

  const programIds = new Set(programChecks.map((check) => check.id));
  const qualityChecks = result.qualityChecks
    .filter((check) => !check.id.startsWith("program-") || programIds.has(check.id.slice("program-".length)));
  for (const check of programChecks.filter((item) => item.severity !== "info")) {
    const id = `program-${check.id}`;
    const index = qualityChecks.findIndex((item) => item.id === id);
    const normalized = {
      id,
      label: check.title,
      detail: check.detail,
      required: check.severity === "action_required",
      status: check.status === "blocked" ? "blocked" as const : "review" as const
    };
    if (index >= 0) qualityChecks[index] = { ...qualityChecks[index], ...normalized };
    else qualityChecks.push(normalized);
  }

  return { ...result, requirements, narrative, programChecks, qualityChecks };
}

export function extractDocxParagraphs(file: CompilerFile): string[] {
  const encoded = file.data.split(",", 2)[1];
  if (!encoded) return [];
  try {
    const entries = unzipSync(Buffer.from(encoded, "base64"));
    const document = entries["word/document.xml"];
    if (!document) return [];
    return strFromU8(document)
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .split(/\n+/)
      .map((value) => decodeXml(value).replace(/\s+/g, " ").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function assessmentConflict(paragraphs: string[]) {
  const p2Index = paragraphs.findIndex((value) => /^P2$/i.test(value));
  if (p2Index < 0) return null;
  const p2Window = paragraphs.slice(p2Index, p2Index + 9);
  if (!p2Window.some((value) => /housing stability assessments completed/i.test(value))) return null;
  const tableValueText = p2Window.find((value) => /^\d[\d,]*$/.test(value));
  const narrativeExcerpt = paragraphs.find((value) => /completed\s+\d[\d,]*\s+(?:housing stability\s+)?assessments during the reporting period/i.test(value));
  const narrativeValueText = narrativeExcerpt?.match(/completed\s+(\d[\d,]*)\s+(?:housing stability\s+)?assessments/i)?.[1];
  if (!tableValueText || !narrativeValueText) return null;
  return {
    tableValue: Number(tableValueText.replaceAll(",", "")),
    narrativeValue: Number(narrativeValueText.replaceAll(",", "")),
    tableExcerpt: p2Window.join(" · "),
    narrativeExcerpt
  };
}

function leadershipChange(paragraphs: string[]) {
  const excerpt = paragraphs.find((value) => /program director/i.test(value) && /resigned|leadership change|staffing change/i.test(value) && /notif(?:ied|ication)/i.test(value));
  if (!excerpt) return null;
  const effectiveDate = excerpt.match(/(?:resigned|change(?:d)?)(?:\s+effective|\s+on|\s+as of)?\s+([A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?)/i)?.[1];
  const notificationDate = excerpt.match(/notif(?:ied|ication)[^.]{0,80}?(?:on\s+)?([A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?)/i)?.[1];
  if (!effectiveDate || !notificationDate) return null;
  return { excerpt, effectiveDate, notificationDate };
}

function satisfactionPending(paragraphs: string[]) {
  return paragraphs.find((value) => /satisfaction[- ]survey dataset/i.test(value) && /under validation|not finalized|not confirmed/i.test(value))
    || paragraphs.find((value) => /survey dataset still under validation/i.test(value));
}

function sourceReference(file: CompilerFile, locator: string, excerpt: string): SourceReference {
  return { sourceName: file.name, locator, excerpt: excerpt.slice(0, 700) };
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}
