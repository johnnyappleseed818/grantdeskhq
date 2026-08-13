// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyDeterministicProgramSourceFacts, extractDocxParagraphs } from "../../server/programSourceNormalization";
import { prototypeFixture } from "../data/prototypeFixture";
import { buildReportAttention } from "../lib/reportAttention";
import type { CompilationResult } from "../types/prototype";
import { fixtureCompilerFile } from "./northstarRegression";

describe("deterministic Program Update normalization", () => {
  it("recovers the exact notification requirement from the award when model output omits it", () => {
    const program = fixtureCompilerFile("GrantDeskHQ_Synthetic_Program_Update_Interim_Report_1.docx", "programUpdate");
    const award = fixtureCompilerFile("GrantDeskHQ_Synthetic_Grant_Agreement_Test_2.docx", "awardAgreement");
    const base: CompilationResult = { ...prototypeFixture, requirements: [], narrative: [], programChecks: [] };

    const normalized = applyDeterministicProgramSourceFacts(
      { organizationName: "BridgeWorks", grantName: "Northstar", reportingPeriod: "2027-02-01 to 2027-07-31", files: [award, program] },
      base
    );
    const requirement = normalized.requirements.find((item) => /program director/i.test(item.requirement) && /after becoming aware/i.test(item.requirement));
    const notice = normalized.programChecks?.find((check) => check.id === "deterministic-program-director-notification");

    expect(requirement).toMatchObject({
      status: "verified",
      source: { sourceName: award.name, locator: "Section 13 — Material Incident and Change Notification" }
    });
    expect(requirement?.confidence).toBeGreaterThanOrEqual(0.99);
    expect(notice).toMatchObject({ type: "award_trigger", severity: "review", resolution: "open", status: "verified" });
    expect(`${notice?.title} ${notice?.detail} ${notice?.action}`).toMatch(/awareness date|date.*aware/i);
    expect(buildReportAttention(normalized).map((item) => item.id)).toContain("program-deterministic-program-director-notification");
  });

  it("preserves the P2 conflict and leadership-notification issue from the actual DOCX when model output omits them", () => {
    const program = fixtureCompilerFile("GrantDeskHQ_Synthetic_Program_Update_Interim_Report_1.docx", "programUpdate");
    const award = fixtureCompilerFile("GrantDeskHQ_Synthetic_Grant_Agreement_Test_2.docx", "awardAgreement");
    const awardRequirement = {
      ...prototypeFixture.requirements[0],
      id: "PROGRAM-DIRECTOR-NOTICE",
      requirement: "Notify the Fund within five business days of a change in Program Director.",
      status: "verified" as const
    };
    const base: CompilationResult = { ...prototypeFixture, requirements: [awardRequirement], narrative: [], programChecks: [] };

    const paragraphs = extractDocxParagraphs(program);
    expect(paragraphs).toContain("The Program Director resigned effective June 10, 2027. BridgeWorks notified Northstar Community Fund of the leadership change on June 14, 2027. Jordan Ellis was appointed Interim Program Director effective June 15, 2027. No interruption in participant services occurred, and the organization began recruitment for a permanent Program Director in July.");

    const normalized = applyDeterministicProgramSourceFacts({ organizationName: "BridgeWorks", grantName: "Northstar", reportingPeriod: "2027-02-01 to 2027-07-31", files: [award, program] }, base);
    const p2 = normalized.programChecks?.find((check) => check.id === "deterministic-p2-assessment-conflict");
    expect(p2).toMatchObject({ type: "data_conflict", resolution: "open", status: "verified" });
    expect(`${p2?.detail} ${p2?.action}`).toMatch(/158.*160|160.*158/);
    const notice = normalized.programChecks?.find((check) => check.id === "deterministic-program-director-notification");
    expect(notice).toMatchObject({ type: "award_trigger", severity: "review", resolution: "open", status: "verified" });
    expect(`${notice?.title} ${notice?.detail}`).toMatch(/awareness date|date.*aware/i);
    expect(normalized.requirements[0]).toMatchObject({ status: "verified", source: { sourceName: award.name } });
    expect(normalized.requirements[0].requirement).toMatch(/after becoming aware/i);
    expect(normalized.narrative.some((item) => /satisfaction-survey dataset remains under validation/i.test(item.text))).toBe(true);
    expect(buildReportAttention(normalized).map((item) => item.id)).toEqual(expect.arrayContaining([
      "program-deterministic-p2-assessment-conflict",
      "program-deterministic-program-director-notification"
    ]));
  });

  it("replaces a model-supplied satisfied leadership conclusion when the awareness date is not established", () => {
    const program = fixtureCompilerFile("GrantDeskHQ_Synthetic_Program_Update_Interim_Report_1.docx", "programUpdate");
    const award = fixtureCompilerFile("GrantDeskHQ_Synthetic_Grant_Agreement_Test_2.docx", "awardAgreement");
    const awardRequirement = {
      ...prototypeFixture.requirements[0],
      id: "PROGRAM-DIRECTOR-NOTICE",
      requirement: "Notify the Fund within five business days of a change in Program Director.",
      status: "verified" as const
    };
    const modelConclusion = {
      id: "model-program-director-notification",
      type: "award_trigger" as const,
      title: "Program Director change reported on time",
      detail: "The change occurred June 10 and the Fund was notified June 14.",
      action: "No action needed.",
      owner: "Grants" as const,
      severity: "info" as const,
      sources: [prototypeFixture.narrative[0].source, awardRequirement.source],
      resolution: "open" as const,
      status: "verified" as const
    };
    const base: CompilationResult = {
      ...prototypeFixture,
      requirements: [awardRequirement],
      narrative: [],
      programChecks: [modelConclusion]
    };

    const normalized = applyDeterministicProgramSourceFacts(
      { organizationName: "BridgeWorks", grantName: "Northstar", reportingPeriod: "2027-02-01 to 2027-07-31", files: [award, program] },
      base
    );
    const noticeChecks = normalized.programChecks?.filter((check) => check.type === "award_trigger" && /program director|leadership/i.test(`${check.title} ${check.detail}`)) || [];

    expect(noticeChecks).toHaveLength(1);
    expect(noticeChecks[0]).toMatchObject({ severity: "review", resolution: "open", status: "verified" });
    expect(`${noticeChecks[0].title} ${noticeChecks[0].detail} ${noticeChecks[0].action}`).toMatch(/awareness date|date.*aware/i);
    expect(buildReportAttention(normalized).map((item) => item.id)).toContain("program-deterministic-program-director-notification");
  });

  it("replaces a vague model P2 conflict with the exact 158-versus-160 source conflict", () => {
    const program = fixtureCompilerFile("GrantDeskHQ_Synthetic_Program_Update_Interim_Report_1.docx", "programUpdate");
    const base: CompilationResult = {
      ...prototypeFixture,
      narrative: [],
      programChecks: [{
        id: "model-p2-conflict",
        type: "data_conflict",
        title: "P2 assessment result needs review",
        detail: "The supplied assessment count differs across sources.",
        action: "Confirm the assessment count.",
        owner: "Program",
        severity: "review",
        sources: [prototypeFixture.narrative[0].source],
        resolution: "open",
        status: "verified"
      }]
    };

    const normalized = applyDeterministicProgramSourceFacts(
      { organizationName: "BridgeWorks", grantName: "Northstar", reportingPeriod: "2027-02-01 to 2027-07-31", files: [program] },
      base
    );
    const p2 = normalized.programChecks?.find((check) => check.id === "deterministic-p2-assessment-conflict");

    expect(p2).toMatchObject({ type: "data_conflict", severity: "review", resolution: "open" });
    expect(`${p2?.detail} ${p2?.action}`).toMatch(/158.*160|160.*158/);
    expect(normalized.programChecks?.some((check) => check.id === "model-p2-conflict")).toBe(false);
  });
});
