// @vitest-environment node
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { applyDeterministicAccuracyChecks, parseLedger } from "../../server/accuracy";
import { prototypeFixture } from "../data/prototypeFixture";
import type { CompilationRequest } from "../types/prototype";

function request(): CompilationRequest {
  const file = fs.readFileSync("public/samples/General_Ledger_Export.csv");
  const sourceNames = new Set([
    ...prototypeFixture.requirements.map((item) => item.source.sourceName),
    ...prototypeFixture.narrative.map((item) => item.source.sourceName)
  ]);
  return {
    organizationName: "Hope Community Services",
    grantName: "Youth Access Initiative",
    reportingPeriod: "January–June 2026",
    files: [
      { role: "ledgerExport", name: "General_Ledger_Export.csv", mimeType: "text/csv", size: file.byteLength, data: `data:text/csv;base64,${file.toString("base64")}` },
      ...[...sourceNames].filter((name) => name !== "General_Ledger_Export.csv").map((name, index) => ({ role: "supportingEvidence" as const, name, mimeType: "text/plain", size: 1, data: `data:text/plain;base64,${Buffer.from(String(index)).toString("base64")}` }))
    ]
  };
}

function requestWithConfirmedKpi(): CompilationRequest {
  const input = request();
  const facts = JSON.stringify({ programMetrics: [{ label: "Youth served", target: 120, actual: 118 }], budgetVsActual: [] });
  input.files.push({ role: "supportingEvidence", name: "GrantDeskHQ_Confirmed_Workflow_Data.txt", mimeType: "text/plain", size: Buffer.byteLength(facts), data: `data:text/plain;base64,${Buffer.from(facts).toString("base64")}` });
  return input;
}

describe("deterministic accuracy controls", () => {
  it("parses exactly 20 ledger transactions totaling $75,400", () => {
    const rows = parseLedger(request());
    expect(rows).toHaveLength(20);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(75400);
  });

  it("replaces an AI amount with the ledger value and blocks the mismatch", () => {
    const tampered = {
      ...prototypeFixture,
      mappings: prototypeFixture.mappings.map((item) => item.transactionId === "TRV-001" ? { ...item, amount: 999999 } : item)
    };
    const checked = applyDeterministicAccuracyChecks(request(), tampered);
    expect(checked.mappings.find((item) => item.transactionId === "TRV-001")?.amount).toBe(3250);
    expect(checked.mappings.find((item) => item.transactionId === "TRV-001")?.status).toBe("blocked");
    expect(checked.validation.findings.some((item) => item.itemId === "TRV-001" && item.verdict === "blocked")).toBe(true);
  });

  it("blocks export when an AI mapping references a transaction absent from the ledger", () => {
    const fabricated = { ...prototypeFixture, mappings: [{ ...prototypeFixture.mappings[0], transactionId: "FAKE-999" }, ...prototypeFixture.mappings.slice(1)] };
    const checked = applyDeterministicAccuracyChecks(request(), fabricated);
    expect(checked.mappings[0].status).toBe("blocked");
    expect(checked.qualityChecks.find((item) => item.id === "deterministic-ledger")?.status).toBe("blocked");
  });

  it("blocks the deterministic ledger gate when AI omits a transaction", () => {
    const omitted = { ...prototypeFixture, mappings: prototypeFixture.mappings.slice(1) };
    const checked = applyDeterministicAccuracyChecks(request(), omitted);
    expect(checked.qualityChecks.find((item) => item.id === "deterministic-ledger")?.status).toBe("blocked");
    expect(checked.validation.findings.some((item) => item.itemId === `ledger:${prototypeFixture.mappings[0].transactionId}` && item.verdict === "blocked")).toBe(true);
  });

  it("marks financial and current-period checks not evaluated when their inputs are missing", () => {
    const input = request();
    input.files = input.files.filter((file) => file.role !== "ledgerExport");
    const checked = applyDeterministicAccuracyChecks(input, { ...prototypeFixture, mappings: [] });
    expect(checked.qualityChecks.find((item) => item.id === "deterministic-ledger")).toMatchObject({ status: "not_evaluated", detail: "Not evaluated — no accounting export has been added yet." });
    expect(checked.qualityChecks.find((item) => item.id === "deterministic-workflow-facts")?.status).toBe("not_evaluated");
  });

  it("blocks a narrative that reports the KPI target as the current-period result", () => {
    const contradicted = { ...prototypeFixture, narrative: prototypeFixture.narrative.map((item, index) => index === 0 ? { ...item, text: "Hope Community Services served 120 youth during the first six months." } : item) };
    const checked = applyDeterministicAccuracyChecks(requestWithConfirmedKpi(), contradicted);
    expect(checked.narrative[0].status).toBe("blocked");
    expect(checked.qualityChecks.find((item) => item.id === "deterministic-workflow-facts")?.status).toBe("blocked");
  });

  it("accepts the confirmed KPI actual and its deterministic achievement percentage", () => {
    const corrected = { ...prototypeFixture, narrative: prototypeFixture.narrative.map((item, index) => index === 0 ? { ...item, text: "Hope Community Services served 118 youth, reaching 98.3% of its six-month target." } : item) };
    const checked = applyDeterministicAccuracyChecks(requestWithConfirmedKpi(), corrected);
    expect(checked.narrative[0].status).not.toBe("blocked");
    expect(checked.qualityChecks.find((item) => item.id === "deterministic-workflow-facts")?.status).toBe("passed");
  });

  it("blocks a prior-period participant count when the current-period value is 118", () => {
    const stale = { ...prototypeFixture, narrative: prototypeFixture.narrative.map((item, index) => index === 0 ? { ...item, text: "Hope Community Services served 150 youth during the reporting period." } : item) };
    const checked = applyDeterministicAccuracyChecks(requestWithConfirmedKpi(), stale);
    expect(checked.narrative[0].status).toBe("blocked");
    expect(checked.validation.findings.some((item) => item.itemId === checked.narrative[0].id && /not present in the confirmed current-period KPI data/i.test(item.reason))).toBe(true);
  });

  it("allows financial amounts that come from the ledger or a source-matched requirement", () => {
    const requirement = { ...prototypeFixture.requirements[0], id: "REQ-TRAVEL", requirement: "Travel over $1,000 requires a receipt.", source: { ...prototypeFixture.requirements[0].source, excerpt: "Travel over $1,000 requires a receipt." } };
    const validation = { ...prototypeFixture.validation, findings: [...prototypeFixture.validation.findings, { ...prototypeFixture.validation.findings[0], id: "VAL-TRAVEL", itemId: "requirement:REQ-TRAVEL", verdict: "source_matched" as const }] };
    const withSupportedAmounts = { ...prototypeFixture, requirements: [...prototypeFixture.requirements, requirement], validation, narrative: prototypeFixture.narrative.map((item, index) => index === 0 ? { ...item, text: "Transaction TRV-003 was $3,450 and exceeds the $1,000 receipt threshold." } : item) };
    const checked = applyDeterministicAccuracyChecks(requestWithConfirmedKpi(), withSupportedAmounts);
    expect(checked.narrative[0].status).not.toBe("blocked");
    expect(checked.qualityChecks.find((item) => item.id === "deterministic-workflow-facts")?.status).toBe("passed");
  });

  it("passes the proactive privacy scan when no obvious prohibited identifiers appear in the draft", () => {
    const policyOnly = {
      ...prototypeFixture,
      narrative: prototypeFixture.narrative.map((item, index) => index === 0 ? { ...item, text: `${item.text} Medical diagnoses and immigration-status information must not appear in the funder report.` } : item)
    };
    const checked = applyDeterministicAccuracyChecks(request(), policyOnly);
    expect(checked.qualityChecks.find((item) => item.id === "deterministic-privacy-scan")).toMatchObject({
      status: "passed",
      required: true
    });
  });

  it("blocks a draft containing an obvious Social Security number without echoing the value", () => {
    const sensitive = {
      ...prototypeFixture,
      narrative: prototypeFixture.narrative.map((item, index) => index === 0 ? { ...item, text: `${item.text} Participant SSN: 123-45-6789.` } : item)
    };
    const checked = applyDeterministicAccuracyChecks(request(), sensitive);
    const privacy = checked.qualityChecks.find((item) => item.id === "deterministic-privacy-scan");
    expect(privacy).toMatchObject({ status: "blocked", required: true });
    expect(privacy?.detail).toContain("a Social Security number");
    expect(privacy?.detail).not.toContain("123-45-6789");
  });
});
