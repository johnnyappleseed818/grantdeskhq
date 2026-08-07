import { parseLedger } from "./accuracy.ts";
import type { CompilationRequest, CompilationResult } from "../src/types/prototype.ts";

export interface AccuracyCategory {
  name: string;
  weight: number;
  passed: number;
  total: number;
  score: number;
  failures: string[];
}

export interface AccuracyEvaluation {
  score: number;
  threshold: number;
  passed: boolean;
  categories: AccuracyCategory[];
  criticalFailures: string[];
}

const ACCURACY_THRESHOLD = 95;

export function evaluateCompilationAccuracy(request: CompilationRequest, result: CompilationResult): AccuracyEvaluation {
  const categories = [
    ledgerAccuracy(request, result),
    requirementAccuracy(result),
    missingInputAccuracy(result),
    narrativeAccuracy(request, result),
    evidenceAccuracy(request, result)
  ];
  const criticalFailures = criticalAccuracyFailures(request, result);
  const score = round(categories.reduce((sum, category) => sum + category.score, 0));
  return { score, threshold: ACCURACY_THRESHOLD, passed: score > ACCURACY_THRESHOLD && criticalFailures.length === 0, categories, criticalFailures };
}

function ledgerAccuracy(request: CompilationRequest, result: CompilationResult) {
  const expected = parseLedger(request);
  const actualById = new Map(result.mappings.map((mapping) => [mapping.transactionId, mapping]));
  const checks = expected.map((row) => ({
    label: `${row.id} matches the uploaded ledger`,
    pass: Boolean(actualById.get(row.id)) && Math.abs((actualById.get(row.id)?.amount || 0) - row.amount) < 0.005 && actualById.get(row.id)?.date === row.date && actualById.get(row.id)?.description === row.description
  }));
  checks.push({ label: "No ledger transaction was added or omitted", pass: expected.length > 0 && expected.length === result.mappings.length && actualById.size === expected.length });
  return category("Transaction fidelity", 30, checks);
}

function requirementAccuracy(result: CompilationResult) {
  const corpus = normalize(result.requirements.map((item) => `${item.requirement} ${item.source.excerpt}`).join(" "));
  const checks = [
    signal("Total award is $150,000", corpus, /150[ ,]?000/),
    signal("Personnel budget is $90,000", corpus, /personnel.{0,80}90[ ,]?000|90[ ,]?000.{0,80}personnel/),
    signal("Program Supplies budget is $35,000", corpus, /program supplies.{0,80}35[ ,]?000|35[ ,]?000.{0,80}program supplies/),
    signal("Local Travel budget is $15,000", corpus, /local travel.{0,80}15[ ,]?000|15[ ,]?000.{0,80}local travel/),
    signal("Indirect Overhead budget is $10,000", corpus, /indirect overhead.{0,80}10[ ,]?000|10[ ,]?000.{0,80}indirect overhead/),
    signal("Travel over $1,000 requires an itemized receipt", corpus, /travel.{0,160}(1[ ,]?000).{0,160}(itemized )?receipt|(itemized )?receipt.{0,160}travel.{0,160}1[ ,]?000/),
    signal("Travel over $1,000 requires written justification", corpus, /travel.{0,200}(1[ ,]?000).{0,200}(written )?justification|(written )?justification.{0,200}travel.{0,200}1[ ,]?000/),
    signal("Variance threshold is 10% of elapsed-period plan", corpus, /10\s*%.{0,180}(elapsed|spending plan)|(elapsed|spending plan).{0,180}10\s*%/),
    signal("Narrative limit is 200 words", corpus, /200.{0,80}word|word.{0,80}200/),
    signal("Youth-served count is required", corpus, /youth.{0,80}serv/),
    signal("Signed certification is required", corpus, /signed.{0,80}certification|certification.{0,80}signed/)
  ];
  return category("Funder-rule recall", 25, checks);
}

function missingInputAccuracy(result: CompilationResult) {
  const corpus = normalize(result.missingInputs.map((item) => `${item.question} ${item.reason}`).join(" "));
  const checks = [
    signal("Missing receipt for TRV-003 is requested", corpus, /trv-003.{0,140}receipt|receipt.{0,140}trv-003/),
    signal("Unsigned certification is requested", corpus, /sign(ed|ature)?.{0,100}certification|certification.{0,100}sign(ed|ature)?/),
    signal("UNM-001 mapping decision is requested", corpus, /unm-001.{0,160}(map|categor|grant)|(map|categor|grant).{0,160}unm-001/)
  ];
  return category("Missing-information detection", 15, checks);
}

function narrativeAccuracy(request: CompilationRequest, result: CompilationResult) {
  const sourceNames = new Set(request.files.map((file) => file.name));
  const corpus = normalize(result.narrative.map((item) => item.text).join(" "));
  const youthStatements = result.narrative.filter((item) => /youth.{0,40}serv|serv.{0,40}youth/i.test(item.text));
  const checks = [
    { label: "No unsupported hotel-cost explanation", pass: !/hotel/.test(corpus) },
    { label: "The youth-served result is not reported as 120", pass: !/serv(ed|ing)?\s+120\s+youth|120\s+youth.{0,30}serv/.test(corpus) },
    { label: "The confirmed result of 118 youth is used", pass: youthStatements.some((item) => /118/.test(item.text)) },
    { label: "No stale result of 150 youth is used", pass: !/serv(ed|ing)?\s+150\s+youth|150\s+youth.{0,30}serv/.test(corpus) },
    { label: "Every narrative statement has an uploaded source", pass: result.narrative.length > 0 && result.narrative.every((item) => sourceNames.has(item.source.sourceName) && Boolean(item.source.locator.trim()) && Boolean(item.source.excerpt.trim())) },
    { label: "Every narrative statement is non-empty", pass: result.narrative.every((item) => Boolean(item.text.trim())) }
  ];
  return category("Narrative factuality", 15, checks);
}

function evidenceAccuracy(request: CompilationRequest, result: CompilationResult) {
  const sourceNames = new Set(request.files.map((file) => file.name));
  const expectedIds = [
    ...result.requirements.map((item) => `requirement:${item.id}`),
    ...result.mappings.map((item) => `mapping:${item.transactionId}`),
    ...result.narrative.map((item) => `narrative:${item.id}`)
  ];
  const counts = new Map<string, number>();
  for (const finding of result.validation.findings) if (expectedIds.includes(finding.itemId)) counts.set(finding.itemId, (counts.get(finding.itemId) || 0) + 1);
  const checks = [
    { label: "Verifier returned exactly one finding per material item", pass: new Set(expectedIds).size === expectedIds.length && expectedIds.every((id) => counts.get(id) === 1) },
    { label: "Verifier returned no unknown material IDs", pass: result.validation.findings.filter((finding) => /^(requirement|mapping|narrative):/.test(finding.itemId)).every((finding) => expectedIds.includes(finding.itemId)) },
    { label: "Requirement citations are complete", pass: result.requirements.length > 0 && result.requirements.every((item) => sourceNames.has(item.source.sourceName) && Boolean(item.source.locator.trim()) && Boolean(item.source.excerpt.trim())) },
    { label: "Deterministic ledger gate passed", pass: result.qualityChecks.find((check) => check.id === "deterministic-ledger")?.status === "passed" },
    { label: "Deterministic current-period fact gate passed", pass: result.qualityChecks.find((check) => check.id === "deterministic-workflow-facts")?.status === "passed" }
  ];
  return category("Evidence and verification", 15, checks);
}

function criticalAccuracyFailures(request: CompilationRequest, result: CompilationResult) {
  const expectedRows = parseLedger(request);
  const expectedIds = new Set(expectedRows.map((row) => row.id));
  const failures: string[] = [];
  if (!expectedRows.length) failures.push("The evaluation ledger could not be parsed.");
  if (result.mappings.some((mapping) => !expectedIds.has(mapping.transactionId))) failures.push("The workflow invented a transaction ID.");
  if (expectedRows.some((row) => !result.mappings.some((mapping) => mapping.transactionId === row.id))) failures.push("The workflow omitted an uploaded transaction.");
  if (result.mappings.some((mapping) => {
    const expected = expectedRows.find((row) => row.id === mapping.transactionId);
    return expected && Math.abs(expected.amount - mapping.amount) >= 0.005;
  })) failures.push("A reported transaction amount differs from the uploaded ledger.");
  const narrative = normalize(result.narrative.map((item) => item.text).join(" "));
  if (/hotel/.test(narrative)) failures.push("The workflow introduced an unsupported hotel-cost explanation.");
  if (/serv(ed|ing)?\s+(120|150)\s+youth|(120|150)\s+youth.{0,30}serv/.test(narrative)) failures.push("The workflow reported an incorrect youth-served result.");
  if (result.qualityChecks.find((check) => check.id === "deterministic-ledger")?.status !== "passed") failures.push("The deterministic ledger gate did not pass.");
  if (result.qualityChecks.find((check) => check.id === "deterministic-workflow-facts")?.status !== "passed") failures.push("The deterministic current-period fact gate did not pass.");
  if (result.validation.findings.some((finding) => /verification-completeness/i.test(finding.id))) failures.push("The verifier omitted, duplicated, or invented a candidate finding.");
  return [...new Set(failures)];
}

function signal(label: string, corpus: string, pattern: RegExp) { return { label, pass: pattern.test(corpus) }; }

function category(name: string, weight: number, checks: Array<{ label: string; pass: boolean }>): AccuracyCategory {
  const passed = checks.filter((check) => check.pass).length;
  const total = checks.length;
  return { name, weight, passed, total, score: round(total ? (passed / total) * weight : 0), failures: checks.filter((check) => !check.pass).map((check) => check.label) };
}

function normalize(value: string) { return value.toLowerCase().replaceAll("$", "").replace(/\s+/g, " "); }
function round(value: number) { return Math.round(value * 100) / 100; }
