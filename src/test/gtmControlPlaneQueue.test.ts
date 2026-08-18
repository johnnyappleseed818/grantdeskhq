import { describe, expect, it } from "vitest";
import { reconcileControlPlaneQueue } from "../lib/gtmControlPlaneQueue";
import type { GtmOpportunity } from "../lib/gtm";

function opportunity(overrides: Partial<GtmOpportunity> = {}): GtmOpportunity {
  return {
    id: "award-example",
    organization: "Example Community Action, Inc.",
    signalKind: "grant_award",
    headline: "Recent federal award",
    observedAt: "2026-08-16",
    evidence: [{ id: "award", title: "Official award", url: "https://example.gov/award/1", observedAt: "2026-08-16", authority: "official", excerpt: "Public award", supports: ["recipient"] }],
    score: { pain: 20, timing: 25, fit: 24, value: 16 },
    entityVerified: true,
    nonprofitVerified: true,
    conflicts: [],
    unknowns: [],
    recommendedRoles: ["Chief financial officer"],
    whyNow: "A recent award is timely.",
    recommendedAngle: "Use public award timing only.",
    emailSubject: "A source-linked workflow",
    draftMessage: "A human-review-only source-linked draft.",
    ...overrides
  };
}

describe("GTM Control Plane queue reconciliation", () => {
  it("keeps every card in exactly one visible state and deduplicates only the repeated card", () => {
    const canonical = opportunity({
      primaryContact: { name: "Avery Finance", title: "Chief Financial Officer", email: "avery@example.org", emailKind: "direct", roleSourceUrl: "https://example.org/team", emailSourceUrl: "https://example.org/team", verifiedAt: "2026-08-16", note: "Published together." }
    });
    const duplicate = opportunity({ id: "award-example-repeat", organization: "Example Community Action Corporation" });
    const result = reconcileControlPlaneQueue({ cards: [canonical, duplicate], suppressionByEmail: { "avery@example.org": "CLEAR" }, draftOrganizations: ["Example Community Action"] });
    expect(result.uniqueOrganizations).toBe(1);
    expect(result.cards).toHaveLength(2);
    expect(result.cards.map((card) => card.state)).toEqual(["READY_FOR_HUMAN_REVIEW", "DUPLICATE"]);
    expect(Object.values(result.counts).reduce((total, count) => total + count, 0)).toBe(2);
  });

  it("preserves public direct routes without enrichment and fails closed when suppression is unavailable", () => {
    const result = reconcileControlPlaneQueue({ cards: [opportunity({
      primaryContact: { name: "Avery Finance", title: "Chief Financial Officer", email: "avery@example.org", emailKind: "direct", roleSourceUrl: "https://example.org/team", emailSourceUrl: "https://example.org/team", verifiedAt: "2026-08-16", note: "Published together." }
    })] });
    expect(result.cards[0]).toMatchObject({ directBusinessEmail: "avery@example.org", state: "SUPPRESSION_CHECK_REQUIRED" });
  });

  it("makes missing named contacts research work and named contacts without direct email enrichment work", () => {
    const withoutContact = opportunity();
    const withoutEmail = opportunity({ id: "named-no-email", organization: "Other Community Action", primaryContact: { name: "Jamie Grants", title: "Director of Grants", email: "info@other.org", emailKind: "organization_inbox", roleSourceUrl: "https://other.org/team", emailSourceUrl: "https://other.org/contact", verifiedAt: "2026-08-16", note: "Organization inbox only." } });
    const result = reconcileControlPlaneQueue({ cards: [withoutContact, withoutEmail] });
    expect(result.cards.map((card) => card.state)).toEqual(["CONTACT_RESEARCH_REQUIRED", "ENRICHMENT_READY"]);
  });

  it("never advances a blocked route and retains customer and prior-contact exclusions", () => {
    const direct = opportunity({ primaryContact: { name: "Avery Finance", title: "Chief Financial Officer", email: "avery@example.org", emailKind: "direct", roleSourceUrl: "https://example.org/team", emailSourceUrl: "https://example.org/team", verifiedAt: "2026-08-16", note: "Published together." } });
    expect(reconcileControlPlaneQueue({ cards: [direct], suppressionByEmail: { "avery@example.org": "BLOCKED" } }).cards[0].state).toBe("DISQUALIFIED");
    expect(reconcileControlPlaneQueue({ cards: [direct], customerOrganizations: ["Example Community Action"] }).cards[0].state).toBe("CUSTOMER");
    expect(reconcileControlPlaneQueue({ cards: [direct], alreadyContactedOrganizations: ["Example Community Action"] }).cards[0].state).toBe("ALREADY_CONTACTED");
  });

  it("keeps later source signals already contacted by canonical identity or known recipient email", () => {
    const byAlias = opportunity({ id: "later-oceanology", organization: "Interdistrict Committee for Project Oceanology", primaryContact: { name: "Lisa Colón", title: "Accounts Manager", email: "lmcolon@oceanology.org", emailKind: "direct", roleSourceUrl: "https://example.org/team", emailSourceUrl: "https://example.org/team", verifiedAt: "2026-08-18", note: "Existing public route." } });
    const byEmail = opportunity({ id: "later-rodale", organization: "Rodale Institute Foundation", primaryContact: { name: "Elaine Macbeth", title: "Finance leader", email: "elaine.macbeth@rodaleinstitute.org", emailKind: "direct", roleSourceUrl: "https://example.org/team", emailSourceUrl: "https://example.org/team", verifiedAt: "2026-08-18", note: "Existing public route." } });
    const result = reconcileControlPlaneQueue({ cards: [byAlias, byEmail], alreadyContactedOrganizations: ["Project Oceanology"], alreadyContactedEmails: ["elaine.macbeth@rodaleinstitute.org"] });
    expect(result.cards.map((card) => card.state)).toEqual(["ALREADY_CONTACTED", "ALREADY_CONTACTED"]);
  });

  it("selects a canonical source card deterministically and retains all repeated-source cards", () => {
    const alpha = opportunity({ id: "award-alpha", observedAt: "2026-08-15" });
    const zulu = opportunity({ id: "award-zulu", observedAt: "2026-08-16" });
    const reversed = reconcileControlPlaneQueue({ cards: [zulu, alpha] });
    const forward = reconcileControlPlaneQueue({ cards: [alpha, zulu] });

    for (const result of [reversed, forward]) {
      expect(result.uniqueOrganizations).toBe(1);
      expect(result.cards.find((card) => card.cardId === "award-alpha")).toMatchObject({ canonicalCardId: "award-alpha", state: "CONTACT_RESEARCH_REQUIRED" });
      expect(result.cards.find((card) => card.cardId === "award-zulu")).toMatchObject({ canonicalCardId: "award-alpha", state: "DUPLICATE" });
    }
  });

  it("reports explicit replenishment gaps without invoking enrichment or delivery", () => {
    const result = reconcileControlPlaneQueue({ cards: [opportunity()] });
    expect(result.replenishment).toEqual({
      sourceQualified: { actual: 1, threshold: 100, gap: 99 },
      enrichmentReady: { actual: 0, threshold: 50, gap: 50 },
      humanReview: { actual: 0, threshold: 25, gap: 25 },
      needsReplenishment: true
    });
  });
});
