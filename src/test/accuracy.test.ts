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
});
