// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileGrantReport } from "../../server/reportCompiler";
import type { CompilationRequest, SourceReference, ValidationFinding } from "../types/prototype";

const source: SourceReference = {
  sourceName: "award.txt",
  locator: "Section 1",
  excerpt: "Source-supported test text."
};

describe("report compiler verification resilience", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("splits an output-limited verifier batch without losing any findings", async () => {
    let truncated = false;
    const candidateCounts: number[] = [];
    installCompilerFetchMock((candidates) => {
      candidateCounts.push(candidates.length);
      if (!truncated && candidates.length === 40) {
        truncated = true;
        return response({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
      }
      return verificationResponse(candidates);
    });

    const result = await compileGrantReport(request(), []);

    expect(truncated).toBe(true);
    expect(candidateCounts).toContain(40);
    expect(candidateCounts.filter((count) => count === 20)).toHaveLength(2);
    expect(result.validation.findings).toHaveLength(73);
    expect(result.validation.sourceMatchedItems).toBe(73);
    expect(result.validation.blockedItems).toBe(0);
  });

  it("recovers from a timed-out verifier batch by retrying smaller bounded batches", async () => {
    let timedOut = false;
    const candidateCounts: number[] = [];
    installCompilerFetchMock((candidates) => {
      candidateCounts.push(candidates.length);
      if (!timedOut && candidates.length === 40) {
        timedOut = true;
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }
      return verificationResponse(candidates);
    });

    const result = await compileGrantReport(request(), []);

    expect(timedOut).toBe(true);
    expect(candidateCounts.filter((count) => count === 20)).toHaveLength(2);
    expect(result.validation.findings).toHaveLength(73);
    expect(result.validation.sourceMatchedItems).toBe(73);
    expect(result.validation.blockedItems).toBe(0);
  });

  it("keeps an award requirement source-verified when only its current-period result needs review", async () => {
    let downgradedOneRequirement = false;
    installCompilerFetchMock((candidates) => {
      const findings: ValidationFinding[] = candidates.map((candidate, index) => {
        if (!downgradedOneRequirement && candidate.kind === "requirement") {
          downgradedOneRequirement = true;
          return {
            id: `finding-${index}-${candidate.id}`,
            itemId: candidate.id,
            verdict: "review",
            reason: "The requirement is directly supported, but the current-period result conflicts and is not finalized.",
            source
          };
        }
        return matchedFinding(candidate.id, index);
      });
      return response({ status: "completed", model: "test-verifier", output: output({ findings }) });
    });

    const result = await compileGrantReport(request(), []);

    expect(downgradedOneRequirement).toBe(true);
    expect(result.requirements.every((item) => item.status === "verified")).toBe(true);
    expect(result.validation.findings.find((item) => item.itemId === `requirement:${result.requirements[0].id}`)).toMatchObject({ verdict: "source_matched" });
  });
});

type TestCandidate = { id: string; kind?: string };

function installCompilerFetchMock(verify: (candidates: TestCandidate[]) => Response) {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as {
      text: { format: { name: string } };
      input: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
    };
    const schemaName = payload.text.format.name;
    if (schemaName === "grant_report_compilation") return response({ status: "completed", model: "test-compiler", output: output(compilation()) });
    if (schemaName === "grant_requirement_completeness_audit") return response({ status: "completed", model: "test-auditor", output: output({ missingRequirements: [] }) });
    if (schemaName === "grant_report_verification") return verify(verificationCandidates(payload));
    throw new Error(`Unexpected schema: ${schemaName}`);
  }));
}

function verificationCandidates(payload: {
  input: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
}) {
  const text = payload.input.find((item) => item.role === "user")?.content.find((item) => item.type === "input_text")?.text || "";
  const start = text.indexOf(": ");
  return JSON.parse(text.slice(start + 2)) as TestCandidate[];
}

function verificationResponse(candidates: TestCandidate[]) {
  const findings = candidates.map((candidate, index) => matchedFinding(candidate.id, index));
  return response({ status: "completed", model: "test-verifier", output: output({ findings }) });
}

function matchedFinding(itemId: string, index: number): ValidationFinding {
  return { id: `finding-${index}-${itemId}`, itemId, verdict: "source_matched", reason: "The source directly supports the candidate.", source };
}

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function output(value: unknown) {
  return [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }];
}

function request(): CompilationRequest {
  const contents = Buffer.from("Source-supported test text.", "utf8");
  return {
    organizationName: "BridgeWorks Family Services",
    grantName: "Northstar Community Fund — Family Stability & Housing Navigation Program",
    reportingPeriod: "February 1–July 31, 2027",
    files: [{
      role: "awardAgreement",
      name: "award.txt",
      mimeType: "text/plain",
      size: contents.byteLength,
      data: `data:text/plain;base64,${contents.toString("base64")}`
    }]
  };
}

function compilation() {
  const field = (value: string) => ({ value, confidence: 1, source, status: "verified" as const });
  return {
    reportTitle: "Interim Report 1",
    summary: "Test compilation",
    grantProfile: {
      granteeName: field("BridgeWorks Family Services"),
      funderName: field("Northstar Community Fund"),
      grantName: field("Family Stability & Housing Navigation Program"),
      grantId: field("TEST-001"),
      grantStartDate: field("2027-02-01"),
      grantEndDate: field("2028-07-31"),
      grantType: field("Restricted"),
      awardAmount: field("$325,000")
    },
    requirements: Array.from({ length: 65 }, (_, index) => ({
      id: `R${index + 1}`,
      requirement: `Source-supported requirement ${index + 1}`,
      source,
      confidence: 1,
      status: "verified" as const
    })),
    mappings: [],
    missingInputs: [],
    narrative: [],
    programChecks: [],
    qualityChecks: [],
    warnings: []
  };
}
