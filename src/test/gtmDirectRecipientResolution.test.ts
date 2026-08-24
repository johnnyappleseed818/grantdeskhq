import { describe, expect, it } from "vitest";
import { applyRecipientResolutions, type RecipientDraft } from "../../server/gtmDirectRecipientResolution";
import type { GtmOpportunity } from "../lib/gtm";

const opportunity: GtmOpportunity = {
  id: "current-qualified", organization: "Example Action Network", organizationUrl: "https://example.org", signalKind: "job_posting", headline: "Grant finance hiring", observedAt: "2026-08-24", evidence: [{ id: "signal", title: "Grant finance job", url: "https://example.org/careers", observedAt: "2026-08-24", authority: "official", excerpt: "Grant reporting and budget-to-actual responsibility.", supports: ["signal"] }], score: { pain: 20, timing: 25, fit: 22, value: 14 }, entityVerified: true, nonprofitVerified: true, conflicts: [], unknowns: ["No appropriate named contact was found on an authoritative public source."], recommendedRoles: ["Finance Director"], whyNow: "A current grant finance role establishes a timing signal.", recommendedAngle: "Offer a first-award assessment.", emailSubject: "Save time preparing grant reports", draftMessage: "draft"
};

function draft(overrides: Partial<RecipientDraft> = {}): RecipientDraft {
  return { organization: opportunity.organization, officialOrganizationUrl: "https://example.org/about", recipientFound: true, contactName: "Alex Finance", contactTitle: "Director of Finance and Operations", roleSourceUrl: "https://example.org/team", responsibilityEvidence: "Oversees restricted funds, grant budgets, and grant compliance.", contactEmail: "alex.finance@example.org", contactEmailSourceUrl: "https://example.org/team", executiveFallbackReview: false, blocker: "", ...overrides };
}

describe("Direct recipient resolution", () => {
  it("uses an official published finance email without Hunter", () => {
    const result = applyRecipientResolutions([opportunity], [draft()], ["https://example.org/about", "https://example.org/team"], "2026-08-24T12:00:00.000Z");
    expect(result.opportunities[0].primaryContact).toMatchObject({ name: "Alex Finance", email: "alex.finance@example.org", emailKind: "direct" });
    expect(result.resolutions[0]).toMatchObject({ contactSource: "OFFICIAL_PUBLISHED", hunterUsed: false });
  });

  it("keeps an executive-only result in review rather than a Hunter-ready recipient", () => {
    const result = applyRecipientResolutions([opportunity], [draft({ contactTitle: "Executive Director", contactEmail: "", executiveFallbackReview: true, blocker: "No finance owner found." })], ["https://example.org/about", "https://example.org/team"], "2026-08-24T12:00:00.000Z");
    expect(result.opportunities[0].primaryContact).toBeUndefined();
    expect(result.resolutions[0].contactSource).toBe("EXECUTIVE_FALLBACK_REVIEW");
  });
});
