// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compilationAnalysisCacheKey, mappingsNeedDeterministicRecovery, persistedSources, sourcesAfterEvidenceReplacement, type StoredSource } from "../../server/persistence";
import { prototypeFixture } from "../data/prototypeFixture";
import { northstarRequest } from "./northstarRegression";

const coreSources: StoredSource[] = [
  source("awardAgreement", "Award.docx"),
  source("ledgerExport", "GL.xlsx"),
  source("programUpdate", "Program.docx")
];
const evidence: StoredSource = { ...source("supportingEvidence", "P1.xlsx"), evidenceId: "evidence_12345678" };

describe("persisted evidence source state", () => {
  it("does not remove core bindings when evidence is added without a replacement id", () => {
    expect(sourcesAfterEvidenceReplacement([...coreSources, evidence])).toEqual([...coreSources, evidence]);
  });

  it("replaces only the selected supporting-evidence object", () => {
    expect(sourcesAfterEvidenceReplacement([...coreSources, evidence], evidence.evidenceId)).toEqual(coreSources);
  });

  it("restores immutable core bindings if the mutable evidence collection is incomplete", () => {
    const restored = persistedSources({ sourcesJson: JSON.stringify([evidence]), coreSourcesJson: JSON.stringify(coreSources) });
    expect(restored.map((item) => item.role)).toEqual(["awardAgreement", "ledgerExport", "programUpdate", "supportingEvidence"]);
  });

  it("detects a mass mapping reset but not an isolated legitimate exception", () => {
    const reset = { mappings: Array.from({ length: 20 }, (_, index) => ({ ...prototypeFixture.mappings[0], transactionId: `TX-${index}`, mappingConfidence: "unmapped" as const, reportTreatment: "needs_category_review" as const })) };
    expect(mappingsNeedDeterministicRecovery(reset)).toBe(true);
    expect(mappingsNeedDeterministicRecovery({ mappings: prototypeFixture.mappings })).toBe(false);
  });

  it("uses one content-addressed core analysis key for independent reports with identical inputs", () => {
    const first = northstarRequest("request-one");
    const second = northstarRequest("request-two");
    expect(compilationAnalysisCacheKey(first)).toBe(compilationAnalysisCacheKey(second));
    second.files[0] = { ...second.files[0], data: `${second.files[0].data}changed` };
    expect(compilationAnalysisCacheKey(second)).not.toBe(compilationAnalysisCacheKey(first));
  });
});

function source(role: StoredSource["role"], name: string): StoredSource {
  return { role, name, mimeType: "application/octet-stream", size: 10, objectName: `org/report/sources/${role}-${name}` };
}
