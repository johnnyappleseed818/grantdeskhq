import { describe, expect, it } from "vitest";
import { buildContactEnrichmentRecord, createTopicalShadowDraft, type SuppressionCheck } from "../lib/contactEnrichment";
import { firstTwoShadowContactEnrichmentCandidates } from "../data/gtmContactEnrichmentTargets";
import { partnerTargets } from "../../server/contactEnrichmentBatch";
import { normalizePartnerDiscovery } from "../../server/gtmPartnerDiscovery";

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

describe("bounded Partner replenishment inventory", () => {
  it("keeps official published Partner emails as authoritative contact evidence instead of requiring Finder", () => {
    const candidates = partnerTargets();
    const total = candidates.find((candidate) => candidate.target.organization === "Total Accounting Tax and Payroll");
    const future = candidates.find((candidate) => candidate.target.organization === "Future Focused Solutions");
    expect(total?.target.person.fullName).toBe("DeAndrea Levias");
    expect(future?.target.person.fullName).toBe("Andrew Minck");
    expect(total?.publishedEmail).toBe("dlevias@gotatp.com");
    expect(future?.publishedEmail).toBe("andrew.minck@ffsnonprofits.com");
  });

  it("removes known/prior-contact Partner domains before enrichment and retains a named public decision maker", () => {
    const scan = normalizePartnerDiscovery({ candidates: [
      { organization: "Prior Contact", organizationDomain: "prior.example", organizationUrl: "https://prior.example", sourceUrl: "https://prior.example/team", partnerType: "nonprofit accounting", whyFit: "Nonprofit accounting practice", contact: { firstName: "Prior", lastName: "Person", fullName: "Prior Person", title: "Founder", titleSourceUrl: "https://prior.example/team" } },
      { organization: "New Partner", organizationDomain: "new.example", organizationUrl: "https://new.example", sourceUrl: "https://new.example/services", partnerType: "nonprofit fractional CFO", whyFit: "Dedicated nonprofit finance and grant compliance practice", contact: { firstName: "New", lastName: "Person", fullName: "New Person", title: "Managing Partner", titleSourceUrl: "https://new.example/team" }, publicEmail: "new@new.example" }
    ] }, { knownDomains: [], priorContactDomains: ["prior.example"] }, "2026-08-24T00:00:00.000Z");
    expect(scan.priorContactRemoved).toBe(1);
    expect(scan.opportunities).toHaveLength(1);
    expect(partnerTargets(scan.opportunities)[0]).toMatchObject({ target: { organization: "New Partner", person: { currentTitle: "Managing Partner" } }, publishedEmail: "new@new.example" });
  });
});
