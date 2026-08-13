import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CompilationRequest, CompilerFile, SourceRole } from "../src/types/prototype.ts";

export interface ReliabilityFixtureDefinition {
  id: string;
  fixtureDirectory: string;
  goldenDirectory: string;
  files: { core: string[]; evidence: string[] };
  expected: {
    sources: Record<string, unknown>;
    financial: {
      categoryActuals: Record<string, number>;
      onlyUnmappedTransaction: string;
      duplicate: { transactionId: string; amount: number; includedRows: number; excludedRows: number };
      dateExclusions: Record<string, string>;
      technologyVariance: { approved: number; actual: number; amount: number; percent: number; explanationRequired: boolean };
      indirect: { directCostBase: number; percent: number; fixedCap: number; currentLimit: number; charged: number; remainingCapacity: number; status: string };
    };
    kpis: Record<string, Record<string, unknown>>;
    evidence: Record<string, string[]>;
    actions: { deduplicatedRootDecisions: string[]; notCurrentBlockers: string[] };
    readiness: Record<string, unknown>;
    requirements: Record<string, unknown>;
  };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = path.join(root, "tests/fixtures/northstar-interim1");
const goldenDirectory = path.join(root, "tests/golden/northstar-interim1");
const read = <T>(name: string) => JSON.parse(fs.readFileSync(path.join(goldenDirectory, name), "utf8")) as T;

const northstar: ReliabilityFixtureDefinition = {
  id: "northstar-interim1-v1",
  fixtureDirectory,
  goldenDirectory,
  files: {
    core: ["GrantDeskHQ_Synthetic_Grant_Agreement_Test_2.docx", "GrantDeskHQ_Synthetic_GL_Interim_Report_1.xlsx", "GrantDeskHQ_Synthetic_Program_Update_Interim_Report_1.docx"],
    evidence: ["01_Enrollment_Records_Interim1.xlsx", "02_Assessment_Records_Interim1.xlsx", "03_Housing_Placement_and_120_Day_Followup_Interim1.xlsx", "04_Benefits_Screening_Records_Interim1.xlsx", "05_Client_Satisfaction_Survey_Interim1.xlsx", "06_Emergency_Assistance_Support_Interim1.xlsx", "07_PD_Approval_BW-EA-003.pdf", "08_PD_Approval_BW-EA-006.pdf", "09_Irrelevant_Board_Meeting_Notes.pdf"]
  },
  expected: {
    sources: read("reportSources.json"),
    financial: read("financialAnalysis.json"),
    kpis: read("kpis.json"),
    evidence: read("evidenceMatches.json"),
    actions: read("actions.json"),
    readiness: read("reportReadiness.json"),
    requirements: read("requirements.json")
  }
};

const registry = new Map([[northstar.id, northstar]]);

export function reliabilityFixtures() { return [...registry.values()]; }
export function reliabilityFixture(id = northstar.id) {
  const fixture = registry.get(id);
  if (!fixture) throw new Error(`Unknown reliability fixture: ${id}`);
  return fixture;
}

export function northstarCanaryRequest(requestId: string): CompilationRequest {
  const roles: SourceRole[] = ["awardAgreement", "ledgerExport", "programUpdate"];
  return {
    organizationName: "BridgeWorks Family Services",
    grantName: "Northstar Community Fund — Family Stability & Housing Navigation Program",
    reportingPeriod: "February 1 – July 31, 2027",
    requestId,
    files: northstar.files.core.map((name, index) => fixtureFile(name, roles[index]))
  };
}

export function northstarCanaryEvidenceFiles(): CompilerFile[] {
  return northstar.files.evidence.map((name, index) => ({
    ...fixtureFile(name, "supportingEvidence"),
    evidenceId: `evidence_northstar_${String(index + 1).padStart(2, "0")}`,
    uploadedAt: "2027-08-01T12:00:00.000Z"
  }));
}

function fixtureFile(name: string, role: SourceRole): CompilerFile {
  const file = fs.readFileSync(path.join(fixtureDirectory, name));
  const mimeType = name.endsWith(".xlsx")
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : name.endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : name.endsWith(".pdf")
        ? "application/pdf"
        : name.endsWith(".csv") ? "text/csv" : "application/octet-stream";
  return { role, name, mimeType, size: file.byteLength, data: `data:${mimeType};base64,${file.toString("base64")}` };
}
