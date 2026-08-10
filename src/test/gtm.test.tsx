import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { initialOpportunities } from "../data/gtmData";
import { GtmDashboardContent } from "../pages/GtmDashboardPage";
import {
  assessOpportunityAccuracy,
  canMoveToContacted,
  findDuplicateOpportunities,
  rankGtmOpportunities,
  scoreOpportunity,
  type AwardDiscoveryScan,
  type GtmOpportunity
} from "../lib/gtm";
import type { DailySocialScan } from "../lib/gtm";

beforeEach(() => localStorage.clear());

describe("GTM opportunity accuracy", () => {
  it("caps the transparent scoring components at 100", () => {
    expect(scoreOpportunity({ pain: 200, timing: 200, fit: 200, value: 200 })).toBe(100);
    expect(scoreOpportunity({ pain: -3, timing: 10, fit: 10, value: 10 })).toBe(30);
  });

  it("requires corroboration before assigning very-high intent", () => {
    const corroborated = initialOpportunities.find((item) => item.id === "job-ja-south-florida-2026")!;
    expect(assessOpportunityAccuracy(corroborated)).toMatchObject({ score: 96, label: "very_high", readyForAction: true, confidence: "high" });

    const oneSource = initialOpportunities.find((item) => item.id === "job-rodale-2026")!;
    expect(assessOpportunityAccuracy(oneSource).score).toBe(91);
    expect(assessOpportunityAccuracy(oneSource).label).toBe("high");
    expect(assessOpportunityAccuracy(oneSource).warnings.join(" ")).toMatch(/one source/i);
  });

  it("blocks unresolved entities and conflicting evidence", () => {
    const base = initialOpportunities[0];
    const unresolved: GtmOpportunity = { ...base, id: "unresolved", entityVerified: false, conflicts: ["two award amounts disagree"] };
    const accuracy = assessOpportunityAccuracy(unresolved);
    expect(accuracy.readyForAction).toBe(false);
    expect(accuracy.label).toBe("blocked");
    expect(accuracy.blockers.join(" ")).toMatch(/identity.*not been resolved/i);
    expect(accuracy.blockers.join(" ")).toMatch(/award amounts disagree/i);
  });

  it("blocks outreach when the recipient email has not been verified", () => {
    const withoutContact: GtmOpportunity = { ...initialOpportunities[0], id: "missing-contact", primaryContact: undefined };
    const accuracy = assessOpportunityAccuracy(withoutContact);
    expect(accuracy.readyForAction).toBe(false);
    expect(accuracy.blockers.join(" ")).toMatch(/named recipient and verified email/i);
  });

  it("keeps verified action-ready leads above unverified research candidates", () => {
    const candidate: GtmOpportunity = { ...initialOpportunities[0], id: "research-candidate", primaryContact: undefined };
    const ranked = rankGtmOpportunities([candidate, initialOpportunities[0]]);
    expect(ranked[0].id).toBe(initialOpportunities[0].id);
    expect(ranked[1].id).toBe("research-candidate");
  });

  it("detects duplicate organization signals without silently merging them", () => {
    const source = initialOpportunities[0];
    const duplicate = { ...source, id: "duplicate-id" };
    expect(findDuplicateOpportunities([source, duplicate])).toEqual([{ duplicateId: "duplicate-id", originalId: source.id }]);
  });

  it("does not allow a lead to be marked contacted before review approval", () => {
    const accuracy = assessOpportunityAccuracy(initialOpportunities[2]);
    expect(canMoveToContacted("new", accuracy)).toBe(false);
    expect(canMoveToContacted("ready", accuracy)).toBe(true);
  });

  it("keeps every contactable lead tied to a named recipient and verified email source", () => {
    expect(initialOpportunities).toHaveLength(5);
    for (const opportunity of initialOpportunities) {
      expect(opportunity.primaryContact?.name).toBeTruthy();
      expect(opportunity.primaryContact?.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
      expect(opportunity.primaryContact?.emailSourceUrl).toMatch(/^https:\/\//);
      expect(opportunity.emailSubject).toBeTruthy();
      expect(opportunity.draftMessage).toMatch(/^Hi /);
    }
  });
});

describe("GTM command center", () => {
  const dailyScan: DailySocialScan = {
    generatedAt: "2026-08-06T13:35:00.000Z",
    windowDays: 7,
    queryCount: 2,
    sourceCount: 3,
    coverage: "3 indexed sources checked; 1 passed the strict gates.",
    limitations: ["Search indexes can delay public posts."],
    items: [{
      id: "social-daily-one",
      platform: "reddit",
      title: "Manual grant reporting workflow",
      url: "https://www.reddit.com/r/nonprofit/comments/example/manual_grant_reporting/",
      author: "unknown",
      publishedAt: "2026-08-06",
      observedAt: "2026-08-06T13:35:00.000Z",
      evidenceSummary: "A finance user describes rebuilding funder reports in spreadsheets.",
      observedPain: "Accounting exports still require manual funder-category mapping.",
      painThemes: ["spreadsheet_bridge"],
      whyRelevant: "Supports the post-award reporting workflow.",
      status: "research_only"
    }]
  };
  const awardCandidate: GtmOpportunity = {
    ...initialOpportunities[0],
    id: "usaspending-research-candidate",
    organization: "Community Action Network",
    primaryContact: undefined,
    targetTier: "emerging",
    amount: 75_000,
    evidence: [{ ...initialOpportunities[0].evidence[0], id: "award-source", authority: "official", title: "USAspending award" }]
  };
  const awardScan: AwardDiscoveryScan = {
    generatedAt: "2026-08-10T08:00:00.000Z",
    source: "https://api.usaspending.gov/api/v2/search/spending_by_award/",
    criteria: { startDate: "2026-05-12", endDate: "2026-08-10", minimumAward: 25_000, recipientTypes: ["Nonprofit Organization"], awardTypes: ["02", "03", "04", "05"], pageSize: 100, maxPages: 4, maxCandidates: 100 },
    recordsChecked: 100,
    pagesChecked: 1,
    coverage: "100 recent federal grant records checked.",
    opportunities: [awardCandidate],
    limitations: ["Contacts require verification."]
  };

  it("renders the alert queue, source evidence, and no-send boundary", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><GtmDashboardContent /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /Find the few organizations worth acting on today/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Junior Achievement of South Florida" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing is posted or emailed automatically/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Review evidence" })[0]);
    expect(screen.getByText("Observed evidence")).toBeInTheDocument();
    expect(screen.getAllByText(/Maureen Lister/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "info@perkins.org" }).length).toBeGreaterThan(0);
  });

  it("requires explicit approval before the contacted action is enabled", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><GtmDashboardContent /></MemoryRouter>);
    const jaHeading = screen.getByRole("heading", { name: "Junior Achievement of South Florida" });
    const card = jaHeading.closest("article")!;
    const contacted = Array.from(card.querySelectorAll("button")).find((button) => button.textContent?.includes("Mark contacted"))!;
    expect(contacted).toBeDisabled();
    const approve = Array.from(card.querySelectorAll("button")).find((button) => button.textContent?.includes("Approve for outreach"))!;
    await user.click(approve);
    expect(contacted).toBeEnabled();
    const emailDraft = screen.getByRole("link", { name: "Open email draft" });
    expect(emailDraft).toHaveAttribute("href", expect.stringMatching(/^mailto:allie\.martinez@jasouthflorida\.org\?/));
    await user.click(contacted);
    expect(card.textContent).toMatch(/contacted/i);
  });

  it("supports keyboard-accessible tab and filter controls", () => {
    render(<MemoryRouter><GtmDashboardContent /></MemoryRouter>);
    const sourcesTab = screen.getByRole("tab", { name: "Signal engines" });
    fireEvent.click(sourcesTab);
    expect(sourcesTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: /Know exactly which scanners are active/i })).toBeInTheDocument();
    for (const button of [...screen.getAllByRole("tab"), ...screen.queryAllByRole("button")]) {
      expect((button.getAttribute("aria-label") || button.textContent || "").trim()).not.toBe("");
    }
  });

  it("shows the latest daily social scan as research-only evidence", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><GtmDashboardContent initialDailyScan={dailyScan} /></MemoryRouter>);
    await user.click(screen.getByRole("tab", { name: "Reddit & LinkedIn" }));
    expect(screen.getByRole("heading", { name: "1 source-linked result" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manual grant reporting workflow/i })).toHaveAttribute("href", dailyScan.items[0].url);
    expect(screen.getAllByText("research only").length).toBeGreaterThan(0);
  });

  it("shows expanded award candidates without allowing unverified outreach", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><GtmDashboardContent initialAwardScan={awardScan} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Community Action Network" })).toBeInTheDocument();
    expect(screen.getByText("emerging target")).toBeInTheDocument();
    const card = screen.getByRole("heading", { name: "Community Action Network" }).closest("article")!;
    expect(card.textContent).toMatch(/Contact research needed/i);
    await user.click(screen.getByRole("tab", { name: "Outreach automation" }));
    expect(screen.getByRole("heading", { name: /Automate the research and drafting/i })).toBeInTheDocument();
    expect(screen.getByText("Email delivery and follow-up").closest("article")?.textContent).toMatch(/Not connected/i);
  });
});
