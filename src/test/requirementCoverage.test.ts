// @vitest-environment node
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateComprehensiveRequirementCoverage } from "../../server/requirementCoverage";
import { prototypeFixture } from "../data/prototypeFixture";

describe("comprehensive obligation coverage evaluation", () => {
  it("recognizes every versioned obligation in the golden agreement", () => {
    const agreement = fs.readFileSync("src/test/fixtures/Comprehensive_Grant_Agreement.txt", "utf8");
    const result = {
      ...prototypeFixture,
      grantProfile: {
        ...prototypeFixture.grantProfile,
        grantId: { ...prototypeFixture.grantProfile.grantId, value: "CPF-2026-0417" },
        grantStartDate: { ...prototypeFixture.grantProfile.grantStartDate, value: "October 1, 2026" },
        grantEndDate: { ...prototypeFixture.grantProfile.grantEndDate, value: "September 30, 2027" },
        grantType: { ...prototypeFixture.grantProfile.grantType, value: "Restricted grant" }
      },
      requirements: [{
        id: "GOLDEN-001",
        requirement: agreement,
        source: { sourceName: "Comprehensive_Grant_Agreement.txt", locator: "Full synthetic agreement", excerpt: agreement },
        confidence: 1,
        status: "verified" as const
      }]
    };
    expect(evaluateComprehensiveRequirementCoverage(result)).toEqual({ score: 100, passed: 29, total: 29, missing: [] });
  });

  it("recognizes the complete budget set when canonical requirement ordering differs from source order", () => {
    const categories = [
      "Indirect Costs: $20,000",
      "Data and Evaluation: $30,000",
      "Local Travel: $20,000",
      "Participant Support: $48,000",
      "Training and Curriculum: $62,000",
      "Employee Benefits: $55,000",
      "Personnel: $245,000"
    ];
    const result = {
      ...prototypeFixture,
      requirements: categories.map((requirement, index) => ({
        id: `BUDGET-${index}`,
        requirement,
        source: { sourceName: "Comprehensive_Grant_Agreement.txt", locator: `Source clause ${index + 1}`, excerpt: requirement },
        confidence: 1,
        status: "verified" as const
      }))
    };
    expect(evaluateComprehensiveRequirementCoverage(result).missing).not.toContain("Seven budget categories");
  });
});
