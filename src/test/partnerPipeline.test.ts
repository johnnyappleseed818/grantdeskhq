import { describe, expect, it } from "vitest";
import { canonicalPartnerResearch, nextPartnerStage, partnerMayAdvanceToHumanApproval, summarizePartnerPipeline } from "../lib/partnerPipeline";

describe("canonical partner acquisition pipeline", () => {
  it("persists the factual public-source inventory and A/B/C/D classification counts", () => {
    expect(summarizePartnerPipeline()).toMatchObject({ mode: "SHADOW", researchedOrganizations: 10, relationshipClasses: { A: 7, B: 2, C: 1, D: 0 }, directBusinessEmailsEstablished: 0, suppressionNotChecked: 10, readyForHumanApproval: 0, outboundActions: 0 });
    expect(canonicalPartnerResearch.every((record) => record.officialSourceUrl.startsWith("https://") && !record.directBusinessEmailEstablished)).toBe(true);
  });
  it("routes C/D relationships to commercial review before any contact-related state", () => {
    expect(nextPartnerStage({ relationshipClass: "C", directBusinessEmailEstablished: true, suppression: "CLEAR" })).toBe("COMMERCIAL_REVIEW_REQUIRED");
    expect(nextPartnerStage({ relationshipClass: "D", directBusinessEmailEstablished: true, suppression: "CLEAR" })).toBe("COMMERCIAL_REVIEW_REQUIRED");
  });
  it("fails closed on suppression and only allows A/B records with a clear check and established direct business email", () => {
    expect(partnerMayAdvanceToHumanApproval({ relationshipClass: "A", directBusinessEmailEstablished: false, suppression: "CLEAR" })).toBe(false);
    expect(partnerMayAdvanceToHumanApproval({ relationshipClass: "B", directBusinessEmailEstablished: true, suppression: "UNKNOWN" })).toBe(false);
    expect(nextPartnerStage({ relationshipClass: "A", directBusinessEmailEstablished: true, suppression: "BLOCKED" })).toBe("SUPPRESSED");
    expect(partnerMayAdvanceToHumanApproval({ relationshipClass: "B", directBusinessEmailEstablished: true, suppression: "CLEAR" })).toBe(true);
  });
});
