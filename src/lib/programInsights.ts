import type { CompilationResult, SourceReference } from "../types/prototype";

export interface ProgramInsight {
  id: string;
  tone: "success" | "review" | "neutral";
  status: string;
  title: string;
  value: string;
  detail: string;
  sources: SourceReference[];
}

interface CountMetricDefinition {
  family: KpiFamily;
  id: string;
  title: string;
  actual: RegExp[];
  requirement: RegExp;
  issue: RegExp;
}

const countMetrics: CountMetricDefinition[] = [
  {
    family: "p1", id: "households-served", title: "Households served",
    actual: [/(?:served|serving)\s+(\d[\d,]*)\s+(?:unduplicated\s+)?households?/i, /(\d[\d,]*)\s+(?:unduplicated\s+)?households?\s+(?:were\s+)?served/i],
    requirement: /(?:unduplicated\s+)?households?.*(?:serve[ds]?|receiv(?:e|ing)|navigation)|(?:serve[ds]?|receiv(?:e|ing)|navigation).*(?:unduplicated\s+)?households?/i,
    issue: /\bp1\b|households? served|unduplicated households?/i
  },
  {
    family: "p2", id: "housing-assessments", title: "Housing assessments",
    actual: [/(?:completed|reported)\s+(\d[\d,]*)\s+(?:housing(?:-related| stability)?\s+)?assessments?/i, /(\d[\d,]*)\s+(?:housing(?:-related| stability)?\s+)?assessments?\s+(?:were\s+)?completed/i],
    requirement: /housing(?:-related| stability)?\s+assessments?|assessments?.*households?/i,
    issue: /\bp2\b|housing(?:-related| stability)? assessments?/i
  },
  {
    family: "p3", id: "housing-placements", title: "Housing placements",
    actual: [
      /(?:placed|placing)\s+(\d[\d,]*)\s+households?/i,
      /(\d[\d,]*)\s+households?\s+(?:were\s+)?placed/i,
      /(?:secured?|securing|documented?)\s+(\d[\d,]*)\s+(?:stable[- ]housing\s+)?placements?/i,
      /(\d[\d,]*)\s+(?:stable[- ]housing\s+)?placements?/i
    ],
    requirement: /households?.*(?:place[ds]?|stable housing)|(?:plac(?:e[ds]?|ing)|stable housing).*households?|stable[- ]housing placements?|stable placements?/i,
    issue: /\bp3\b|housing placements?|households? placed/i
  },
  {
    family: "p5", id: "benefits-screenings", title: "Benefits screenings",
    actual: [/(?:benefits?\s+)?screenings?\s+for\s+(\d[\d,]*)\s+households?/i, /(\d[\d,]*)\s+households?[^.]*benefits?\s+screenings?/i, /(?:completed|completing|documented)\s+(\d[\d,]*)\s+benefits?\s+screenings?/i],
    requirement: /benefits?\s+screenings?|screenings?.*households?/i,
    issue: /\bp5\b|benefits? screenings?/i
  }
];

type KpiFamily = "p1" | "p2" | "p3" | "p4" | "p5" | "p6";

const kpiInsightIds = new Set([...countMetrics.map((item) => item.id), "housing-retention", "client-satisfaction"]);

export interface ProgramReadinessSummary {
  ready: number;
  conflicts: number;
  awaitingConfirmation: number;
}

export function buildProgramInsights(result: Pick<CompilationResult, "narrative" | "requirements" | "programChecks">): ProgramInsight[] {
  const facts = programFacts(result);
  const requirements = result.requirements.filter((item) => item.status === "verified");
  const insights: ProgramInsight[] = [];

  for (const metric of countMetrics) {
    const conflicts = openMetricConflicts(result.programChecks, metric.issue);
    const fact = findNumberFact(facts, metric.actual);
    const evidenceBackedConflict = conflicts.find((item) => parseNumber(item.evidenceBackedValue) !== null);
    const actual = fact?.value ?? parseNumber(evidenceBackedConflict?.evidenceBackedValue);
    if (actual === null) continue;
    const targetResult = metricTarget(requirements, metric);
    const requirement = targetResult?.requirement;
    const target = targetResult?.target ?? null;
    const progress = target && target > 0 ? roundOne((actual / target) * 100) : null;
    const achieved = target !== null && actual >= target;
    const served = metric.family === "p2" ? findNumberFact(facts, countMetrics[0].actual)?.value ?? null : null;
    const servedShare = served && served > 0 ? roundOne((actual / served) * 100) : null;
    const progressDetail = target
      ? `${progress}% of the cumulative grant target.${servedShare !== null ? ` ${servedShare}% of households served completed an assessment.` : ""} No interim target was specified, so this is shown as cumulative progress rather than a schedule assessment.`
      : "Current-period result confirmed from the program update.";
    insights.push({
      id: metric.id,
      tone: conflicts.length ? "review" : achieved ? "success" : "neutral",
      status: conflicts.length ? "Needs confirmation" : achieved ? "Target achieved" : "Progress recorded",
      title: metric.title,
      value: target ? `${actual.toLocaleString()} of ${target.toLocaleString()}` : actual.toLocaleString(),
      detail: conflicts.length
        ? `${progressDetail} Underlying evidence supports ${actual.toLocaleString()}, but another supplied source reports a different value; use the evidence-backed result or document the reason for keeping the conflicting value.`
        : progressDetail,
      sources: compactSources([...(fact?.sources || []), requirement?.source, ...conflicts.flatMap((item) => item.sources)])
    });
  }

  const retention = buildRetentionInsight(result);
  if (retention && !hasOpenMetricConflict(result.programChecks, /\bp4\b|120-day|retention/i)) insights.push(retention);

  const satisfactionFacts = facts.filter((item) => /satisfaction/i.test(item.text) && /(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*5/i.test(item.text) && !/not confirmed|not finalized|under validation|needs confirmation|information required/i.test(item.text));
  const confirmedSatisfaction = satisfactionFacts.find((item) => item.id === "evidence-p6-satisfaction")
    || satisfactionFacts.find((item) => item.sources.some((source) => /\.(?:xlsx|csv)$/i.test(source.sourceName)))
    || satisfactionFacts.find(() => true);
  const satisfactionScore = confirmedSatisfaction?.text.match(/(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*5/i)?.[1];
  const satisfactionResponses = confirmedSatisfaction?.text.match(/(\d[\d,]*)\s+(?:valid\s+)?(?:survey\s+)?responses?/i)?.[1];
  if (confirmedSatisfaction && satisfactionScore) {
    const satisfactionRequirementPattern = /client[- ]satisfaction|satisfaction survey|average satisfaction/i;
    const satisfactionTargetResult = rankedRequirements(requirements, "p6", satisfactionRequirementPattern)
      .map((requirement) => ({ requirement, target: satisfactionTarget(isolateKpiSegment(requirement.requirement, "p6", satisfactionRequirementPattern)) }))
      .find((candidate) => candidate.target !== null);
    const satisfactionRequirement = satisfactionTargetResult?.requirement;
    const satisfactionTargetValue = satisfactionTargetResult?.target ?? null;
    const achieved = satisfactionTargetValue !== null && Number(satisfactionScore) >= satisfactionTargetValue;
    insights.push({
      id: "client-satisfaction",
      tone: achieved ? "success" : "neutral",
      status: achieved ? "Target achieved" : "Result confirmed",
      title: "Average client satisfaction",
      value: `${satisfactionScore} of 5${satisfactionTargetValue !== null ? ` · target ${satisfactionTargetValue}` : ""}`,
      detail: `${satisfactionResponses ? `Confirmed from ${satisfactionResponses} valid survey responses.` : "Confirmed from the matched satisfaction-survey evidence."} The finalized survey evidence supersedes the earlier pending-validation status; that discrepancy remains recorded in the report history.`,
      sources: compactSources([...confirmedSatisfaction.sources, satisfactionRequirement?.source])
    });
  }

  const satisfactionFact = !confirmedSatisfaction && facts.find((item) => /satisfaction/i.test(item.text) && /not confirmed|not finalized|under validation|needs confirmation|information required/i.test(item.text));
  if (satisfactionFact) {
    insights.push({
      id: "satisfaction-unconfirmed",
      tone: "review",
      status: "Not ready for reporting",
      title: "Client satisfaction",
      value: "Confirmation needed",
      detail: "The survey result is still being validated, so GrantDeskHQ keeps this KPI out of the report until the final value is confirmed.",
      sources: satisfactionFact.sources
    });
  }

  const leadership = leadershipNotificationInsight(result);
  if (leadership) insights.push(leadership);

  for (const check of (result.programChecks || []).filter((item) => item.type === "kpi_result" && item.severity !== "info" && item.resolution === "open")) {
    if (/budget[- ]to[- ]actual|financial report|variance explanation/i.test(`${check.title} ${check.detail}`)) continue;
    if (insights.some((item) => similar(item.title, check.title))) continue;
    insights.push({ id: `check-${check.id}`, tone: "review", status: "Needs review", title: check.title, value: "Information required", detail: check.detail, sources: check.sources });
  }

  return insights;
}

export function buildRetentionInsight(result: Pick<CompilationResult, "narrative" | "requirements">): ProgramInsight | null {
  const facts = result.narrative
    .filter((item) => item.status === "verified")
    .map((item) => ({ text: item.text, sources: [item.source] }));
  const retentionFact = facts.find((item) => retentionCounts(item.text));
  if (!retentionFact) return null;
  const counts = retentionCounts(retentionFact.text);
  const eligible = counts?.eligible ?? null;
  const retained = counts?.retained ?? null;
  const retentionPattern = /retention|remain(?:ed)?\s+(?:stably\s+)?housed|stable\s+at\s+120\s+days?|120[- ]day\s+housing\s+stability|stable\s+housing[^.]{0,80}120\s+days?|placed\s+households?[^.]{0,80}120\s+days?|120\s+days?[^.]{0,80}stable\s+housing/i;
  const retentionTargetResult = rankedRequirements(result.requirements.filter((item) => item.status === "verified"), "p4", retentionPattern)
    .map((requirement) => ({ requirement, target: retentionTarget(isolateKpiSegment(requirement.requirement, "p4", retentionPattern)) }))
    .find((candidate) => candidate.target !== null);
  const retentionRequirement = retentionTargetResult?.requirement;
  const target = retentionTargetResult?.target ?? null;
  if (!eligible || retained === null || retained > eligible) return null;
  const actual = roundOne((retained / eligible) * 100);
  const achieved = target !== null && actual >= target;
  return {
    id: "housing-retention",
    tone: achieved ? "success" : "neutral",
    status: achieved ? "Target achieved" : target === null ? "Result confirmed" : "Target not yet achieved",
    title: "120-day housing retention",
    value: `${actual}%${target !== null ? ` · target ${target}%` : ""}`,
    detail: `${retained} of ${eligible} households currently eligible for 120-day follow-up remained housed. The percentage is calculated from that eligible cohort; more recent placements are not treated as having failed the 120-day measure.`,
    sources: compactSources([...retentionFact.sources, retentionRequirement?.source])
  };
}

export function buildProgramReadiness(result: Pick<CompilationResult, "narrative" | "requirements" | "programChecks">): ProgramReadinessSummary {
  const insights = buildProgramInsights(result);
  const openChecks = (result.programChecks || []).filter((item) => item.resolution === "open" && item.severity !== "info" && (item.type === "data_conflict" || !item.evidenceSatisfiedBy?.length));
  const conflictFamilies = new Set(openChecks
    .filter((item) => item.type === "data_conflict" || /conflict|inconsistent|does not match/i.test(`${item.title} ${item.detail}`))
    .map((item) => metricIssueFamily(`${item.title} ${item.detail}`))
    .filter(Boolean));
  const awaitingFamilies = new Set(openChecks
    .filter((item) => item.type === "kpi_result" && !/budget[- ]to[- ]actual|financial report|variance explanation/i.test(`${item.title} ${item.detail}`))
    .map((item) => metricIssueFamily(`${item.title} ${item.detail}`))
    .filter((family) => family && !conflictFamilies.has(family)));
  if (insights.some((item) => item.id === "satisfaction-unconfirmed")) awaitingFamilies.add("p6-satisfaction");
  const readyFamilies = new Set(insights
    .filter((item) => kpiInsightIds.has(item.id) && item.tone !== "review")
    .map((item) => insightFamily(item.id))
    .filter(Boolean));
  const expectedFamilies = expectedProgramKpiFamilies(result, insights);

  let ready = 0;
  let conflicts = 0;
  let awaitingConfirmation = 0;
  for (const family of expectedFamilies) {
    const issueFamily = familyLabel(family);
    if (conflictFamilies.has(issueFamily)) conflicts += 1;
    else if (awaitingFamilies.has(issueFamily) || !readyFamilies.has(family)) awaitingConfirmation += 1;
    else ready += 1;
  }
  return { ready, conflicts, awaitingConfirmation };
}

export function expectedProgramKpiCount(result: Pick<CompilationResult, "narrative" | "requirements" | "programChecks">) {
  return expectedProgramKpiFamilies(result, buildProgramInsights(result)).size;
}

function expectedProgramKpiFamilies(result: Pick<CompilationResult, "narrative" | "requirements" | "programChecks">, insights: ProgramInsight[]) {
  const expectedFamilies = new Set<KpiFamily>();
  for (const requirement of result.requirements) for (const family of metricIssueFamilies(requirement.requirement)) expectedFamilies.add(family);
  for (const insight of insights) {
    const family = insightFamily(insight.id);
    if (family) expectedFamilies.add(family);
  }
  for (const check of result.programChecks || []) for (const family of metricIssueFamilies(`${check.title} ${check.detail}`)) expectedFamilies.add(family);
  return expectedFamilies;
}

export function satisfiedProgramCheckIds(result: Pick<CompilationResult, "narrative" | "requirements" | "programChecks">) {
  const insights = buildProgramInsights(result);
  const leadershipSatisfied = insights.some((item) => item.id === "leadership-notification" && item.tone === "success");
  return new Set((result.programChecks || [])
    .filter((check) => leadershipSatisfied && check.type === "award_trigger" && /program director|leadership|staffing change/i.test(`${check.title} ${check.detail}`))
    .map((check) => check.id));
}

function leadershipNotificationInsight(result: Pick<CompilationResult, "narrative" | "requirements">): ProgramInsight | null {
  const statement = result.narrative.find((item) => /program director/i.test(item.text) && /resigned|leadership change|staffing change/i.test(item.text) && /notified/i.test(item.text));
  const requirement = result.requirements.find((item) => /program director|leadership|key personnel/i.test(item.requirement) && /business days?|notification|notify/i.test(item.requirement));
  if (!statement || !requirement || statement.status !== "verified" || requirement.status !== "verified") return null;
  const eventMatch = statement.text.match(/(?:resigned|change(?:d)?|occurred)(?:\s+(?:effective|on|as of))?\s+([A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?)/i);
  const noticeMatch = statement.text.match(/(?:notified(?:\s+(?:the\s+)?(?:fund|funder))?|(?:the\s+)?(?:fund|funder)\s+was\s+notified)(?:\s+on)?\s+([A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?)/i);
  const deadlineMatch = requirement.requirement.match(/within\s+(\d+)\s+business days?/i);
  const eventDate = parseHumanDate(eventMatch?.[1], statement.text);
  const noticeDate = parseHumanDate(noticeMatch?.[1], statement.text);
  const awarenessMatch = statement.text.match(/(?:became aware|learned|awareness date)(?:\s+of|\s+was|\s+on|\s*:)?\s+([A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?)/i);
  const awarenessDate = parseHumanDate(awarenessMatch?.[1], statement.text);
  const deadline = deadlineMatch ? Number(deadlineMatch[1]) : null;
  if (!eventDate || !noticeDate || !deadline) return null;
  if (/aware|awareness/i.test(requirement.requirement) && !awarenessDate) {
    return {
      id: "leadership-notification",
      tone: "review",
      status: "Evidence needed",
      title: "Program Director notification timing needs confirmation",
      value: "Awareness date not established",
      detail: `Program Director change effective: ${humanDate(eventDate)}. Funder notified: ${humanDate(noticeDate)}. The award measures the ${deadline}-business-day deadline from awareness, and the supplied update does not establish that date.`,
      sources: compactSources([statement.source, requirement.source])
    };
  }
  const startDate = awarenessDate || eventDate;
  const elapsed = businessDaysBetween(startDate, noticeDate);
  const timely = elapsed <= deadline && noticeDate >= startDate;
  return {
    id: "leadership-notification",
    tone: timely ? "success" : "review",
    status: timely ? "Requirement satisfied · Timely" : "Timing needs review",
    title: timely ? "Program Director change reported on time" : "Program Director notification timing",
    value: timely ? `Notified within ${elapsed} business ${elapsed === 1 ? "day" : "days"}` : `${elapsed} business days elapsed`,
    detail: `Program Director change: ${humanDate(eventDate)}. Funder notified: ${humanDate(noticeDate)}. Award requirement: notify within ${deadline} business days.`,
    sources: compactSources([statement.source, requirement.source])
  };
}

function metricTarget(requirements: CompilationResult["requirements"], metric: CountMetricDefinition) {
  for (const requirement of rankedRequirements(requirements, metric.family, metric.requirement)) {
    const relevant = isolateKpiSegment(requirement.requirement, metric.family, metric.requirement);
    const values = [...relevant.replace(/\bP\d+\b/gi, "").matchAll(/\b(\d[\d,]*)\b/g)]
      .map((match) => parseNumber(match[1]))
      .filter((item): item is number => item !== null && item > 0 && item < 100_000);
    const target = semanticMetricTarget(relevant.replace(/\bP[1-6]\b/gi, ""), metric.family) ?? values[0] ?? null;
    if (target !== null) return { target, requirement };
  }
  return null;
}

function semanticMetricTarget(value: string, family: KpiFamily) {
  const patterns: Partial<Record<KpiFamily, RegExp[]>> = {
    p1: [
      /(?:target(?:\s+of)?|serve|serving|navigation services? to)\D{0,30}(\d[\d,]*)\s+(?:unduplicated\s+)?households?/i,
      /(\d[\d,]*)\s+unduplicated\s+households?/i,
      /(?:of|among)\s+(\d[\d,]*)\s+(?:unduplicated\s+)?households?\s+(?:served|receiving)/i
    ],
    p2: [
      /(\d[\d,]*)\s+of\s+\d[\d,]*[^.]{0,80}(?:complete|completing)[^.]{0,40}assessments?/i,
      /(\d[\d,]*)\s+(?:households?\s+)?(?:complete|completing)[^.]{0,40}assessments?/i,
      /(?:complete|completing)\D{0,20}(\d[\d,]*)\s+(?:housing(?:-related| stability)?\s+)?assessments?/i,
      /(?:assessment target|target(?:\s+of)?)\D{0,20}(\d[\d,]*)/i
    ],
    p3: [
      /(?:place|placing|placed)\D{0,30}(\d[\d,]*)\s+households?/i,
      /(\d[\d,]*)\s+households?\s+(?:are\s+)?placed/i,
      /(\d[\d,]*)\s+(?:stable[- ]housing\s+|stable\s+)?placements?/i,
      /(?:stable[- ]housing\s+)?placements?\s+for\s+(?:at\s+least\s+)?(\d[\d,]*)\s+households?/i,
      /(?:placement target|target(?:\s+of)?)\D{0,20}(\d[\d,]*)/i
    ],
    p5: [
      /(\d[\d,]*)\s+households?\s+(?:complete|receive)[^.]{0,40}benefits?\s+screenings?/i,
      /(\d[\d,]*)\s+benefits?\s+screenings?/i,
      /(?:screening target|target(?:\s+of)?)\D{0,20}(\d[\d,]*)/i
    ]
  };
  for (const pattern of patterns[family] || []) {
    const parsed = parseNumber(value.match(pattern)?.[1]);
    if (parsed !== null && parsed > 0 && parsed < 100_000) return parsed;
  }
  return null;
}

function rankedRequirements(requirements: CompilationResult["requirements"], family: KpiFamily, pattern: RegExp) {
  return requirements
    .map((requirement) => {
      const explicitFamily = new RegExp(`\\b${family}\\b`, "i").test(requirement.requirement);
      const metricLanguage = pattern.test(requirement.requirement);
      const semanticTarget = semanticMetricTarget(requirement.requirement, family) !== null;
      return { requirement, score: (explicitFamily ? 4 : 0) + (semanticTarget ? 3 : 0) + (metricLanguage ? 2 : 0) };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.requirement);
}

function isolateKpiSegment(value: string, family: KpiFamily, metricPattern: RegExp) {
  const explicit = new RegExp(`\\b${family}\\b`, "i").exec(value);
  if (explicit) {
    const fromFamily = value.slice(explicit.index);
    const nextFamily = /\bP[1-6]\b/i.exec(fromFamily.slice(explicit[0].length));
    return nextFamily ? fromFamily.slice(0, explicit[0].length + nextFamily.index) : fromFamily;
  }
  return value.split(/[;\n]/).find((part) => metricPattern.test(part)) || value;
}

function decimalTarget(value: string) {
  const explicit = value.match(/(?:target|minimum|at least|no less than|≥|>=)\s*(?::|is|of)?\s*(\d+(?:\.\d+)?)/i)?.[1]
    || value.match(/(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*5/i)?.[1];
  const parsed = explicit ? Number(explicit) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function satisfactionTarget(value: string) {
  const p6Index = value.search(/\bp6\b/i);
  if (p6Index >= 0) return decimalTarget(value.slice(p6Index));
  const satisfactionPattern = /client[- ]satisfaction|average satisfaction|satisfaction (?:rating|score|result|target)/i;
  const clause = value.split(/[;\n]/).find((part) => satisfactionPattern.test(part)) || value;
  const index = clause.search(satisfactionPattern);
  const localWindow = index >= 0 ? clause.slice(Math.max(0, index - 80), index + 120) : clause;
  const scaleValues = [...localWindow.matchAll(/(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*5(?:\.0)?/gi)];
  const scaleTarget = scaleValues.length ? Number(scaleValues[scaleValues.length - 1][1]) : Number.NaN;
  if (Number.isFinite(scaleTarget)) return scaleTarget;
  return decimalTarget(localWindow);
}

function programFacts(result: Pick<CompilationResult, "narrative" | "programChecks">) {
  const narrativeFacts = result.narrative
    .filter((item) => item.status === "verified")
    .map((item) => ({ id: item.id, text: item.text, sources: [item.source], direct: item.evidenceType === "source_fact" || /\.(?:xlsx|csv)$/i.test(item.source.sourceName) }));
  const checkedFacts = (result.programChecks || [])
    .filter((item) => item.type === "kpi_result" && item.severity === "info" && item.status === "verified")
    .map((item) => ({ id: item.id, text: `${item.title}. ${item.detail}`, sources: item.sources, direct: item.sources.some((source) => /\.(?:xlsx|csv)$/i.test(source.sourceName)) }));
  return [...narrativeFacts, ...checkedFacts].sort((left, right) => Number(right.direct) - Number(left.direct));
}

function findNumberFact(facts: ReturnType<typeof programFacts>, patterns: RegExp[]) {
  for (const fact of facts) {
    for (const pattern of patterns) {
      const match = fact.text.match(pattern);
      const value = parseNumber(match?.[1]);
      if (value !== null) return { ...fact, value };
    }
  }
  return null;
}

function retentionCounts(value: string) {
  const among = value.match(/Among\s+(\d[\d,]*)[^.]*?,\s*(\d[\d,]*)\s+(?:remained|were)[^.]*/i);
  if (among && /120\s*days|120-day/i.test(value)) return { eligible: parseNumber(among[1]), retained: parseNumber(among[2]) };
  const intervalFirst = value.match(/(?:120\s*days?|120-day)[^.]{0,100}?(\d[\d,]*)\s+of\s+(\d[\d,]*)\s+eligible/i);
  if (intervalFirst) return { retained: parseNumber(intervalFirst[1]), eligible: parseNumber(intervalFirst[2]) };
  const of = value.match(/(\d[\d,]*)\s+of\s+(\d[\d,]*)\s+eligible[^.]*(?:housed|retention)[^.]*(?:120\s*days|120-day)/i);
  return of ? { retained: parseNumber(of[1]), eligible: parseNumber(of[2]) } : null;
}

function hasOpenMetricConflict(checks: CompilationResult["programChecks"], issue: RegExp) {
  return openMetricConflicts(checks, issue).length > 0;
}

function openMetricConflicts(checks: CompilationResult["programChecks"], issue: RegExp) {
  return checks?.filter((item) => item.resolution === "open"
    && item.severity !== "info"
    && (item.type === "data_conflict" || /conflict|inconsistent|does not match/i.test(`${item.title} ${item.detail}`))
    && issue.test(`${item.title} ${item.detail}`)) || [];
}

function metricIssueFamily(value: string) {
  const family = metricIssueFamilies(value)[0];
  return family ? familyLabel(family) : "";
}

function metricIssueFamilies(value: string): KpiFamily[] {
  const families: KpiFamily[] = [];
  if (/\bp1\b|households? served|unduplicated households?/i.test(value)) families.push("p1");
  if (/\bp2\b|housing(?:-related| stability)? assessments?|completed assessments?/i.test(value)) families.push("p2");
  if (/\bp3\b|housing placements?|households? placed/i.test(value)) families.push("p3");
  if (/\bp4\b|120-day|retention/i.test(value)) families.push("p4");
  if (/\bp5\b|benefits? screenings?/i.test(value)) families.push("p5");
  if (/\bp6\b|client satisfaction|survey result/i.test(value)) families.push("p6");
  return [...new Set(families)];
}

function insightFamily(id: string): KpiFamily | "" {
  if (id === "households-served") return "p1";
  if (id === "housing-assessments") return "p2";
  if (id === "housing-placements") return "p3";
  if (id === "housing-retention") return "p4";
  if (id === "benefits-screenings") return "p5";
  if (id === "client-satisfaction" || id === "satisfaction-unconfirmed") return "p6";
  return "";
}

function familyLabel(family: KpiFamily) {
  return ({ p1: "p1-households", p2: "p2-assessments", p3: "p3-placements", p4: "p4-retention", p5: "p5-benefits", p6: "p6-satisfaction" } as const)[family];
}

function percentValue(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

function retentionTarget(value: string) {
  const metricIndex = value.search(/120[- ]day|retention|stably housed/i);
  if (metricIndex >= 0) {
    const candidates = [...value.matchAll(/(\d+(?:\.\d+)?)\s*%/g)]
      .map((match) => ({ value: Number(match[1]), distance: Math.abs((match.index || 0) - metricIndex) }))
      .filter((item) => item.distance <= 80)
      .sort((left, right) => left.distance - right.distance);
    if (candidates.length) return candidates[0].value;
  }
  return percentValue(value);
}

function parseNumber(value?: string) {
  if (!value) return null;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseHumanDate(value: string | undefined, context: string) {
  if (!value) return null;
  const year = value.match(/\d{4}/)?.[0] || context.match(/\b20\d{2}\b/)?.[0];
  const date = new Date(`${value.replace(/,?\s*\d{4}$/, "")}, ${year || new Date().getUTCFullYear()} 00:00:00 UTC`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function businessDaysBetween(start: Date, end: Date) {
  let count = 0;
  const cursor = new Date(start);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function humanDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value);
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function compactSources(values: Array<SourceReference | undefined>) {
  return values.filter((value): value is SourceReference => Boolean(value)).filter((value, index, all) => all.findIndex((item) => item.sourceName === value.sourceName && item.locator === value.locator) === index);
}

function similar(left: string, right: string) {
  const words = (value: string) => new Set(value.toLowerCase().match(/[a-z]{4,}/g) || []);
  const leftWords = words(left);
  const rightWords = words(right);
  return [...leftWords].some((word) => rightWords.has(word));
}
