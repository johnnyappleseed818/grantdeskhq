// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeSupportingEvidence, applyEvidenceMatches, extractTabularEvidenceFacts } from "../../server/evidenceReconciliation";
import { prototypeFixture } from "../data/prototypeFixture";
import { buildProgramInsights, buildProgramReadiness } from "../lib/programInsights";
import type { CompilationResult } from "../types/prototype";
import { northstarEvidenceFiles } from "./northstarRegression";

describe("Northstar real supporting-evidence fixtures", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("derives the six KPI results from the actual uploaded workbooks when model excerpts omit their values", async () => {
    const source = prototypeFixture.grantProfile.grantName.source;
    const result: CompilationResult = {
      ...prototypeFixture,
      requirements: [{
        ...prototypeFixture.requirements[0],
        id: "ALL-KPIS",
        status: "verified",
        requirement: "P1 target 300 unduplicated households served; P2 target 270 assessments; P3 target 180 stable housing placements; P4 target at least 80% stable at 120 days; P5 target 240 benefits screenings; P6 target at least 4.3 out of 5 average client satisfaction."
      }],
      narrative: [
        { id: "PROGRAM-P1", text: "The program served 172 unduplicated households.", evidenceType: "program_response", source, status: "verified" },
        { id: "PROGRAM-P2", text: "The KPI table reports 158 completed housing stability assessments.", evidenceType: "program_response", source, status: "verified" },
        { id: "PROGRAM-P3-QUALITATIVE", text: "Seventeen placement-ready households remained in navigation for more than 30 days.", evidenceType: "program_response", source, status: "verified" },
        { id: "PROGRAM-P6-STALE", text: "Client satisfaction remains under validation.", evidenceType: "needs_confirmation", source, status: "verified" }
      ],
      programChecks: [
        check("PC1", "kpi_result", "P1 — households served", "Underlying enrollment evidence is needed."),
        check("PC2", "data_conflict", "P2 — assessment count conflict", "KPI table: 158. Activities narrative: 160."),
        check("PC3", "kpi_result", "P3 — stable housing placements", "Underlying placement evidence is needed."),
        check("PC4", "kpi_result", "P4 — 120-day housing stability", "Underlying follow-up evidence is needed."),
        check("PC5", "kpi_result", "P5 — benefits screenings", "Underlying screening evidence is needed."),
        check("PC6", "kpi_result", "P6 — average client satisfaction", "The survey result is under validation.")
      ]
    };

    vi.stubEnv("OPENAI_API_KEY", "test-api-key");
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}")) as { input?: Array<{ content?: Array<{ filename?: string }> }> };
      const name = body.input?.flatMap((item) => item.content || []).find((item) => item.filename)?.filename || "";
      const targets = targetsFor(name);
      const modelResult = {
        relevance: name.includes("Board_Meeting") ? "irrelevant" : targets.length ? "matched" : "unmatched",
        summary: "The file was parsed and reconciled.",
        matches: targets.map((targetId) => ({
          targetId,
          confidence: 0.99,
          status: "matched",
          rationale: "This workbook directly supports the KPI.",
          locator: "Workbook summary",
          excerpt: "Underlying records supplied."
        }))
      };
      return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(modelResult) }] }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }));

    const fixtureFiles = northstarEvidenceFiles();
    expect(await Promise.all(fixtureFiles.slice(0, 5).map(extractTabularEvidenceFacts))).toEqual([
      [{ family: "p1", text: "Enrollment records confirm 172 unduplicated households served." }],
      [{ family: "p2", text: "Assessment records confirm 158 completed housing stability assessments." }],
      [
        { family: "p3", text: "Placement records confirm 98 stable-housing placements." },
        { family: "p4", text: "Follow-up records confirm 40 of 49 eligible placed households remained stably housed at 120 days." }
      ],
      [{ family: "p5", text: "Benefits records confirm 139 completed benefits screenings." }],
      [{ family: "p6", text: "Finalized survey evidence reports an average score of 4.4 out of 5 across 80 valid responses; award target 4.3 out of 5." }]
    ]);
    const analyzed = await analyzeSupportingEvidence(fixtureFiles, result);
    expect(analyzed[1]).toMatchObject({ parsingStatus: "parsed", relevance: "matched" });
    expect(analyzed[1].matches[0].source.excerpt).toContain("158 completed housing stability assessments");
    expect(analyzed[2].matches.map((match) => match.source.excerpt).join(" ")).toMatch(/98 stable-housing placements.*40 of 49 eligible/s);
    const reconciled = applyEvidenceMatches(result, analyzed);
    const insights = buildProgramInsights(reconciled);

    expect(insights.find((item) => item.id === "households-served")).toMatchObject({ value: "172 of 300" });
    expect(insights.find((item) => item.id === "housing-assessments")).toMatchObject({ value: "158 of 270", status: "Needs confirmation" });
    expect(insights.find((item) => item.id === "housing-placements")).toMatchObject({ value: "98 of 180" });
    expect(insights.find((item) => item.id === "housing-retention")).toMatchObject({ value: "81.6% · target 80%" });
    expect(insights.find((item) => item.id === "benefits-screenings")).toMatchObject({ value: "139 of 240" });
    expect(insights.find((item) => item.id === "client-satisfaction")).toMatchObject({ value: "4.4 of 5 · target 4.3" });
    expect(buildProgramReadiness(reconciled)).toEqual({ ready: 5, conflicts: 1, awaitingConfirmation: 0 });
    expect(reconciled.programChecks?.find((item) => item.id === "PC2")).toMatchObject({ evidenceBackedValue: "158", resolution: "open" });
  });

  it("recovers finalized KPI workbook facts when the model-backed evidence call fails", async () => {
    const source = prototypeFixture.grantProfile.grantName.source;
    const result: CompilationResult = {
      ...prototypeFixture,
      requirements: [{ ...prototypeFixture.requirements[0], id: "P6", requirement: "P6 average client satisfaction target at least 4.3 out of 5." }],
      narrative: [{ id: "PROGRAM-P6-STALE", text: "Client satisfaction remains under validation.", evidenceType: "needs_confirmation", source, status: "verified" }],
      programChecks: [check("PC6", "kpi_result", "P6 — average client satisfaction", "The survey result is under validation.")]
    };
    vi.stubEnv("OPENAI_API_KEY", "test-api-key");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("temporary model outage"); }));

    const survey = northstarEvidenceFiles().find((file) => file.name.startsWith("05_"))!;
    const analyzed = await analyzeSupportingEvidence([survey], result);
    const reconciled = applyEvidenceMatches(result, analyzed);

    expect(analyzed[0]).toMatchObject({ parsingStatus: "parsed", relevance: "matched" });
    expect(analyzed[0].matches.map((match) => match.targetId)).toContain("program:PC6");
    expect(buildProgramInsights(reconciled).find((item) => item.id === "client-satisfaction")).toMatchObject({ value: "4.4 of 5 · target 4.3", status: "Target achieved" });
  });

  it("auto-matches structured KPI workbook facts when the model returns no candidate match", async () => {
    const source = prototypeFixture.grantProfile.grantName.source;
    const result: CompilationResult = {
      ...prototypeFixture,
      requirements: [{ ...prototypeFixture.requirements[0], id: "P2", requirement: "P2 housing stability assessments target 270." }],
      programChecks: [check("PC2", "data_conflict", "P2 — assessment count conflict", "KPI table: 158. Activities narrative: 160.")],
      narrative: [{ id: "PROGRAM-P2", text: "The KPI table reports 158 assessments while the activities narrative reports 160.", evidenceType: "program_response", source, status: "verified" }]
    };
    vi.stubEnv("OPENAI_API_KEY", "test-api-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ relevance: "review", summary: "The file may relate to the report.", matches: [] }) }] }]
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const assessments = northstarEvidenceFiles().find((file) => file.name.startsWith("02_"))!;
    const analyzed = await analyzeSupportingEvidence([assessments], result);

    expect(analyzed[0]).toMatchObject({ parsingStatus: "parsed", relevance: "matched" });
    expect(analyzed[0].matches.map((match) => match.targetId)).toContain("program:PC2");
    expect(analyzed[0].matches[0].source.excerpt).toContain("158 completed housing stability assessments");
  });
});

function check(id: string, type: "kpi_result" | "data_conflict", title: string, detail: string) {
  return {
    id,
    type,
    title,
    detail,
    action: "Review the matched evidence.",
    owner: "Program" as const,
    severity: "review" as const,
    sources: [prototypeFixture.grantProfile.grantName.source],
    resolution: "open" as const,
    status: "review" as const
  };
}

function targetsFor(name: string) {
  if (name.startsWith("01_")) return ["program:PC1"];
  if (name.startsWith("02_")) return ["program:PC2"];
  if (name.startsWith("03_")) return ["program:PC3", "program:PC4"];
  if (name.startsWith("04_")) return ["program:PC5"];
  if (name.startsWith("05_")) return ["program:PC6"];
  return [];
}
