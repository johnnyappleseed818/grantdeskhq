import { afterEach, describe, expect, it } from "vitest";
import { awardDiscoveryCriteria, toOpportunity } from "../../server/gtmAwardScanner";
import { assessOpportunityAccuracy } from "../lib/gtm";

afterEach(() => {
  delete process.env.GTM_AWARD_WINDOW_DAYS;
  delete process.env.GTM_SCAN_START_DATE;
  delete process.env.GTM_MINIMUM_AWARD;
  delete process.env.GTM_AWARD_PAGE_SIZE;
  delete process.env.GTM_AWARD_MAX_PAGES;
  delete process.env.GTM_AWARD_MAX_CANDIDATES;
});

describe("federal grant discovery criteria", () => {
  it("uses the expanded bounded default scan", () => {
    expect(awardDiscoveryCriteria("2026-08-10", {})).toEqual({
      startDate: "2026-05-12",
      endDate: "2026-08-10",
      minimumAward: 25_000,
      recipientTypes: ["Nonprofit Organization"],
      awardTypes: ["02", "03", "04", "05"],
      pageSize: 100,
      maxPages: 4,
      maxCandidates: 100
    });
  });

  it("bounds operator-provided values", () => {
    expect(awardDiscoveryCriteria("2026-08-10", {
      GTM_AWARD_WINDOW_DAYS: "999",
      GTM_MINIMUM_AWARD: "10",
      GTM_AWARD_PAGE_SIZE: "1000",
      GTM_AWARD_MAX_PAGES: "100",
      GTM_AWARD_MAX_CANDIDATES: "9999"
    })).toMatchObject({ startDate: "2025-08-10", minimumAward: 1_000, pageSize: 100, maxPages: 10, maxCandidates: 500 });
  });
});

describe("award candidate classification", () => {
  const base = {
    "Award ID": "FAIN-100",
    "Recipient Name": "COMMUNITY ACTION NETWORK",
    "Award Amount": 75_000,
    Description: "Workforce services for community participants across multiple sites.",
    "Start Date": "2026-08-01",
    "End Date": "2027-07-31",
    "Awarding Agency": "Department of Labor",
    "Assistance Listing": { cfda_number: "17.000", program_title: "Employment services" },
    generated_internal_id: "ASST_NON_FAIN-100"
  };

  it("keeps smaller nonprofit awards as emerging research candidates", () => {
    const candidate = toOpportunity(base, "2026-08-10");
    expect(candidate).toMatchObject({ targetTier: "emerging", amount: 75_000, entityVerified: true, nonprofitVerified: true });
    expect(candidate.fitSignals).toContain("lower-cost entry candidate");
    expect(candidate.assistanceListing).toBe("17.000 — Employment services");
    expect(assessOpportunityAccuracy(candidate, "2026-08-10")).toMatchObject({ label: "blocked", readyForAction: false });
  });

  it("keeps university recipients visible as adjacent rather than excluding them", () => {
    const candidate = toOpportunity({ ...base, "Recipient Name": "NORTHSTAR UNIVERSITY", "Award Amount": 2_000_000 }, "2026-08-10");
    expect(candidate.targetTier).toBe("adjacent");
    expect(candidate.fitSignals).toContain("adjacent segment requiring fit verification");
  });

  it("classifies established nonprofit awards as core targets", () => {
    expect(toOpportunity({ ...base, "Award Amount": 250_000 }, "2026-08-10").targetTier).toBe("core");
  });
});
