// @vitest-environment node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildProgramInsights, buildProgramReadiness } from "../lib/programInsights";
import { buildReportAttention } from "../lib/reportAttention";
import type { CompilationResult } from "../types/prototype";
import {
  NORTHSTAR_EVIDENCE_FILES,
  RegressionApiResponse,
  normalizedBusinessState,
  northstarEvidenceFiles,
  northstarRequest,
  splitStructuredSnapshots
} from "./northstarRegression";

const enabled = process.env.RUN_GRANTDESK_LIVE === "1";
const appOrigin = (process.env.GRANTDESK_E2E_ORIGIN || "https://grantdeskhq.com").replace(/\/$/, "");
const firebaseReferer = `${(process.env.GRANTDESK_FIREBASE_REFERER || "https://grantdeskhq.com").replace(/\/$/, "")}/`;
const artifacts = path.resolve("test-results/grantdesk-regression/live-api");

interface TestIdentity {
  idToken: string;
  localId: string;
  email: string;
  password: string;
  apiKey: string;
}

let identity: TestIdentity | null = null;
let reportId = "";
const reportIds: string[] = [];
const deletedReportIds = new Set<string>();

describe.skipIf(!enabled)("Northstar live API end-to-end regression", () => {
  it("creates, persists, reconciles, reloads, re-analyzes, and cleans up one report", async () => {
    fs.mkdirSync(artifacts, { recursive: true });
    identity = await createDisposableIdentity();
    const requestId = crypto.randomUUID();
    const request = northstarRequest(requestId);

    const core = await api<RegressionApiResponse>("/api/reports/compile", identity.idToken, {
      method: "POST",
      body: JSON.stringify(request)
    });
    reportId = core.reportId;
    reportIds.push(core.reportId);
    expect(core.result.inputStatus.find((item) => item.role === "awardAgreement")?.available).toBe(true);
    expect(core.result.inputStatus.find((item) => item.role === "ledgerExport")?.available).toBe(true);
    expect(core.result.inputStatus.find((item) => item.role === "programUpdate")?.available).toBe(true);

    const evidence = northstarEvidenceFiles();
    const reconciled = await api<RegressionApiResponse>(`/api/reports/${reportId}/evidence`, identity.idToken, {
      method: "POST",
      body: JSON.stringify({ files: evidence })
    });
    writeSnapshots("after-evidence", reconciled);
    assertGoldenFinalState(reconciled);

    const reloadOne = await api<RegressionApiResponse>(`/api/reports/${reportId}`, identity.idToken);
    const reanalyzeOne = await api<RegressionApiResponse>("/api/reports/compile", identity.idToken, {
      method: "POST",
      body: JSON.stringify(request)
    });
    const reloadTwo = await api<RegressionApiResponse>(`/api/reports/${reportId}`, identity.idToken);
    const reanalyzeTwo = await api<RegressionApiResponse>("/api/reports/compile", identity.idToken, {
      method: "POST",
      body: JSON.stringify(request)
    });

    const baseline = normalizedBusinessState(reconciled);
    expect(normalizedBusinessState(reloadOne)).toEqual(baseline);
    expect(normalizedBusinessState(reanalyzeOne)).toEqual(baseline);
    expect(normalizedBusinessState(reloadTwo)).toEqual(baseline);
    expect(normalizedBusinessState(reanalyzeTwo)).toEqual(baseline);
    expect(reloadOne.reportId).toBe(reportId);
    expect(reanalyzeOne.reportId).toBe(reportId);
    expect(reanalyzeTwo.reportId).toBe(reportId);

    const wrongRole = { ...northstarEvidenceFiles()[0], role: "ledgerExport" as const };
    const wrongRoleResponse = await rawApi(`/api/reports/${reportId}/evidence`, identity.idToken, {
      method: "POST",
      body: JSON.stringify({ files: [wrongRole] })
    });
    expect(wrongRoleResponse.status).toBe(400);
    const afterWrongRole = await api<RegressionApiResponse>(`/api/reports/${reportId}`, identity.idToken);
    expect(normalizedBusinessState(afterWrongRole)).toEqual(baseline);

    const requestB = northstarRequest(crypto.randomUUID());
    const coreB = await api<RegressionApiResponse>("/api/reports/compile", identity.idToken, {
      method: "POST",
      body: JSON.stringify(requestB)
    });
    reportIds.push(coreB.reportId);
    expect(coreB.reportId).not.toBe(reportId);
    const reconciledB = await api<RegressionApiResponse>(`/api/reports/${coreB.reportId}/evidence`, identity.idToken, {
      method: "POST",
      body: JSON.stringify({ files: northstarEvidenceFiles() })
    });
    assertGoldenFinalState(reconciledB);
    const stateB = normalizedBusinessState(reconciledB);
    writeSnapshots("independent-report-b", reconciledB);
    writeCrossReportComparison(baseline, stateB);
    expect(stateB).toEqual(baseline);

    for (const id of reportIds) {
      const deleteResponse = await rawApi(`/api/reports/${id}`, identity.idToken, { method: "DELETE" });
      expect(deleteResponse.status, `authenticated cleanup for ${id}`).toBe(200);
      if (deleteResponse.ok) deletedReportIds.add(id);
      const afterDelete = await rawApi(`/api/reports/${id}`, identity.idToken);
      expect(afterDelete.status).toBe(404);
    }
  }, 900_000);
});

afterAll(async () => {
  if (!identity) return;
  fs.mkdirSync(artifacts, { recursive: true });
  for (const id of reportIds.filter((item) => !deletedReportIds.has(item))) {
    const response = await rawApi(`/api/reports/${id}`, identity.idToken, { method: "DELETE" });
    if (response.ok) deletedReportIds.add(id);
  }
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(identity.apiKey)}`, {
    method: "POST",
    headers: firebaseHeaders(),
    body: JSON.stringify({ idToken: identity.idToken })
  });
  fs.writeFileSync(path.join(artifacts, "cleanup.json"), `${JSON.stringify({ reportIds, deletedReportIds: [...deletedReportIds], identityDeleted: true }, null, 2)}\n`);
});

function assertGoldenFinalState(response: RegressionApiResponse) {
  const result = response.result;
  const persistedSources = response.sources || [];
  expect.soft(persistedSources, "GET/compile responses expose sanitized persisted source records").toHaveLength(12);
  expect.soft(persistedSources.filter((source) => source.role === "supportingEvidence")).toHaveLength(9);
  expect.soft(persistedSources.filter((source) => source.role === "awardAgreement")).toHaveLength(1);
  expect.soft(persistedSources.filter((source) => source.role === "ledgerExport")).toHaveLength(1);
  expect.soft(persistedSources.filter((source) => source.role === "programUpdate")).toHaveLength(1);
  expect.soft(persistedSources.some((source) => source.role === "approvedBudget")).toBe(false);
  expect.soft(persistedSources.some((source) => source.role === "funderTemplate")).toBe(false);

  for (const role of ["awardAgreement", "approvedBudget", "ledgerExport", "programUpdate", "supportingEvidence"] as const) {
    expect.soft(result.inputStatus.find((input) => input.role === role)?.available, `${role} is available`).toBe(true);
  }
  expect.soft(result.inputStatus.find((input) => input.role === "funderTemplate")).toMatchObject({ available: false, requiredForCompletion: false });
  const falseMissingMessages = buildReportAttention(result).map((item) => `${item.title} ${item.detail}`).join(" ");
  expect.soft(falseMissingMessages).not.toMatch(/add award document|add accounting data|add program results|add supporting evidence/i);

  expect.soft(result.evidenceFiles).toHaveLength(9);
  expect.soft(result.evidenceFiles?.map((file) => file.name).sort()).toEqual([...NORTHSTAR_EVIDENCE_FILES].sort());
  expect.soft(result.evidenceFiles?.filter((file) => file.relevance === "irrelevant").map((file) => file.name)).toEqual(["09_Irrelevant_Board_Meeting_Notes.pdf"]);
  expect.soft(result.evidenceFiles?.filter((file) => file.relevance === "matched")).toHaveLength(8);
  expect.soft(result.evidenceFiles?.find((file) => file.name === "09_Irrelevant_Board_Meeting_Notes.pdf")?.matches).toEqual([]);
  assertEvidenceMatch(result, "01_Enrollment_Records_Interim1.xlsx", /\bp1\b|households? served|enrollment/i);
  assertEvidenceMatch(result, "02_Assessment_Records_Interim1.xlsx", /\bp2\b|assessment/i);
  assertEvidenceMatch(result, "03_Housing_Placement_and_120_Day_Followup_Interim1.xlsx", /\bp3\b|placement/i);
  assertEvidenceMatch(result, "03_Housing_Placement_and_120_Day_Followup_Interim1.xlsx", /\bp4\b|120-day|follow-up|retention/i);
  assertEvidenceMatch(result, "04_Benefits_Screening_Records_Interim1.xlsx", /\bp5\b|benefits/i);
  assertEvidenceMatch(result, "05_Client_Satisfaction_Survey_Interim1.xlsx", /\bp6\b|satisfaction/i);
  assertEvidenceMatch(result, "06_Emergency_Assistance_Support_Interim1.xlsx", /assistance|payment|housing-purpose/i);
  assertEvidenceMatch(result, "07_PD_Approval_BW-EA-003.pdf", /BW-EA-003|approval/i);
  assertEvidenceMatch(result, "08_PD_Approval_BW-EA-006.pdf", /BW-EA-006|approval/i);

  assertFinancialGroundTruth(result);
  assertKpiGroundTruth(result);
  assertWorkflowGroundTruth(result);
}

function assertFinancialGroundTruth(result: CompilationResult) {
  const expectedMappings: Array<[RegExp, string]> = [
    [/^BW-PAY-/, "Personnel"], [/^BW-FR-/, "Fringe Benefits"], [/^BW-EA-/, "Emergency Client Assistance"],
    [/^BW-LGL-/, "Legal & Benefits Navigation"], [/^BW-TECH-/, "Technology & Data Systems"], [/^BW-TRV-/, "Local Travel"],
    [/^BW-EVAL-/, "Evaluation"], [/^BW-IND-/, "Indirect Costs"]
  ];
  for (const [pattern, category] of expectedMappings) {
    const matching = result.mappings.filter((mapping) => pattern.test(mapping.transactionId));
    expect.soft(matching.length, `${pattern} mappings exist`).toBeGreaterThan(0);
    expect.soft(matching.every((mapping) => mapping.suggestedCategory === category), `${pattern} -> ${category}`).toBe(true);
  }
  expect.soft(result.mappings.filter((mapping) => mapping.reportTreatment === "needs_category_review").map((mapping) => mapping.transactionId)).toEqual(["BW-AMB-001"]);
  const duplicate = result.mappings.filter((mapping) => mapping.transactionId === "BW-LGL-003");
  expect.soft(duplicate.filter((mapping) => mapping.reportTreatment === "included")).toHaveLength(1);
  expect.soft(duplicate.filter((mapping) => mapping.reportTreatment === "excluded_duplicate")).toHaveLength(1);
  expect.soft(result.mappings.find((mapping) => mapping.transactionId === "BW-OOP-001")?.reportTreatment).toBe("excluded_outside_period");
  expect.soft(result.mappings.find((mapping) => mapping.transactionId === "BW-OOG-001")?.reportTreatment).toBe("excluded_grant_period");

  const expectedActuals: Record<string, number> = { Personnel: 54_000, "Fringe Benefits": 13_500, "Emergency Client Assistance": 14_980, "Legal & Benefits Navigation": 8_400, "Technology & Data Systems": 26_200, "Local Travel": 2_400, Evaluation: 4_500, "Indirect Costs": 9_000 };
  for (const [category, actualAmount] of Object.entries(expectedActuals)) {
    expect.soft(result.financialAnalysis?.budgetVariances.find((item) => item.category === category)?.actualAmount, category).toBe(actualAmount);
  }
  expect.soft(result.financialAnalysis?.budgetVariances.find((item) => item.category === "Technology & Data Systems")).toMatchObject({ approvedAmount: 18_000, actualAmount: 26_200, varianceAmount: 8_200, variancePercent: 45.6, explanationRequired: true });
  const indirect = result.financialAnalysis?.controls.find((control) => control.id === "indirect-cost-limit");
  expect.soft(indirect).toMatchObject({ status: "passed", requiresAction: false });
  expect.soft(indirect?.detail).toMatch(/\$123,980\.00 eligible direct costs.*\$9,918\.40.*8%.*\$918\.40 remaining capacity/i);
  expect.soft(indirect?.detail).not.toMatch(/15%/);

  const approvals = result.financialAnalysis?.controls.find((control) => control.id === "assistance-approvals");
  expect.soft(approvals).toMatchObject({ status: "review", requiresAction: true, transactionIds: ["BW-EA-011"] });
  expect.soft(approvals?.detail).toContain("BW-EA-011 ($1,600)");
  expect.soft(approvals?.detail).not.toMatch(/BW-EA-003|BW-EA-006/);
  const documentation = result.financialAnalysis?.controls.find((control) => control.id === "assistance-documentation");
  expect.soft(documentation).toMatchObject({ status: "review", requiresAction: true });
  expect.soft(documentation?.detail).toMatch(/12 assistance disbursements.*referenced|referenced.*12 assistance disbursements/i);
  expect.soft(documentation?.detail).toMatch(/underlying document/i);
}

function assertKpiGroundTruth(result: CompilationResult) {
  const insights = buildProgramInsights(result);
  expect.soft(insights.find((item) => item.id === "households-served")).toMatchObject({ value: "172 of 300" });
  expect.soft(insights.find((item) => item.id === "households-served")?.detail).toContain("57.3%");
  expect.soft(insights.find((item) => item.id === "housing-assessments")).toMatchObject({ value: "158 of 270", status: "Needs confirmation" });
  expect.soft(insights.find((item) => item.id === "housing-assessments")?.detail).toMatch(/91\.9% of households served|92% of households served/);
  expect.soft(insights.find((item) => item.id === "housing-placements")).toMatchObject({ value: "98 of 180" });
  expect.soft(insights.find((item) => item.id === "housing-placements")?.detail).toContain("54.4%");
  expect.soft(insights.find((item) => item.id === "housing-retention")).toMatchObject({ value: "81.6% · target 80%", status: "Target achieved" });
  expect.soft(insights.find((item) => item.id === "housing-retention")?.detail).toMatch(/40 of 49/);
  expect.soft(insights.find((item) => item.id === "benefits-screenings")).toMatchObject({ value: "139 of 240" });
  expect.soft(insights.find((item) => item.id === "benefits-screenings")?.detail).toContain("57.9%");
  expect.soft(insights.find((item) => item.id === "client-satisfaction")).toMatchObject({ value: "4.4 of 5 · target 4.3", status: "Target achieved" });
  expect.soft(insights.find((item) => item.id === "client-satisfaction")?.detail).toContain("80 valid survey responses");
  expect.soft(insights.some((item) => item.id === "satisfaction-unconfirmed")).toBe(false);
  expect.soft(buildProgramReadiness(result)).toEqual({ ready: 5, conflicts: 1, awaitingConfirmation: 0 });
  const p2 = result.programChecks?.find((check) => /\bp2\b|assessment count/i.test(check.title) && check.type === "data_conflict");
  expect.soft(p2).toMatchObject({ evidenceBackedValue: "158", resolution: "open" });
  expect.soft(`${p2?.detail} ${p2?.action}`).toMatch(/158.*160|160.*158/);
  const surveyNarrative = result.narrative.find((item) => item.id === "evidence-p6-satisfaction");
  expect.soft(surveyNarrative?.text).toMatch(/4\.4 out of 5.*80 valid responses/i);
  const p6Audit = result.programChecks?.find((item) => /satisfaction/i.test(`${item.title} ${item.detail}`) && /under validation|pending.validation/i.test(item.detail));
  expect.soft(p6Audit).toMatchObject({ resolution: "resolved", status: "verified", evidenceBackedValue: "4.4/5" });
  expect.soft(p6Audit?.detail).toMatch(/supersedes the earlier pending-validation status/i);
  expect.soft(p6Audit?.sources.map((source) => source.sourceName)).toEqual(expect.arrayContaining([
    "GrantDeskHQ_Synthetic_Program_Update_Interim_Report_1.docx",
    "05_Client_Satisfaction_Survey_Interim1.xlsx"
  ]));
}

function assertWorkflowGroundTruth(result: CompilationResult) {
  expect.soft(result.requirements.length).toBeGreaterThanOrEqual(20);
  expect.soft(result.requirements.every((requirement) => requirement.status === "verified")).toBe(true);
  const actions = buildReportAttention(result);
  const text = actions.map((item) => `${item.title} ${item.detail}`).join(" ");
  expect.soft(actions).toHaveLength(6);
  expect.soft(text).toMatch(/BW-AMB-001/);
  expect.soft(text).toMatch(/BW-LGL-003/);
  expect.soft(text).toMatch(/Technology.*8,200|8,200.*Technology/i);
  expect.soft(text).toMatch(/BW-EA-011/);
  expect.soft(text).toMatch(/158.*160|160.*158/);
  expect.soft(text).toMatch(/Program Director.*aware|awareness.*Program Director/i);
  expect.soft(text).not.toMatch(/matching.funds.*action|final certification|seven.year.*action|no.cost extension.*action|return unspent.*action|not submitted.*action/i);
  const evidenceIndexText = result.requirements.map((item) => item.requirement).join(" ");
  expect.soft(evidenceIndexText).toMatch(/evidence index/i);
}

function assertEvidenceMatch(result: CompilationResult, fileName: string, expected: RegExp) {
  const file = result.evidenceFiles?.find((item) => item.name === fileName);
  expect.soft(file, fileName).toBeDefined();
  const evidenceText = file?.matches.map((match) => `${match.targetId} ${match.targetLabel} ${match.rationale} ${match.source.excerpt}`).join(" ") || "";
  expect.soft(evidenceText, `${fileName} match`).toMatch(expected);
}

async function createDisposableIdentity(): Promise<TestIdentity> {
  const configResponse = await fetch(`${appOrigin}/api/config`);
  expect(configResponse.ok).toBe(true);
  const config = await configResponse.json() as { apiKey: string };
  const unique = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const email = `grantdesk-regression-${unique}@example.com`;
  const password = `Gdhq-${crypto.randomUUID()}!9`;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`, {
    method: "POST",
    headers: firebaseHeaders(),
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const body = await response.json() as { idToken?: string; localId?: string; error?: { message?: string } };
  if (!response.ok || !body.idToken || !body.localId) throw new Error(`Disposable test identity could not be created: ${body.error?.message || response.status}`);
  return { idToken: body.idToken, localId: body.localId, email, password, apiKey: config.apiKey };
}

function firebaseHeaders() {
  return { "Content-Type": "application/json", Referer: firebaseReferer };
}

async function api<T>(pathname: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await rawApi(pathname, token, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method || "GET"} ${pathname} returned ${response.status}: ${text}`);
  return JSON.parse(text) as T;
}

function rawApi(pathname: string, token: string, init: RequestInit = {}) {
  return fetch(`${appOrigin}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers }
  });
}

function writeSnapshots(stage: string, response: RegressionApiResponse) {
  const directory = path.join(artifacts, stage);
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, snapshot] of Object.entries(splitStructuredSnapshots(response))) {
    fs.writeFileSync(path.join(directory, name), `${JSON.stringify(snapshot, null, 2)}\n`);
  }
}

function writeCrossReportComparison(reportA: ReturnType<typeof normalizedBusinessState>, reportB: ReturnType<typeof normalizedBusinessState>) {
  const serializedA = JSON.stringify(reportA);
  const serializedB = JSON.stringify(reportB);
  fs.writeFileSync(path.join(artifacts, "cross-report-comparison.json"), `${JSON.stringify({
    reportAHash: createHash("sha256").update(serializedA).digest("hex"),
    reportBHash: createHash("sha256").update(serializedB).digest("hex"),
    identical: serializedA === serializedB
  }, null, 2)}\n`);
}
