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
});

function statement(id: string, text: string): NarrativeStatement {
  return { id, text, evidenceType: "program_response", source: programSource, status: "verified" };
}

function requirement(id: string, text: string) {
  return { id, requirement: text, source: { ...awardSource, excerpt: text }, confidence: 0.99, status: "verified" as const };
}
