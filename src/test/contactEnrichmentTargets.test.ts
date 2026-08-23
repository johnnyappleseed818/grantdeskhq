import { describe, expect, it } from "vitest";
import { buildContactEnrichmentRecord, createTopicalShadowDraft, type SuppressionCheck } from "../lib/contactEnrichment";
import { firstTwoShadowContactEnrichmentCandidates } from "../data/gtmContactEnrichmentTargets";

const unknownSuppression: SuppressionCheck = {
  status: "UNKNOWN",
  reasons: ["A verified direct business email is required before suppression history can be checked."],
  checkedAt: "2026-08-16T00:00:00.000Z",
  sourcesChecked: []
};

describe("first-two real contact-enrichment SHADOW fixtures", () => {
  it("retains only authoritative role and award sources, creates no email, and remains not ready without a provider result", () => {
    expect(firstTwoShadowContactEnrichmentCandidates.map((candidate) => candidate.target.person.fullName)).toEqual(["Justin Paige", "David Chimahusky"]);
    for (const candidate of firstTwoShadowContactEnrichmentCandidates) {
      expect(candidate.target.domainSourceUrl).toMatch(/^https:\/\//);
      expect(candidate.target.person.titleSourceUrl).toMatch(/^https:\/\//);
      expect(candidate.award.sourceUrl).toMatch(/^https:\/\/www\.usaspending\.gov\/award\//);
      const record = buildContactEnrichmentRecord(candidate.target, [], unknownSuppression, "2026-08-16T00:00:00.000Z");
      const draft = createTopicalShadowDraft(candidate.award);
      expect(record.email).toBeUndefined();
      expect(record.readiness).toBe("CONTACT_NOT_ESTABLISHED");
      expect(record.readyForHumanApproval).toBe(false);
      expect(draft.subject).toBe("Save time preparing grant reports");
      expect(draft.body).toContain("https://grantdeskhq.com/assessment");
    }
  });
});
