import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const runtime = process.env.GRANTDESK_PLAYWRIGHT_RUNTIME || path.join(os.tmpdir(), "grantdesk-playwright-runtime");
const require = createRequire(path.join(runtime, "package.json"));
const { chromium } = require("playwright");
const origin = (process.env.GRANTDESK_E2E_ORIGIN || "https://grantdeskhq.com").replace(/\/$/, "");
const firebaseReferer = `${(process.env.GRANTDESK_FIREBASE_REFERER || "https://grantdeskhq.com").replace(/\/$/, "")}/`;
const fixtures = path.join(root, "tests/fixtures/northstar-interim1");
const artifacts = path.join(root, "test-results/grantdesk-regression/playwright");
const evidenceFiles = [
  "01_Enrollment_Records_Interim1.xlsx",
  "02_Assessment_Records_Interim1.xlsx",
  "03_Housing_Placement_and_120_Day_Followup_Interim1.xlsx",
  "04_Benefits_Screening_Records_Interim1.xlsx",
  "05_Client_Satisfaction_Survey_Interim1.xlsx",
  "06_Emergency_Assistance_Support_Interim1.xlsx",
  "07_PD_Approval_BW-EA-003.pdf",
  "08_PD_Approval_BW-EA-006.pdf",
  "09_Irrelevant_Board_Meeting_Notes.pdf"
].map((name) => path.join(fixtures, name));

fs.mkdirSync(artifacts, { recursive: true });
const identity = await createIdentity();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { Referer: firebaseReferer } });
const page = await context.newPage();
page.setDefaultTimeout(30_000);
let status = "FAIL";
let browserCompilationRequest = "";
page.on("request", (request) => {
  if (request.method() === "POST" && /\/api\/(?:reports\/compile|compile-report)$/.test(new globalThis.URL(request.url()).pathname)) {
    browserCompilationRequest = request.postData() || browserCompilationRequest;
  }
});

try {
  await page.goto(`${origin}/login`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Sign in" }).click();
  await page.getByLabel("Work email").fill(identity.email);
  await page.getByLabel("Password").fill(identity.password);
  await Promise.all([
    page.waitForURL(/\/workspace/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);

  await page.getByLabel("Primary navigation").getByRole("link", { name: "New report" }).click();
  await page.getByLabel("Organization").fill("BridgeWorks Family Services");
  await page.getByLabel("Grant or award").fill("Northstar Community Fund — Family Stability & Housing Navigation Program");
  await page.getByLabel("Reporting period").fill("February 1 – July 31, 2027");
  await page.getByRole("button", { name: /^Continue/ }).click();

  await page.locator("#source-awardAgreement").setInputFiles(path.join(fixtures, "GrantDeskHQ_Synthetic_Grant_Agreement_Test_2.docx"));
  await page.locator("#source-ledgerExport").setInputFiles(path.join(fixtures, "GrantDeskHQ_Synthetic_GL_Interim_Report_1.xlsx"));
  await page.locator("#source-programUpdate").setInputFiles(path.join(fixtures, "GrantDeskHQ_Synthetic_Program_Update_Interim_Report_1.docx"));
  await page.locator("#source-supporting-evidence").setInputFiles(evidenceFiles);
  await assertText(page, "9 supporting evidence files");
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.getByText("Step 3 of 4").waitFor({ timeout: 180_000 });
  await assertText(page, "Award document present");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.getByRole("button", { name: "Create and verify report draft" }).click();
  await page.locator("#compiler-results").waitFor({ timeout: 600_000 });
  await page.getByRole("button", { name: "Create and verify report draft" }).waitFor({ timeout: 600_000 });

  await assertText(page, "only need to review 6 things");
  await assertText(page, "BW-AMB-001");
  await assertText(page, "BW-LGL-003");
  await assertText(page, "$26,200");
  await assertText(page, "BW-EA-011");

  const persisted = await fetchLatestReport(identity);
  const visibleActions = await visibleActionState(page);
  assert.equal(visibleActions.length, 6, "the finalized browser report has exactly six grouped actions");
  assert.equal(visibleActions.some((item) => /evidence index/i.test(item.text)), false, "a generated KPI evidence index is not a customer action");
  const evidenceSummary = {
    reportId: persisted.reportId,
    total: persisted.result.evidenceFiles?.length || 0,
    matched: persisted.result.evidenceFiles?.filter((file) => file.relevance === "matched").map((file) => file.name) || [],
    review: persisted.result.evidenceFiles?.filter((file) => file.relevance === "review").map((file) => file.name) || [],
    unmatched: persisted.result.evidenceFiles?.filter((file) => file.relevance === "unmatched").map((file) => file.name) || [],
    irrelevant: persisted.result.evidenceFiles?.filter((file) => file.relevance === "irrelevant").map((file) => file.name) || []
  };
  fs.writeFileSync(path.join(artifacts, "structured-state.json"), `${JSON.stringify(evidenceSummary, null, 2)}\n`);
  assert.equal(evidenceSummary.total, 9, "all nine supporting-evidence files persist");
  assert.equal(evidenceSummary.matched.length, 8, "eight relevant evidence files are matched automatically");
  assert.deepEqual(evidenceSummary.review, [], "the golden evidence set contains no review-only files");
  assert.deepEqual(evidenceSummary.unmatched, [], "the golden evidence set contains no unmatched files");
  assert.deepEqual(evidenceSummary.irrelevant, ["09_Irrelevant_Board_Meeting_Notes.pdf"]);
  compareWithLiveApiReference(persisted, visibleActions);

  await selectResultTab(page, "Inputs");
  await assertText(page, "9 supporting evidence files");
  await assertText(page, "8 matched automatically");
  await assertText(page, "1 not relevant");

  await selectResultTab(page, "Financial mapping");
  await assertText(page, "$123,980.00 eligible direct costs");
  await assertText(page, "$9,918.40");
  await assertText(page, "$918.40 remaining capacity");
  await assertText(page, "Excluded — outside report period");

  await selectResultTab(page, "Draft & evidence");
  await assertSectionValues(page, ".program-intelligence", [
    "172 of 300",
    "98 of 180",
    "81.6% · target 80%",
    "139 of 240",
    "4.4 of 5 · target 4.3"
  ]);
  await assertText(page, "5 KPIs ready");
  await assertText(page, "1 conflict · 0 awaiting confirmation");

  await selectResultTab(page, "Review");
  assert.deepEqual((await visibleActionState(page)).map(({ id, kind }) => ({ id, kind })), visibleActions.map(({ id, kind }) => ({ id, kind })), "Review and Overview use the same canonical grouped actions");

  await page.goto(`${origin}/workspace`, { waitUntil: "networkidle" });
  const continueLink = page.getByRole("link", { name: "Continue review" }).first();
  const href = await continueLink.getAttribute("href");
  assert.match(href || "", /\/compile\?report=report_[a-f0-9]{32}$/);
  await continueLink.click();
  await page.locator("#compiler-results").waitFor({ timeout: 120_000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#compiler-results").waitFor({ timeout: 120_000 });
  assert.ok(browserCompilationRequest, "Playwright captured the browser-created compilation request for idempotency replay");
  const reanalysisResponse = await globalThis.fetch(`${origin}/api/reports/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${identity.idToken}` },
    body: browserCompilationRequest
  });
  assert.equal(reanalysisResponse.ok, true, `browser report reanalysis returned ${reanalysisResponse.status}`);
  assert.equal((await reanalysisResponse.json()).reportId, persisted.reportId, "reanalysis reuses the browser-created report instead of creating a duplicate");
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#compiler-results").waitFor({ timeout: 120_000 });
  await assertText(page, "only need to review 6 things");
  assert.deepEqual((await visibleActionState(page)).map(({ id, kind }) => ({ id, kind })), visibleActions.map(({ id, kind }) => ({ id, kind })), "reload and reanalysis preserve canonical grouped actions");
  await selectResultTab(page, "Draft & evidence");
  await assertText(page, "4.4 of 5 · target 4.3");
  await page.screenshot({ path: path.join(artifacts, "northstar-final.png"), fullPage: true });
  status = "PASS";
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, "northstar-failure.png"), fullPage: true }).catch(() => undefined);
  fs.writeFileSync(path.join(artifacts, "failure.txt"), `${error instanceof Error ? error.stack : String(error)}\n`);
  throw error;
} finally {
  await cleanupIdentity(identity).catch((error) => {
    fs.writeFileSync(path.join(artifacts, "cleanup-failure.txt"), `${error instanceof Error ? error.stack : String(error)}\n`);
  });
  await browser.close();
  fs.writeFileSync(path.join(artifacts, "result.json"), `${JSON.stringify({ status, origin }, null, 2)}\n`);
}

async function assertText(page, value) {
  await page.getByText(value, { exact: false }).filter({ visible: true }).first().waitFor();
}

async function assertSectionValues(page, selector, values) {
  const section = page.locator(selector).filter({ visible: true }).first();
  await section.waitFor();
  const content = (await section.textContent() || "").replace(/\s+/g, " ").trim();
  for (const value of values) {
    const pattern = value.split(/\s+/).map(escapeRegExp).join("\\s+");
    assert.match(content, new RegExp(pattern), `${selector} is missing ${value}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function selectResultTab(page, name) {
  const tab = page.locator("#compiler-results").getByRole("tab", { name });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await tab.click();
    if (await tab.getAttribute("aria-selected") === "true") return;
  }
  assert.equal(await tab.getAttribute("aria-selected"), "true", `${name} tab did not activate`);
}

async function createIdentity() {
  const configResponse = await globalThis.fetch(`${origin}/api/config`);
  assert.equal(configResponse.ok, true, `GET /api/config returned ${configResponse.status}`);
  const config = await configResponse.json();
  const unique = `${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const email = `grantdesk-browser-${unique}@example.com`;
  const password = `Gdhq-${globalThis.crypto.randomUUID()}!9`;
  const response = await globalThis.fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`, {
    method: "POST",
    headers: firebaseHeaders(),
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.ok, true, `Disposable identity creation failed: ${body.error?.message || response.status}`);
  return { apiKey: config.apiKey, email, password, idToken: body.idToken };
}

async function cleanupIdentity(identity) {
  const reportsResponse = await globalThis.fetch(`${origin}/api/reports`, { headers: { Authorization: `Bearer ${identity.idToken}` } });
  if (reportsResponse.ok) {
    const body = await reportsResponse.json();
    for (const report of body.reports || []) {
      const response = await globalThis.fetch(`${origin}/api/reports/${encodeURIComponent(report.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${identity.idToken}` }
      });
      assert.equal(response.ok, true, `Report ${report.id} cleanup returned ${response.status}`);
    }
  }
  let cleanupToken = identity.idToken;
  let identityResponse = await deleteIdentity(identity.apiKey, cleanupToken);
  if (!identityResponse.ok) {
    const freshResponse = await globalThis.fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(identity.apiKey)}`, {
      method: "POST",
      headers: firebaseHeaders(),
      body: JSON.stringify({ email: identity.email, password: identity.password, returnSecureToken: true })
    });
    if (freshResponse.ok) {
      const fresh = await freshResponse.json();
      cleanupToken = fresh.idToken;
      identityResponse = await deleteIdentity(identity.apiKey, cleanupToken);
    }
  }
  const identityBody = await identityResponse.json().catch(() => ({}));
  if (!identityResponse.ok && /USER_NOT_FOUND|EMAIL_NOT_FOUND/.test(identityBody.error?.message || "")) return;
  assert.equal(identityResponse.ok, true, `Disposable identity cleanup returned ${identityResponse.status}: ${identityBody.error?.message || "unknown error"}`);
}

function deleteIdentity(apiKey, idToken) {
  return globalThis.fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: firebaseHeaders(),
    body: JSON.stringify({ idToken })
  });
}

async function fetchLatestReport(identity) {
  const reportsResponse = await globalThis.fetch(`${origin}/api/reports`, { headers: { Authorization: `Bearer ${identity.idToken}` } });
  assert.equal(reportsResponse.ok, true, `GET /api/reports returned ${reportsResponse.status}`);
  const reportsBody = await reportsResponse.json();
  assert.equal(reportsBody.reports?.length, 1, "the disposable identity owns exactly one test report");
  const reportId = reportsBody.reports[0].id;
  const reportResponse = await globalThis.fetch(`${origin}/api/reports/${encodeURIComponent(reportId)}`, { headers: { Authorization: `Bearer ${identity.idToken}` } });
  assert.equal(reportResponse.ok, true, `GET /api/reports/${reportId} returned ${reportResponse.status}`);
  return reportResponse.json();
}

async function visibleActionState(page) {
  return page.locator("#compiler-results [data-action-id]:visible").evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute("data-action-id") || "",
    kind: node.getAttribute("data-action-kind") || "",
    text: (node.textContent || "").replace(/\s+/g, " ").trim()
  })).sort((left, right) => left.id.localeCompare(right.id)));
}

function compareWithLiveApiReference(persisted, visibleActions) {
  const referenceRoot = path.join(root, "test-results/grantdesk-regression/live-api/after-evidence");
  assert.equal(fs.existsSync(referenceRoot), true, "the complete runner produced the live API reference state before Playwright");
  const snapshots = browserComparableSnapshots(persisted, visibleActions);
  for (const [name, actual] of Object.entries(snapshots)) {
    const expected = JSON.parse(fs.readFileSync(path.join(referenceRoot, name), "utf8"));
    assert.deepEqual(actual, expected, `browser-created ${name} matches the independent live API report`);
  }
  fs.writeFileSync(path.join(artifacts, "canonical-browser-state.json"), `${JSON.stringify(snapshots, null, 2)}\n`);
}

function browserComparableSnapshots(response, visibleActions) {
  const result = response.result;
  const evidenceNameById = new Map((result.evidenceFiles || []).map((file) => [file.id, file.name]));
  const categories = [...new Set((result.financialAnalysis?.budgetVariances || []).map((item) => item.category))].sort();
  return {
    "requirements.json": result.requirements.map((item) => ({ id: item.id, canonicalType: item.canonicalType || null, canonicalSubject: item.canonicalSubject || null, applicability: item.applicability || null, status: item.status, sourceName: item.source.sourceName })).sort((left, right) => left.id.localeCompare(right.id)),
    "financialAnalysis.json": {
      ledgerTransactionCount: result.financialAnalysis?.ledgerTransactionCount || 0,
      mappedTransactionCount: result.financialAnalysis?.mappedTransactionCount || 0,
      excludedTransactionCount: result.financialAnalysis?.excludedTransactionCount || 0,
      mappedActualTotal: result.financialAnalysis?.mappedActualTotal || 0,
      categoryActuals: Object.fromEntries(categories.map((category) => [category, result.financialAnalysis?.budgetVariances.find((item) => item.category === category)?.actualAmount])),
      mappings: result.mappings.map((mapping) => ({ transactionId: mapping.transactionId, amount: mapping.amount, category: mapping.suggestedCategory, mappingConfidence: mapping.mappingConfidence || null, complianceStatus: mapping.complianceStatus || null, reportTreatment: mapping.reportTreatment || null, evidenceRequirementStatus: mapping.evidenceRequirementStatus || null })),
      variances: (result.financialAnalysis?.budgetVariances || []).map((item) => ({ category: item.category, approvedAmount: item.approvedAmount, actualAmount: item.actualAmount, varianceAmount: item.varianceAmount, variancePercent: item.variancePercent, explanationThreshold: item.explanationThreshold, explanationRequired: item.explanationRequired })).sort((left, right) => left.category.localeCompare(right.category)),
      controls: (result.financialAnalysis?.controls || []).map((control) => ({ id: control.id, status: control.status, requiresAction: control.requiresAction, transactionIds: [...control.transactionIds].sort(), detail: normalizeText(control.detail) })).sort((left, right) => left.id.localeCompare(right.id))
    },
    "evidenceMatches.json": (result.evidenceFiles || []).map((file) => ({ name: file.name, parsingStatus: file.parsingStatus, relevance: file.relevance, matches: file.matches.map((match) => ({ targetType: match.targetType, targetId: match.targetId, status: match.status })).sort((left, right) => left.targetId.localeCompare(right.targetId)) })).sort((left, right) => left.name.localeCompare(right.name)),
    "canonicalProgramState.json": (result.programChecks || []).map((check) => ({ id: check.id, type: check.type, severity: check.severity, resolution: check.resolution, status: check.status, evidenceBackedValue: check.evidenceBackedValue || null, evidenceSatisfiedBy: [...(check.evidenceSatisfiedBy || [])].map((id) => evidenceNameById.get(id) || id).sort() })).sort((left, right) => left.id.localeCompare(right.id)),
    "actions.json": visibleActions.map(({ id, kind }) => ({ id, kind })),
    "reportReadiness.json": { readiness: result.workflow.readiness, actionRequiredCount: result.workflow.actionRequiredCount, needsReviewCount: result.workflow.needsReviewCount, missingInputCount: result.workflow.missingInputCount, evidenceCoveragePercent: result.validation.evidenceCoveragePercent, sourceMatchedItems: result.validation.sourceMatchedItems, itemsNeedingReview: result.validation.itemsNeedingReview, blockedItems: result.validation.blockedItems }
  };
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function firebaseHeaders() {
  return { "Content-Type": "application/json", Referer: firebaseReferer };
}
