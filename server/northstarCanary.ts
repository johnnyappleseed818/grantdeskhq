import { createHash, randomUUID } from "node:crypto";
import { buildProgramInsights, buildProgramReadiness } from "../src/lib/programInsights.ts";
import { buildReportAttention } from "../src/lib/reportAttention.ts";
import type { PersistedCompilationResponse } from "../src/types/prototype.ts";
import type { AnalysisDriftEvent, AnalysisPerformance, ReliabilityAssertion, ReliabilityCanaryResult } from "../src/types/reliability.ts";
import { applicationEnvironment, applicationRevision, deploymentRevision } from "./analysisVersions.ts";
import {
  checkReliabilityDependencies,
  saveLastKnownGoodRelease,
  saveReliabilityArtifact,
  saveReliabilityCanaryResult,
  saveReliabilityDriftEvents,
  saveReliabilityIncident
} from "./persistence.ts";
import { buildReliabilityScorecard, canonicalBusinessState, compareAnalysisManifests } from "./reliability.ts";
import { notifyReliabilityResult } from "./reliabilityNotifier.ts";
import { attemptAutomaticRecovery, createReliabilityIncident, diagnoseReliabilityFailure, lastKnownGoodFromCanary } from "./selfHealing.ts";
import { northstarCanaryEvidenceFiles, northstarCanaryRequest, reliabilityFixture } from "./reliabilityFixtures.ts";

interface CanaryIdentity {
  apiKey: string;
  idToken: string;
  email: string;
  password: string;
}

export interface NorthstarCanaryOptions {
  origin: string;
  trigger?: ReliabilityCanaryResult["trigger"];
  firebaseReferer?: string;
  browserApiConsistency?: "pass" | "fail" | "not_evaluated";
}

export async function runNorthstarReliabilityCanary(options: NorthstarCanaryOptions): Promise<ReliabilityCanaryResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const runId = `canary_${startedAt.replace(/[^0-9]/g, "").slice(0, 14)}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const origin = options.origin.replace(/\/$/, "");
  const assertions: ReliabilityAssertion[] = [];
  const reportIds: string[] = [];
  const cleanup = { reportsDeleted: 0, identityDeleted: false, errors: [] as string[] };
  let identity: CanaryIdentity | null = null;
  let canonicalState: ReturnType<typeof canonicalStateForResponse> | null = null;
  let sameReportHashes: string[] = [];
  let crossReportHashes: string[] = [];
  let errorCategory: string | undefined;
  let analysisPerformance: AnalysisPerformance | undefined;
  const driftEvents: AnalysisDriftEvent[] = [];
  try {
    const basic = await fetchWithRetry(`${origin}/healthz`, {}, 3);
    assertions.push(assertion("service-health", "availability", "critical", basic.ok, "The deployed service health endpoint is reachable.", 200, basic.status));
    const dependencies = await checkReliabilityDependencies();
    assertions.push(assertion("dependency-health", "availability", "critical", dependencies.status === "healthy", "Firestore and private source storage are reachable.", "healthy", dependencies.status));

    identity = await createDisposableIdentity(origin, options.firebaseReferer);
    const request = northstarCanaryRequest(randomUUID());
    const core = await api<PersistedCompilationResponse>(origin, "/api/reports/compile", identity.idToken, { method: "POST", body: JSON.stringify(request) });
    reportIds.push(core.reportId);
    assertCoreSources(assertions, core);

    const reconciled = await api<PersistedCompilationResponse>(origin, `/api/reports/${core.reportId}/evidence`, identity.idToken, {
      method: "POST",
      body: JSON.stringify({ files: northstarCanaryEvidenceFiles() })
    });
    analysisPerformance = reconciled.manifest?.performance;
    assertNorthstarState(assertions, reconciled);
    canonicalState = canonicalStateForResponse(reconciled);
    const baselineHash = hash(canonicalState);

    const reloadOne = await api<PersistedCompilationResponse>(origin, `/api/reports/${core.reportId}`, identity.idToken);
    const reanalysisOne = await api<PersistedCompilationResponse>(origin, "/api/reports/compile", identity.idToken, { method: "POST", body: JSON.stringify(request) });
    const reloadTwo = await api<PersistedCompilationResponse>(origin, `/api/reports/${core.reportId}`, identity.idToken);
    const reanalysisTwo = await api<PersistedCompilationResponse>(origin, "/api/reports/compile", identity.idToken, { method: "POST", body: JSON.stringify(request) });
    sameReportHashes = [reconciled, reloadOne, reanalysisOne, reloadTwo, reanalysisTwo].map((item) => hash(canonicalStateForResponse(item)));
    assertions.push(assertion("same-report-idempotency", "determinism", "critical", sameReportHashes.every((item) => item === baselineHash), "Analyze, reload, reanalyze, reload, and reanalyze preserve identical canonical state.", baselineHash, sameReportHashes));
    if (reconciled.manifest) for (const response of [reloadOne, reanalysisOne, reloadTwo, reanalysisTwo]) {
      if (response.manifest) driftEvents.push(...compareAnalysisManifests(reconciled.manifest, response.manifest).events);
    }

    const requestB = northstarCanaryRequest(randomUUID());
    const coreB = await api<PersistedCompilationResponse>(origin, "/api/reports/compile", identity.idToken, { method: "POST", body: JSON.stringify(requestB) });
    reportIds.push(coreB.reportId);
    const reconciledB = await api<PersistedCompilationResponse>(origin, `/api/reports/${coreB.reportId}/evidence`, identity.idToken, { method: "POST", body: JSON.stringify({ files: northstarCanaryEvidenceFiles() }) });
    const reportBHash = hash(canonicalStateForResponse(reconciledB));
    crossReportHashes = [baselineHash, reportBHash];
    assertions.push(assertion("cross-report-determinism", "determinism", "critical", reportBHash === baselineHash, "Independent reports created from identical files have identical canonical business state.", baselineHash, reportBHash));
    if (reconciled.manifest && reconciledB.manifest) driftEvents.push(...compareAnalysisManifests(reconciled.manifest, reconciledB.manifest).events);
  } catch (error) {
    errorCategory = classifyError(error);
    assertions.push(assertion("canary-execution", "availability", "critical", false, "The synthetic canary did not complete its full customer workflow.", "completed", errorCategory));
  } finally {
    if (identity) await cleanupIdentity(options.origin.replace(/\/$/, ""), identity, reportIds, cleanup, options.firebaseReferer);
  }

  const scorecard = buildReliabilityScorecard(assertions, {
    sameReportDeterminism: assertionPassed(assertions, "same-report-idempotency") ? "pass" : "fail",
    crossReportDeterminism: assertionPassed(assertions, "cross-report-determinism") ? "pass" : "fail",
    browserApiConsistency: options.browserApiConsistency || "not_evaluated"
  });
  const failingAssertionIds = assertions.filter((item) => item.status === "failed").map((item) => item.id);
  const result: ReliabilityCanaryResult = {
    runId,
    fixtureId: "northstar-interim1-v1",
    trigger: options.trigger || "manual",
    environment: applicationEnvironment(),
    status: canaryHealthStatus(errorCategory, scorecard.status),
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    applicationRevision: applicationRevision(),
    deploymentRevision: deploymentRevision(),
    reportIds,
    assertions,
    scorecard: { ...scorecard, ...(errorCategory ? { status: "unknown" as const } : {}) },
    sameReportHashes,
    crossReportHashes,
    canonicalBusinessStateHash: canonicalState ? hash(canonicalState) : undefined,
    ...(analysisPerformance ? { analysisPerformance } : {}),
    failingAssertionIds,
    cleanup,
    artifacts: [],
    ...(errorCategory ? { errorCategory } : {})
  };

  await persistCanaryDiagnostics(result, canonicalState);
  await saveReliabilityDriftEvents(driftEvents);
  await saveReliabilityCanaryResult(result);
  const lastKnownGood = lastKnownGoodFromCanary(result);
  if (lastKnownGood) await saveLastKnownGoodRelease(lastKnownGood);
  if (result.status !== "healthy") {
    const diagnosis = diagnoseReliabilityFailure({ assertions, manifest: undefined, dependencyHealth: await checkReliabilityDependencies(), reportIds, error: errorCategory });
    let incident = createReliabilityIncident(diagnosis, reportIds);
    if (diagnosis.automaticRecoveryAllowed && diagnosis.recommendedRecoveryAction === "bounded_retry") {
      incident = await attemptAutomaticRecovery(incident, {
        boundedRetry: async () => { await fetchWithRetry(`${origin}/healthz`, {}, 3); },
        verify: async () => {
          const response = await fetch(`${origin}/healthz`);
          return { passed: response.ok, detail: response.ok ? "Service health recovered after bounded retry." : `Service health remained unavailable (${response.status}).` };
        }
      });
    }
    await saveReliabilityIncident(incident);
  }
  await notifyReliabilityResult(result).catch((error) => console.error(JSON.stringify({ event: "reliability_alert_delivery_error", runId, error: error instanceof Error ? error.message : "unknown" })));
  return result;
}

export function canaryHealthStatus(errorCategory: string | undefined, scorecardStatus: ReliabilityCanaryResult["status"]) {
  return errorCategory ? "unknown" as const : scorecardStatus;
}

function assertCoreSources(assertions: ReliabilityAssertion[], response: PersistedCompilationResponse) {
  const roles = response.sources.map((source) => source.role);
  for (const role of ["awardAgreement", "ledgerExport", "programUpdate"] as const) assertions.push(assertion(`source-${role}`, "availability", "critical", roles.includes(role), `${role} remains bound to the report.`));
  assertions.push(assertion("approved-budget-derived", "availability", "critical", response.result.inputStatus.find((item) => item.role === "approvedBudget")?.available === true, "Approved budget is derived from the award agreement."));
}

function canonicalStateForResponse(response: PersistedCompilationResponse) {
  return canonicalBusinessState(response.result, response.manifest?.sourceFiles || []);
}

function assertNorthstarState(assertions: ReliabilityAssertion[], response: PersistedCompilationResponse) {
  const result = response.result;
  const golden = reliabilityFixture().expected;
  const expectedEvidence = golden.sources.supportingEvidence as { total: number; matched: number; irrelevant: number };
  assertions.push(assertion("evidence-count", "evidence", "critical", result.evidenceFiles?.length === expectedEvidence.total && response.sources.filter((source) => source.role === "supportingEvidence").length === expectedEvidence.total, "All supporting evidence files persist separately.", expectedEvidence.total, result.evidenceFiles?.length || 0));
  assertions.push(assertion("evidence-relevance", "evidence", "critical", result.evidenceFiles?.filter((file) => file.relevance === "matched").length === expectedEvidence.matched, "Expected relevant evidence files are matched.", expectedEvidence.matched, result.evidenceFiles?.filter((file) => file.relevance === "matched").length || 0));
  const board = result.evidenceFiles?.find((file) => file.name === "09_Irrelevant_Board_Meeting_Notes.pdf");
  assertions.push(assertion("board-notes-irrelevant", "evidence", "critical", board?.relevance === "irrelevant" && board.matches.length === 0, "Board Notes remains irrelevant and satisfies nothing.", "irrelevant with zero matches", board ? `${board.relevance} with ${board.matches.length} matches` : "missing"));

  const unresolved = result.mappings.filter((item) => item.reportTreatment === "needs_category_review").map((item) => item.transactionId);
  assertions.push(assertion("only-ambiguous-unmapped", "financial", "critical", JSON.stringify(unresolved) === JSON.stringify([golden.financial.onlyUnmappedTransaction]), `Only ${golden.financial.onlyUnmappedTransaction} remains unmapped.`, [golden.financial.onlyUnmappedTransaction], unresolved));
  const duplicate = result.mappings.filter((item) => item.transactionId === "BW-LGL-003");
  assertions.push(assertion("duplicate-exclusion", "financial", "critical", duplicate.filter((item) => item.reportTreatment === "included").length === 1 && duplicate.filter((item) => item.reportTreatment === "excluded_duplicate").length === 1, "The original duplicate row remains included and exactly one duplicate is excluded."));
  assertions.push(assertion("date-exclusions", "financial", "critical", result.mappings.find((item) => item.transactionId === "BW-OOP-001")?.reportTreatment === "excluded_outside_period" && result.mappings.find((item) => item.transactionId === "BW-OOG-001")?.reportTreatment === "excluded_grant_period", "Outside-report and pre-grant rows are deterministically excluded."));
  const mappedTotal = Object.values(golden.financial.categoryActuals).reduce((sum, value) => sum + value, 0);
  assertions.push(assertion("mapped-total", "financial", "critical", result.financialAnalysis?.mappedActualTotal === mappedTotal, "Mapped current-period spend remains at the versioned golden total.", mappedTotal, result.financialAnalysis?.mappedActualTotal));
  const technology = result.financialAnalysis?.budgetVariances.find((item) => item.category === "Technology & Data Systems");
  const technologyGolden = golden.financial.technologyVariance;
  assertions.push(assertion("technology-variance", "financial", "critical", Boolean(technology && technology.actualAmount === technologyGolden.actual && technology.approvedAmount === technologyGolden.approved && technology.varianceAmount === technologyGolden.amount && technology.variancePercent === technologyGolden.percent && technology.explanationRequired === technologyGolden.explanationRequired), "Technology actual and variance remain at the versioned golden values.", technologyGolden, technology));
  const indirect = result.financialAnalysis?.controls.find((item) => item.id === "indirect-cost-limit");
  const indirectGolden = golden.financial.indirect;
  const format = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const indirectTokens = [`${format(indirectGolden.directCostBase)} eligible direct costs`, format(indirectGolden.currentLimit), `${indirectGolden.percent}%`, `${format(indirectGolden.charged)} charged`, `${format(indirectGolden.remainingCapacity)} remaining capacity`];
  assertions.push(assertion("indirect-cost", "financial", "critical", Boolean(indirect?.status === indirectGolden.status && indirectTokens.every((token) => indirect.detail.includes(token)) && !/15%/.test(indirect.detail)), "Indirect costs remain at the versioned golden values and contractual rate.", indirectGolden, indirect?.detail));

  const insights = buildProgramInsights(result);
  const expectedInsights: Array<[string, string]> = [["households-served", "172 of 300"], ["housing-assessments", "158 of 270"], ["housing-placements", "98 of 180"], ["housing-retention", "81.6% · target 80%"], ["benefits-screenings", "139 of 240"], ["client-satisfaction", "4.4 of 5 · target 4.3"]];
  for (const [id, value] of expectedInsights) assertions.push(assertion(`kpi-${id}`, "kpi", "critical", insights.find((item) => item.id === id)?.value === value, `${id} matches its canonical actual and target.`, value, insights.find((item) => item.id === id)?.value));
  const p2 = result.programChecks?.find((item) => item.type === "data_conflict" && /\bp2\b|assessment/i.test(item.title));
  assertions.push(assertion("p2-conflict", "kpi", "critical", p2?.evidenceBackedValue === "158" && /160/.test(`${p2.detail} ${p2.action}`) && p2.resolution === "open", "P2 remains an evidence-backed 158 versus narrative 160 conflict."));
  assertions.push(assertion("kpi-readiness", "kpi", "critical", JSON.stringify(buildProgramReadiness(result)) === JSON.stringify({ ready: 5, conflicts: 1, awaitingConfirmation: 0 }), "KPI readiness remains 5 ready, 1 conflict, 0 awaiting.", { ready: 5, conflicts: 1, awaitingConfirmation: 0 }, buildProgramReadiness(result)));

  const approvals = result.financialAnalysis?.controls.find((item) => item.id === "assistance-approvals");
  assertions.push(assertion("assistance-approvals", "evidence", "critical", Boolean(approvals?.status === "review" && approvals.transactionIds.length === 1 && approvals.transactionIds[0] === "BW-EA-011" && !/BW-EA-003|BW-EA-006/.test(approvals.detail)), "EA003 and EA006 are satisfied; EA011 remains unresolved.", ["BW-EA-011"], approvals?.transactionIds));
  const actions = buildReportAttention(result);
  assertions.push(assertion("grouped-actions", "workflow", "critical", actions.length === golden.actions.deduplicatedRootDecisions.length, "The canonical customer workload contains the expected grouped actions.", golden.actions.deduplicatedRootDecisions.length, actions.length));
  assertions.push(assertion("generated-evidence-index", "workflow", "critical", !actions.some((item) => /evidence index/i.test(`${item.title} ${item.detail}`)), "GrantDeskHQ generates the KPI evidence index instead of creating a manual customer action."));
  for (const item of result.integrity?.assertions || []) assertions.push({ ...item, id: `runtime-${item.id}` });
}

async function createDisposableIdentity(origin: string, referer?: string): Promise<CanaryIdentity> {
  const config = await (await fetchWithRetry(`${origin}/api/config`, {}, 3)).json() as { apiKey?: string };
  if (!config.apiKey) throw new Error("Canary identity configuration is unavailable.");
  const email = `grantdesk-canary-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `Gdhq-${randomUUID()}!9`;
  const response = await fetchWithRetry(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`, {
    method: "POST",
    headers: firebaseHeaders(referer),
    body: JSON.stringify({ email, password, returnSecureToken: true })
  }, 3);
  const body = await response.json() as { idToken?: string; error?: { message?: string } };
  if (!response.ok || !body.idToken) throw new Error(`Canary identity creation failed: ${body.error?.message || response.status}`);
  return { apiKey: config.apiKey, idToken: body.idToken, email, password };
}

async function cleanupIdentity(origin: string, identity: CanaryIdentity, reportIds: string[], cleanup: ReliabilityCanaryResult["cleanup"], referer?: string) {
  for (const reportId of reportIds) {
    try {
      const response = await fetch(`${origin}/api/reports/${encodeURIComponent(reportId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${identity.idToken}` } });
      if (!response.ok && response.status !== 404) throw new Error(`report cleanup returned ${response.status}`);
      cleanup.reportsDeleted += 1;
    } catch (error) { cleanup.errors.push(error instanceof Error ? error.message : "report cleanup failed"); }
  }
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(identity.apiKey)}`, { method: "POST", headers: firebaseHeaders(referer), body: JSON.stringify({ idToken: identity.idToken }) });
    if (!response.ok) throw new Error(`identity cleanup returned ${response.status}`);
    cleanup.identityDeleted = true;
  } catch (error) { cleanup.errors.push(error instanceof Error ? error.message : "identity cleanup failed"); }
}

async function persistCanaryDiagnostics(result: ReliabilityCanaryResult, state: unknown) {
  const artifacts = [
    ["canary-result", result],
    ["canonical-state", state || { unavailable: true }],
    ["failing-invariants", result.assertions.filter((item) => item.status === "failed")],
    ["expected-actual-diff", result.assertions.filter((item) => item.expected !== undefined || item.actual !== undefined)]
  ] as const;
  for (const [kind, value] of artifacts) {
    try {
      const objectName = await saveReliabilityArtifact(result.runId, kind, value);
      result.artifacts.push({ kind: kind === "canonical-state" ? "canonical_state" : kind === "failing-invariants" ? "invariants" : kind === "expected-actual-diff" ? "expected_actual_diff" : "manifest", objectName });
    } catch (error) {
      result.cleanup.errors.push(`artifact ${kind}: ${error instanceof Error ? error.message : "save failed"}`);
    }
  }
}

async function api<T>(origin: string, pathname: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithRetry(`${origin}${pathname}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers } }, 3);
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method || "GET"} ${pathname} returned ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts: number) {
  let response: Response | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(600_000) });
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === maxAttempts) return response;
      response.body?.cancel().catch(() => undefined);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(500 * (2 ** (attempt - 1)), 4_000)));
  }
  if (response) return response;
  throw lastError || new Error("Network request failed.");
}

function assertion(id: string, area: ReliabilityAssertion["area"], severity: ReliabilityAssertion["severity"], passed: boolean, detail: string, expected?: unknown, actual?: unknown): ReliabilityAssertion {
  return { id, area, severity, status: passed ? "passed" : "failed", detail, ...(expected !== undefined ? { expected } : {}), ...(actual !== undefined ? { actual } : {}) };
}
function assertionPassed(assertions: ReliabilityAssertion[], id: string) { return assertions.find((item) => item.id === id)?.status === "passed"; }
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function firebaseHeaders(referer?: string) { return { "Content-Type": "application/json", Referer: `${(referer || "https://grantdeskhq.com").replace(/\/$/, "")}/` }; }
function classifyError(error: unknown) {
  if (!(error instanceof Error)) return "unknown_error";
  if (/timeout|aborted/i.test(`${error.name} ${error.message}`)) return "timeout";
  if (/identity|401|403|auth/i.test(error.message)) return "identity_or_auth";
  if (/429|quota|rate/i.test(error.message)) return "provider_rate_limit";
  if (/5\d\d|network|fetch/i.test(error.message)) return "dependency_or_network";
  return error.name || "canary_error";
}
