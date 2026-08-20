import { describe, expect, it } from "vitest";
import { FULL_FUNNEL_STAGES, PARTNER_ICP_TYPES, PRODUCT_LED_ABANDONMENT_ACTIONS, canRouteToColdCampaign, scoreGrantComplexity } from "../lib/gtmExpansion";
import { confirmedHumanOutreach } from "../lib/gtmOutreach";
import { initialOpportunities } from "../data/gtmData";

describe("GTM V2 incremental expansion model", () => {
  it("supports every requested additional ICP without creating a prospect record", () => {
    expect(PARTNER_ICP_TYPES).toEqual(expect.arrayContaining(["FISCAL_SPONSOR", "COMMUNITY_FOUNDATION_FUNDER_INTERMEDIARY", "NONPROFIT_ASSOCIATION", "ACCOUNTING_IMPLEMENTATION_PARTNER", "NONPROFIT_OPERATIONS_COMPLIANCE_CONSULTANT"]));
  });

  it("scores only known complexity inputs and leaves missing inputs explicit", () => {
    const scored = scoreGrantComplexity({ activeRecentAwardCount: 3, federalFunding: true, reportingComplexity: "HIGH", grantFinanceHiring: true, recentGrantActivity: true, contactability: "VERIFIED" });
    expect(scored.decision).toBe("EMAIL_NOW");
    expect(scored.contributingSignals).toEqual(expect.arrayContaining(["multiple active/recent awards", "federal funding", "reporting complexity", "grant or finance hiring"]));
    expect(scored.unknownInputs).toContain("multiple funders");
    expect(scoreGrantComplexity({}).decision).toBe("VERIFY");
  });

  it("keeps cold outreach distinct from customer lifecycle and preserves organization dedupe", () => {
    const contacted = initialOpportunities.find((item) => item.organization === "Junior Achievement of South Florida")!;
    expect(canRouteToColdCampaign({ emailLane: "COLD_OUTREACH_INSTANTLY", currentStage: "CAMPAIGN_ROUTING" }, contacted, confirmedHumanOutreach)).toBe(false);
    expect(canRouteToColdCampaign({ emailLane: "TRANSACTIONAL_CUSTOMER", currentStage: "CAMPAIGN_ROUTING" }, initialOpportunities[1], confirmedHumanOutreach)).toBe(false);
  });

  it("models the entire acquisition flow and product-led conversion actions without inferring activity", () => {
    expect(FULL_FUNNEL_STAGES).toEqual(expect.arrayContaining(["SIGNAL", "ORGANIZATION_DEDUPE", "SUPPRESSION", "INITIAL_EMAIL", "FREE_FIRST_AWARD_STARTED", "DRAFT_GENERATED", "PAID", "EXPANSION_REFERRAL"]));
    expect(PRODUCT_LED_ABANDONMENT_ACTIONS.DRAFT_GENERATED).toMatch(/paid status is not/i);
  });
});

