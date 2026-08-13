import { describe, expect, it } from "vitest";
import { prototypeFixture } from "../data/prototypeFixture";
import { buildProgramInsights, buildProgramReadiness, satisfiedProgramCheckIds } from "../lib/programInsights";
import type { CompilationResult, NarrativeStatement } from "../types/prototype";

const programSource = { sourceName: "BridgeWorks_Program_Update.docx", locator: "Page 2", excerpt: "Synthetic demonstration data — current program results." };
const awardSource = { sourceName: "Northstar_Award.docx", locator: "Section 13", excerpt: "Notify the funder of a Program Director change within 5 business days." };

const narrative: NarrativeStatement[] = [
  statement("N-1", "During the reporting period, the program served 172 unduplicated households, completed 158 housing assessments, placed 98 households into stable housing, and completed benefits screening for 139 households."),
  statement("N-2", "Among 49 eligible placed households, 40 remained stably housed at 120 days (81.6%); the client-satisfaction result is not confirmed because the survey dataset remains under validation."),
  statement("N-3", "The Program Director resigned effective June 10, 2027; the funder was notified June 14 and an Interim Program Director was appointed June 15.")
];

const result: CompilationResult = {
  ...prototypeFixture,
  narrative,
  requirements: [
    requirement("R-1", "300 unduplicated households receive navigation services."),
    requirement("R-2", "270 households complete housing assessments."),
    requirement("R-3", "180 households are placed into stable housing."),
    requirement("R-4", "240 households complete benefits screenings."),
    requirement("R-5", "At least 80% of eligible placed households remain stably housed at 120 days."),
    { ...requirement("R-6", "Notify the funder of a Program Director change within 5 business days."), source: awardSource }
  ]
};

describe("program intelligence", () => {
  it("shows cumulative progress without inferring that an interim result is behind schedule", () => {
    const households = buildProgramInsights(result).find((item) => item.id === "households-served");
    expect(households).toMatchObject({ value: "172 of 300", status: "Progress recorded" });
    expect(households?.detail).toContain("No interim target was specified");
    expect(households?.detail).not.toMatch(/behind|late/i);
  });

  it("calculates the retention result deterministically and recognizes the achieved target", () => {
    const retention = buildProgramInsights(result).find((item) => item.id === "housing-retention");
    expect(retention).toMatchObject({ value: "81.6% · target 80%", status: "Target achieved", tone: "success" });
    expect(retention?.detail).toContain("40 of 49");
    expect(retention?.detail).toContain("eligible cohort");
    expect(retention?.detail).toContain("more recent placements are not treated as having failed");
  });

  it("keeps the unconfirmed satisfaction result out of report-ready facts", () => {
    expect(buildProgramInsights(result).find((item) => item.id === "satisfaction-unconfirmed")).toMatchObject({
      status: "Not ready for reporting",
      value: "Confirmation needed",
      tone: "review"
    });
  });

  it("cross-checks the leadership notification against the award deadline", () => {
    const notification = buildProgramInsights(result).find((item) => item.id === "leadership-notification");
    expect(notification).toMatchObject({ title: "Program Director change reported on time", status: "Requirement satisfied · Timely", value: "Notified within 2 business days", tone: "success" });
    expect(notification?.sources.map((source) => source.sourceName)).toEqual([programSource.sourceName, awardSource.sourceName]);
  });

  it("removes an already-satisfied leadership notice from the customer action queue", () => {
    const withOpenModelCheck = {
      ...result,
      programChecks: [{
        id: "STAFF-1", type: "award_trigger" as const, title: "Confirm Program Director notification",
        detail: "The staffing change may require notice.", action: "Confirm notification.", owner: "Grants" as const,
        severity: "action_required" as const, sources: [programSource, awardSource], resolution: "open" as const, status: "verified" as const
      }]
    };
    expect([...satisfiedProgramCheckIds(withOpenModelCheck)]).toEqual(["STAFF-1"]);
  });

  it("recognizes natural program-update wording and summarizes only reportable KPIs", () => {
    const naturalResult: CompilationResult = {
      ...result,
      narrative: [
        statement("N-10", "BridgeWorks reported serving 172 unduplicated households during the reporting period, with 98 households placed into stable housing and 40 of 49 eligible placed households stably housed at 120 days."),
        statement("N-11", "The Program Director resigned effective June 10, 2027; the Fund was notified June 14, 2027, and an Interim Program Director was appointed June 15, 2027."),
        { ...statement("N-12", "Information required: Finalize the client-satisfaction result; the satisfaction-survey dataset remains under validation."), evidenceType: "needs_confirmation" }
      ],
      programChecks: [
        { id: "P2-CONFLICT", type: "data_conflict", title: "P2 — Housing stability assessments completed", detail: "The KPI table reports 158 while the activities section reports 160 assessments completed.", action: "Validate the result.", owner: "Program", severity: "review", sources: [programSource], resolution: "open", status: "verified" },
        { id: "P5-READY", type: "kpi_result", title: "P5 — Benefits screenings", detail: "139 households completed benefits screenings during the reporting period.", action: "No action needed.", owner: "Program", severity: "info", sources: [programSource], resolution: "open", status: "verified" },
        { id: "P6-WAIT", type: "kpi_result", title: "P6 — Client satisfaction", detail: "The survey result remains under validation.", action: "Confirm the final result.", owner: "Program", severity: "review", sources: [programSource], resolution: "open", status: "verified" }
      ]
    };
    const insights = buildProgramInsights(naturalResult);
    expect(insights.find((item) => item.id === "households-served")).toMatchObject({ value: "172 of 300" });
    expect(insights.find((item) => item.id === "housing-placements")).toMatchObject({ value: "98 of 180" });
    expect(insights.find((item) => item.id === "benefits-screenings")).toMatchObject({ value: "139 of 240" });
    expect(insights.find((item) => item.id === "housing-retention")).toMatchObject({ value: "81.6% · target 80%", status: "Target achieved" });
    expect(insights.find((item) => item.id === "housing-assessments")).toBeUndefined();
    expect(insights.find((item) => item.id === "leadership-notification")).toMatchObject({ status: "Requirement satisfied · Timely", value: "Notified within 2 business days" });
    expect(buildProgramReadiness(naturalResult)).toEqual({ ready: 4, conflicts: 1, awaitingConfirmation: 1 });
  });

  it("isolates every KPI target and accounts for all six KPI states exactly once", () => {
    const combinedRequirement = requirement("R-KPIS", [
      "P2 Housing stability assessments: cumulative target 270; at least 90% of households served.",
      "P1 Unduplicated households served: cumulative target 300.",
      "P5 Benefits screenings: cumulative target 240.",
      "P3 Stable housing placements: cumulative target 180.",
      "P6 Average client satisfaction: target at least 4.3 out of 5.",
      "P4 120-day housing retention: target at least 80% of the eligible cohort."
    ].join(" "));
    const completeResult: CompilationResult = {
      ...result,
      requirements: [combinedRequirement],
      programChecks: [],
      narrative: [
        narrative[0],
        statement("N-P4", "Among 49 households eligible for the 120-day measure, 40 remained stably housed, reported as 81.6%."),
        { ...statement("N-P6", "Average client satisfaction was 4.4 out of 5 across 80 valid responses."), evidenceType: "source_fact" }
      ]
    };

    const insights = buildProgramInsights(completeResult);
    const kpis = insights.filter((item) => ["households-served", "housing-assessments", "housing-placements", "housing-retention", "benefits-screenings", "client-satisfaction"].includes(item.id));
    expect(kpis.map((item) => item.id)).toEqual([
      "households-served",
      "housing-assessments",
      "housing-placements",
      "benefits-screenings",
      "housing-retention",
      "client-satisfaction"
    ]);
    expect(new Set(kpis.map((item) => item.id)).size).toBe(6);
    expect(kpis.find((item) => item.id === "households-served")).toMatchObject({ value: "172 of 300", detail: expect.stringContaining("57.3%") });
    expect(kpis.find((item) => item.id === "housing-assessments")).toMatchObject({ value: "158 of 270", detail: expect.stringContaining("91.9% of households served") });
    expect(kpis.find((item) => item.id === "housing-placements")).toMatchObject({ value: "98 of 180", detail: expect.stringContaining("54.4%") });
    expect(kpis.find((item) => item.id === "housing-retention")).toMatchObject({ value: "81.6% · target 80%", status: "Target achieved" });
    expect(kpis.find((item) => item.id === "benefits-screenings")).toMatchObject({ value: "139 of 240", detail: expect.stringContaining("57.9%") });
    expect(kpis.find((item) => item.id === "client-satisfaction")).toMatchObject({ value: "4.4 of 5 · target 4.3", status: "Target achieved" });
    const readiness = buildProgramReadiness(completeResult);
    expect(readiness).toEqual({ ready: 6, conflicts: 0, awaitingConfirmation: 0 });
    expect(readiness.ready + readiness.conflicts + readiness.awaitingConfirmation).toBe(6);
  });

  it("isolates the P2 target from a semicolon-delimited award clause without KPI labels", () => {
    const combinedRequirement = requirement(
      "R-NORTHSTAR-KPIS",
      "KPI targets and evidence: serve 300 unduplicated households; complete 270 assessments (90%); place 180 households (60%); maintain stable housing for 120 days for 80% of placed households; complete 240 benefits screenings; and report average satisfaction of at least 4.3/5.0 at every interim and final report."
    );
    const combinedResult: CompilationResult = {
      ...result,
      requirements: [combinedRequirement],
      narrative: [narrative[0]],
      programChecks: [{
        id: "P2-CONFLICT",
        type: "data_conflict",
        title: "P2 — Assessment count needs confirmation",
        detail: "Underlying evidence and the KPI table report 158; the activities narrative reports 160.",
        action: "Use 158 or explain.",
        owner: "Program",
        severity: "review",
        sources: [programSource],
        resolution: "open",
        status: "review",
        evidenceBackedValue: "158"
      }]
    };

    expect(buildProgramInsights(combinedResult).find((item) => item.id === "housing-assessments")).toMatchObject({
      value: "158 of 270",
      status: "Needs confirmation"
    });
  });

  it("uses direct KPI evidence ahead of a broad narrative sentence and isolates the retention target", () => {
    const combinedRequirement = requirement(
      "R-COMBINED-KPIS",
      "Achieve cumulative targets of 300 households served, 270 completed assessments (90%), 180 stable placements (60%), 80% 120-day retention among placed households, 240 benefits screenings, and average satisfaction of at least 4.3/5."
    );
    const evidenceSource = { sourceName: "04_Benefits_Screening_Records_Interim1.xlsx", locator: "Summary", excerpt: "139 benefits screenings" };
    const resultWithBroadNarrative: CompilationResult = {
      ...result,
      requirements: [combinedRequirement],
      programChecks: [],
      narrative: [
        statement("BROAD", "The program placed 98 households and completed benefits screenings for 139 households; 40 of 49 eligible households remained housed at 120 days."),
        { ...statement("evidence-p5-result", "The underlying records document that the program completed 139 benefits screenings."), evidenceType: "source_fact", source: evidenceSource }
      ]
    };

    const insights = buildProgramInsights(resultWithBroadNarrative);
    expect(insights.find((item) => item.id === "benefits-screenings")).toMatchObject({ value: "139 of 240" });
    expect(insights.find((item) => item.id === "housing-retention")).toMatchObject({ value: "81.6% · target 80%", status: "Target achieved" });
  });

  it("prefers a finalized survey actual over an earlier target-valued satisfaction statement", () => {
    const satisfactionResult: CompilationResult = {
      ...result,
      requirements: [requirement("R-P6", "P6 Average client satisfaction: target at least 4.3 out of 5.")],
      programChecks: [],
      narrative: [
        { ...statement("P6-TARGET", "Average client satisfaction has an award target of 4.3 out of 5."), evidenceType: "program_response" },
        { ...statement("evidence-p6-satisfaction", "Average client satisfaction was 4.4 out of 5 across 80 valid responses."), evidenceType: "source_fact", source: { sourceName: "05_Client_Satisfaction_Survey_Interim1.xlsx", locator: "Survey Results", excerpt: "Average score 4.4; target 4.3" } }
      ]
    };

    expect(buildProgramInsights(satisfactionResult).find((item) => item.id === "client-satisfaction")).toMatchObject({ value: "4.4 of 5 · target 4.3", status: "Target achieved" });
  });

  it("recognizes a hyphenated client-satisfaction requirement as the P6 target", () => {
    const satisfactionResult: CompilationResult = {
      ...result,
      requirements: [requirement("R-P6-HYPHEN", "Achieve an average client-satisfaction rating of at least 4.3 out of 5.0; report this at each interim and final report.")],
      programChecks: [],
      narrative: [{ ...statement("evidence-p6-satisfaction", "Average client satisfaction was 4.4 out of 5 across 80 valid responses."), evidenceType: "source_fact" }]
    };

    expect(buildProgramInsights(satisfactionResult).find((item) => item.id === "client-satisfaction")).toMatchObject({ value: "4.4 of 5 · target 4.3", status: "Target achieved" });
  });

  it("isolates P3 and P6 targets when adjacent KPI clauses appear first", () => {
    const mixedResult: CompilationResult = {
      ...result,
      requirements: [
        requirement("R-P4-FIRST", "Maintain stable housing for at least 80% of placed households for 120 days after placement."),
        requirement("R-P3-SECOND", "Secure stable housing placements for at least 180 households (60% of households served)."),
        requirement("R-P5-P6", "Complete public-benefits screening for at least 240 households and achieve average client satisfaction of at least 4.3 out of 5.0.")
      ],
      programChecks: [],
      narrative: [
        statement("N-P3", "The program secured 98 stable-housing placements."),
        statement("N-P5", "The program completed 139 benefits screenings."),
        { ...statement("evidence-p6-satisfaction", "Average client satisfaction was 4.4 out of 5 across 80 valid responses."), evidenceType: "source_fact" }
      ]
    };
    const insights = buildProgramInsights(mixedResult);

    expect(insights.find((item) => item.id === "housing-placements")).toMatchObject({ value: "98 of 180", detail: expect.stringContaining("54.4%") });
    expect(insights.find((item) => item.id === "client-satisfaction")).toMatchObject({ value: "4.4 of 5 · target 4.3", status: "Target achieved" });
  });

  it("prefers the P4 percentage rule over a separate P4 evidence-list requirement", () => {
    const mixedResult: CompilationResult = {
      ...result,
      requirements: [
        requirement("R-P4-EVIDENCE", "P4 requires 120-day follow-up records for every reported result."),
        requirement("R-P4-TARGET", "Maintain stable housing for 120 days for at least 80% of placed households.")
      ],
      programChecks: [],
      narrative: [statement("N-P4", "Follow-up records confirm 40 of 49 eligible placed households remained stably housed at 120 days.")]
    };

    expect(buildProgramInsights(mixedResult).find((item) => item.id === "housing-retention")).toMatchObject({
      value: "81.6% · target 80%",
      status: "Target achieved"
    });
  });

  it("accounts for all six KPIs when P2 conflicts and placement and retention use natural report wording", () => {
    const withConflict: CompilationResult = {
      ...result,
      requirements: [requirement("R-KPIS", "P1 target 300 households served; P2 target 270 assessments; P3 target 180 housing placements; P4 target at least 80% at 120 days; P5 target 240 benefits screenings; P6 target at least 4.3 out of 5.")],
      narrative: [
        statement("N-ALL", "The program reported serving 172 unduplicated households, completing 158 housing-stability assessments, securing 98 stable-housing placements, completing 139 benefits screenings, and documenting 120-day housing stability for 40 of 49 eligible placed households."),
        { ...statement("evidence-p6-satisfaction", "Average client satisfaction was 4.4 out of 5 across 80 valid responses."), evidenceType: "source_fact" }
      ],
      programChecks: [{ id: "P2-CONFLICT", type: "data_conflict", title: "P2 — Assessment count needs confirmation", detail: "The KPI table and evidence report 158; the activities narrative reports 160.", action: "Use 158 or explain.", owner: "Program", severity: "review", sources: [programSource], resolution: "open", status: "review", evidenceBackedValue: "158", evidenceSatisfiedBy: ["evidence-p2"] }]
    };

    const insights = buildProgramInsights(withConflict);
    expect(insights.filter((item) => ["households-served", "housing-assessments", "housing-placements", "housing-retention", "benefits-screenings", "client-satisfaction"].includes(item.id))).toHaveLength(6);
    expect(buildProgramReadiness(withConflict)).toEqual({ ready: 5, conflicts: 1, awaitingConfirmation: 0 });
  });

  it("does not confuse a P2 numerator with the P1 target when both share one unlabelled clause", () => {
    const sharedRequirement = requirement("R-SHARED", "At least 270 of 300 unduplicated households served will complete structured housing stability assessments.");
    const sharedResult: CompilationResult = {
      ...result,
      requirements: [
        sharedRequirement,
        requirement("R-P3", "180 households are placed into stable housing."),
        requirement("R-P4", "At least 80% remain stably housed at 120 days."),
        requirement("R-P5", "240 households complete benefits screenings.")
      ],
      programChecks: [],
      narrative: [narrative[0], narrative[1]]
    };
    const insights = buildProgramInsights(sharedResult);
    expect(insights.find((item) => item.id === "households-served")?.value).toBe("172 of 300");
    expect(insights.find((item) => item.id === "housing-assessments")?.value).toBe("158 of 270");
  });

  it("isolates unlabelled P1 and P4 clauses from the production award wording", () => {
    const productionWording: CompilationResult = {
      ...result,
      requirements: [
        requirement("R-P2", "Complete documented housing stability assessments for at least 270 households (90% of households served)."),
        requirement("R-P1", "Serve at least 300 unduplicated households during the 18-month grant period."),
        requirement("R-P4", "Maintain stable housing for at least 80% of placed households for 120 days after placement, supported by follow-up records.")
      ],
      narrative: [
        statement("P1", "The program served 172 unduplicated households."),
        statement("P2", "The program completed 158 housing stability assessments."),
        statement("P4", "Follow-up records confirm 40 of 49 eligible placed households remained stably housed at 120 days.")
      ],
      programChecks: []
    };
    const insights = buildProgramInsights(productionWording);
    expect(insights.find((item) => item.id === "households-served")).toMatchObject({ value: "172 of 300", detail: expect.stringContaining("57.3%") });
    expect(insights.find((item) => item.id === "housing-retention")).toMatchObject({ value: "81.6% · target 80%", status: "Target achieved" });
  });

  it("keeps unlabelled placement and retention targets isolated in one combined award clause", () => {
    const combinedProductionWording: CompilationResult = {
      ...result,
      requirements: [requirement("R-COMBINED-PRODUCTION", "Achieve the six program targets: serve 300 unduplicated households; complete assessments for 270 households (90% served); place 180 households (60% served); maintain 80% of placed households at 120 days; complete benefits screening for 240 households; and achieve average satisfaction of at least 4.3/5.0.")],
      narrative: [
        statement("P3", "The program secured 98 stable-housing placements."),
        statement("P4", "Follow-up records confirm 40 of 49 eligible placed households remained stably housed at 120 days.")
      ],
      programChecks: []
    };

    const insights = buildProgramInsights(combinedProductionWording);
    expect(insights.find((item) => item.id === "housing-placements")).toMatchObject({ value: "98 of 180", detail: expect.stringContaining("54.4%") });
    expect(insights.find((item) => item.id === "housing-retention")).toMatchObject({ value: "81.6% · target 80%", status: "Target achieved" });
  });
});

function statement(id: string, text: string): NarrativeStatement {
  return { id, text, evidenceType: "program_response", source: programSource, status: "verified" };
}

function requirement(id: string, text: string) {
  return { id, requirement: text, source: { ...awardSource, excerpt: text }, confidence: 0.99, status: "verified" as const };
}
