import { afterEach, describe, expect, it, vi } from "vitest";
import { awardDiscoveryCriteria, awardIsActiveOn, awardStartsAfter, awardTiming, runDailyAwardScan, toOpportunity } from "../../server/gtmAwardScanner";
import { assessOpportunityAccuracy } from "../lib/gtm";

afterEach(() => {
  delete process.env.GTM_AWARD_WINDOW_DAYS;
  delete process.env.GTM_SCAN_START_DATE;
  delete process.env.GTM_MINIMUM_AWARD;
  delete process.env.GTM_AWARD_PAGE_SIZE;
  delete process.env.GTM_AWARD_MAX_PAGES;
  delete process.env.GTM_AWARD_MAX_CANDIDATES;
  delete process.env.GTM_AWARD_ACTIVE_LOOKBACK_DAYS;
  delete process.env.GTM_AWARD_SPENDDOWN_WINDOW_DAYS;
  vi.unstubAllGlobals();
});

describe("federal grant discovery criteria", () => {
  it("uses the expanded bounded default scan", () => {
    expect(awardDiscoveryCriteria("2026-08-10", {})).toEqual({
      startDate: "2026-05-12",
      endDate: "2026-08-10",
      activeStartDate: "2024-08-10",
      activeLookbackDays: 730,
      spenddownWindowDays: 120,
      checkpointStartDate: null,
      incremental: false,
      overlapDays: 7,
      minimumAward: 25_000,
      recipientTypes: ["Nonprofit Organization"],
      awardTypes: ["02", "03", "04", "05"],
      pageSize: 100,
      maxPages: 5,
      maxCandidates: 500
    });
  });

  it("bounds operator-provided values", () => {
    expect(awardDiscoveryCriteria("2026-08-10", {
      GTM_AWARD_WINDOW_DAYS: "999",
      GTM_MINIMUM_AWARD: "10",
      GTM_AWARD_PAGE_SIZE: "1000",
      GTM_AWARD_MAX_PAGES: "100",
      GTM_AWARD_MAX_CANDIDATES: "9999",
      GTM_AWARD_ACTIVE_LOOKBACK_DAYS: "9999"
    })).toMatchObject({ startDate: "2025-08-10", activeStartDate: "2021-08-11", activeLookbackDays: 1825, minimumAward: 1_000, pageSize: 100, maxPages: 10, maxCandidates: 500 });
  });

  it("resumes from the persisted scan checkpoint with a bounded amendment overlap", () => {
    expect(awardDiscoveryCriteria("2026-08-10", {}, "2026-08-07T15:00:00.000Z")).toMatchObject({
      startDate: "2026-07-31",
      endDate: "2026-08-10",
      checkpointStartDate: "2026-08-07",
      incremental: true,
      overlapDays: 7
    });
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

  it("defers a source response whose displayed award start is after the scan end date", () => {
    expect(awardStartsAfter({ "Start Date": "2027-06-01" }, "2026-10-05")).toBe(true);
    expect(awardStartsAfter({ "Start Date": "2026-10-05" }, "2026-10-05")).toBe(false);
    expect(awardStartsAfter({ "Start Date": undefined }, "2026-10-05")).toBe(false);
  });

  it("retains active and near-end awards without treating a date as a reporting deadline", () => {
    expect(awardIsActiveOn({ "Start Date": "2025-04-01", "End Date": "2027-04-01" }, "2026-10-05")).toBe(true);
    expect(awardIsActiveOn({ "Start Date": "2025-04-01", "End Date": "2026-10-04" }, "2026-10-05")).toBe(false);
    expect(awardTiming({ "Start Date": "2025-04-01", "End Date": "2026-11-10" }, "2026-10-05", 90)).toBe("SPENDDOWN");
    expect(awardTiming({ "Start Date": "2025-04-01", "End Date": "2027-04-01" }, "2026-10-05", 90)).toBe("ACTIVE");
    expect(awardTiming({ "Start Date": "2024-04-01", "End Date": "2025-04-01" }, "2026-10-05", 90)).toBe("RECENT");
  });

  it("combines recent and bounded active windows while excluding future and ended awards from the active pass", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ results: [base], page_metadata: { hasNext: false } }))
      .mockResolvedValueOnce(Response.json({ results: [
        { ...base, "Award ID": "ACTIVE-NEAR-END", generated_internal_id: "ASST_ACTIVE_NEAR_END", "Start Date": "2025-04-01", "End Date": "2026-11-10" },
        { ...base, "Award ID": "ENDED", generated_internal_id: "ASST_ENDED", "Start Date": "2025-04-01", "End Date": "2026-10-04" },
        { ...base, "Award ID": "FUTURE", generated_internal_id: "ASST_FUTURE", "Start Date": "2027-01-01", "End Date": "2028-01-01" }
      ], page_metadata: { hasNext: false } }));
    vi.stubGlobal("fetch", fetchMock);

    const scan = await runDailyAwardScan(new Date("2026-10-05T07:00:00.000Z"), null, {
      GTM_AWARD_PAGE_SIZE: "100", GTM_AWARD_MAX_PAGES: "1", GTM_AWARD_MAX_CANDIDATES: "50", GTM_AWARD_SPENDDOWN_WINDOW_DAYS: "90"
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const recentRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const activeRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(recentRequest.filters.time_period[0]).toEqual({ start_date: "2026-07-07", end_date: "2026-10-05" });
    expect(activeRequest.filters.time_period[0]).toEqual({ start_date: "2024-10-05", end_date: "2026-10-05" });
    expect(scan).toMatchObject({ recordsChecked: 4, newAwardCount: 2, activeAwardCount: 2, spenddownAwardCount: 1, inactiveAwardCount: 1, futureDatedCount: 1 });
    expect(scan.opportunities.find((item) => item.id.includes("active-near-end"))?.headline).toMatch(/near-end reporting period/i);
  });
});
