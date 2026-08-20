import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { initialOpportunities } from "../data/gtmData";
import { GtmDashboardContent } from "../pages/GtmDashboardPage";
import type { ControlPlaneQueueReconciliation } from "../lib/gtmControlPlaneQueue";
import type { GtmOverview } from "../lib/gtmOverview";
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
    expect(initialOpportunities).toHaveLength(6);
    for (const opportunity of initialOpportunities) {
      expect(opportunity.primaryContact?.name).toBeTruthy();
      expect(opportunity.primaryContact?.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
      expect(opportunity.primaryContact?.emailSourceUrl).toMatch(/^https:\/\//);
      expect(opportunity.emailSubject).toBeTruthy();
      expect(opportunity.draftMessage).toMatch(/^Hi /);
    }
  });

  it("keeps the UNO E-RISE award visible as an adjacent, source-backed opportunity", () => {
    const opportunity = initialOpportunities.find((item) => item.id === "award-uno-ne3d-2026");
    expect(opportunity).toMatchObject({
      organization: "University of Nebraska at Omaha",
      amount: 8_000_000,
      funder: "U.S. National Science Foundation",
      targetTier: "adjacent",
      primaryContact: { name: "Sara Myers", email: "samyers@unomaha.edu" }
    });
    expect(opportunity?.evidence).toHaveLength(3);
    expect(assessOpportunityAccuracy(opportunity!, "2026-08-10")).toMatchObject({ score: 80, label: "high", confidence: "high", readyForAction: true });
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
    scanStatus: "success",
    lastSuccessfulScanAt: "2026-08-10T08:00:00.000Z",
    criteria: { startDate: "2026-05-12", endDate: "2026-08-10", minimumAward: 25_000, recipientTypes: ["Nonprofit Organization"], awardTypes: ["02", "03", "04", "05"], pageSize: 100, maxPages: 4, maxCandidates: 100 },
    recordsChecked: 100,
    pagesChecked: 1,
    newAwardCount: 1,
    duplicateCount: 0,
    errorCount: 0,
    coverage: "100 recent federal grant records checked.",
    opportunities: [awardCandidate],
    limitations: ["Contacts require verification."]
  };

  it("renders the alert queue, source evidence, and no-send boundary", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><GtmDashboardContent seedOpportunities={initialOpportunities} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /Founder GTM Command Center/i })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Customers" }));
    expect(screen.queryByRole("heading", { name: "Junior Achievement of South Florida" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Perkins School for the Blind" })).toBeInTheDocument();
    expect(screen.getByText(/Manual outreach is active/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Review evidence" })[0]);
    expect(screen.getByText("Observed evidence")).toBeInTheDocument();
    expect(screen.getAllByText(/Maureen Lister/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/info@perkins\.org/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll("a[href^=\"mailto:\"]")).toHaveLength(0);
  });

  it("keeps email-client handoff and external action marking locked in SHADOW mode", () => {
    render(<MemoryRouter><GtmDashboardContent seedOpportunities={initialOpportunities} /></MemoryRouter>);
    expect(screen.getByText(/INSTANTLY WARMING · AUTOMATION PAUSED/i)).toBeInTheDocument();
    expect(document.querySelectorAll("a[href^=\"mailto:\"]")).toHaveLength(0);
    expect(screen.getByText(/INSTANTLY WARMING · AUTOMATION PAUSED/i)).toBeInTheDocument();
  });

  it("supports keyboard-accessible tab and filter controls", () => {
    render(<MemoryRouter><GtmDashboardContent seedOpportunities={initialOpportunities} /></MemoryRouter>);
    const sourcesTab = screen.getByRole("tab", { name: "System Health" });
    fireEvent.click(sourcesTab);
    expect(sourcesTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: /Know exactly which scanners are active/i })).toBeInTheDocument();
    for (const button of [...screen.getAllByRole("tab"), ...screen.queryAllByRole("button")]) {
      expect((button.getAttribute("aria-label") || button.textContent || "").trim()).not.toBe("");
    }
  });

  it("shows the latest daily social scan as research-only evidence", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><GtmDashboardContent seedOpportunities={initialOpportunities} initialDailyScan={dailyScan} /></MemoryRouter>);
    await user.click(screen.getByRole("tab", { name: "System Health" }));
    expect(screen.getByRole("heading", { name: "1 source-linked result" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manual grant reporting workflow/i })).toHaveAttribute("href", dailyScan.items[0].url);
    expect(screen.getAllByText("research only").length).toBeGreaterThan(0);
  });

  it("renders the protected canonical Control Plane queue without a delivery action", async () => {
    const user = userEvent.setup();
    const controlPlane: ControlPlaneQueueReconciliation = {
      uniqueOrganizations: 1,
      counts: { DISQUALIFIED: 0, QUALIFIED: 0, CONTACT_RESEARCH_REQUIRED: 0, ENRICHMENT_READY: 0, EMAIL_VERIFICATION_REQUIRED: 0, SUPPRESSION_CHECK_REQUIRED: 0, DRAFT_REQUIRED: 0, READY_FOR_HUMAN_REVIEW: 1, ALREADY_CONTACTED: 0, CUSTOMER: 0, DUPLICATE: 0 },
      cards: [{ cardId: "award-one", canonicalCardId: "award-one", organization: "Example Community Action", normalizedOrganization: "example community action", signalKind: "grant_award", observedAt: "2026-08-16", sourceUrls: ["https://example.org/award"], state: "READY_FOR_HUMAN_REVIEW", reason: "Direct business email, suppression, and a human-review-only draft are present." }]
    };
    render(<MemoryRouter><GtmDashboardContent seedOpportunities={initialOpportunities} initialControlPlane={controlPlane} /></MemoryRouter>);
    await user.click(screen.getByRole("tab", { name: "System Health" }));
    expect(screen.getByRole("heading", { name: /Every award lead has one visible queue state/i })).toBeInTheDocument();
    expect(screen.getByText("Example Community Action")).toBeInTheDocument();
    expect(screen.getByText("human-review only")).toBeInTheDocument();
    expect(screen.getByText(/Manual outreach is active/i)).toBeInTheDocument();
    expect(document.querySelectorAll("a[href^=\"mailto:\"]")).toHaveLength(0);
  });

  it("shows expanded award candidates without allowing unverified outreach", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><GtmDashboardContent seedOpportunities={initialOpportunities} initialAwardScan={awardScan} /></MemoryRouter>);
    await user.click(screen.getByRole("tab", { name: "Customers" }));
    expect(screen.queryByRole("heading", { name: "Community Action Network" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Prioritized by pain, timing, fit, and potential value/i })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "System Health" }));
    expect(screen.getByRole("heading", { name: /Know exactly which scanners are active/i })).toBeInTheDocument();
    expect(screen.queryByText("Outbound delivery")).not.toBeInTheDocument();
  });

  it("renders the reconciled 17-organization outreach work queue without a delivery action", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><GtmDashboardContent seedOpportunities={initialOpportunities} /></MemoryRouter>);
    await user.click(screen.getByRole("tab", { name: "Customers" }));
    expect(screen.getByRole("heading", { name: /Who has been contacted—and what happens next/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Outreach ledger summary")).toHaveTextContent("7email events sent7unique organizations contacted7direct unique0partner unique");
    expect(screen.getAllByText("Human-confirmed canonical record")).toHaveLength(3);
    expect(screen.getAllByText("Control Plane linked")).toHaveLength(4);
    expect(screen.getByRole("option", { name: "Already Contacted" })).toBeInTheDocument();
    expect(document.querySelectorAll("a[href^=\"mailto:\"]")).toHaveLength(0);
  });
  it("keeps the Overview commercial-first and filters the confirmed manual ledger", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><GtmDashboardContent seedOpportunities={initialOpportunities} /></MemoryRouter>);
    expect(screen.getByLabelText("Commercial funnel")).toHaveTextContent("17Sent email events17Unique contacted");
    expect(screen.getByLabelText("Commercial funnel")).toHaveTextContent("MRR");
    expect(screen.getByLabelText("Direct funnel")).toHaveTextContent(/7Sent.*0Replies.*0Positive replies.*0Free First Award.*0Paid/);
    expect(screen.getByLabelText("Partner funnel")).toHaveTextContent(/10Sent.*0Replies.*0Positive replies.*0Trial with client or award.*0Paid customers influenced/);
    expect(screen.queryByText(/NOT_INSTRUMENTED/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not instrumented/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Next actions/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Outreach" }));
    expect(screen.getByRole("heading", { name: /Who has been contacted—and what happens next/i })).toBeInTheDocument();
  });
  it("uses canonical actual-target inventory and deduplicated manual sends", async () => {
    const user = userEvent.setup();
    const overview = { direct: { metrics: { qualified: { actual: 13, target: 100, gap: 87 }, humanReview: { actual: 2, target: 25, gap: 23 }, sent: { actual: 5, target: null, gap: null } } }, partner: { metrics: { researched: { actual: 50, target: 50, gap: 0 }, highFit: { actual: 20, target: 20, gap: 0 }, humanReview: { actual: 0, target: 5, gap: 5 }, contacted: { actual: 5, target: null, gap: null } } } } as unknown as GtmOverview;
    render(<MemoryRouter><GtmDashboardContent seedOpportunities={initialOpportunities} initialOverview={overview} /></MemoryRouter>);
    await user.click(screen.getByRole("tab", { name: "Customers" }));
    expect(screen.getByLabelText("Direct lead inventory")).toHaveTextContent("13Qualified / 100 target2Ready to send / 25 target7Manual sent");
    await user.click(screen.getByRole("tab", { name: "Partners" }));
    expect(screen.getByLabelText("Partner funnel")).toHaveTextContent(/20High fit.*10Sent/);
    expect(screen.getByText("Crown CFO")).toBeInTheDocument();
    expect(screen.getAllByText("Partner / fractional CFO", { selector: "td" })).toHaveLength(8);
    expect(screen.getByText("Vault Consulting")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Customers" }));
    await user.type(screen.getByLabelText("Search outreach history"), "Foodlink");
    expect(screen.getByText("Foodlink")).toBeInTheDocument();
    expect(screen.queryByText("Johnson Creek Watershed Council")).not.toBeInTheDocument();
  });
  it("shows source-backed social and SEO operations without duplicating analytics metrics", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><GtmDashboardContent seedOpportunities={initialOpportunities} /></MemoryRouter>);
    await user.click(screen.getByRole("tab", { name: "Social" }));
    expect(screen.getByRole("heading", { name: /Review public conversations before engaging/i })).toBeInTheDocument();
    expect(screen.getByText(/No posting, voting, direct messages/i)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "SEO" }));
    expect(screen.getByRole("heading", { name: /Indexing, content, and internal-link work/i })).toBeInTheDocument();
    expect(screen.getByText(/Search performance remains unavailable until Search Console is connected/i)).toBeInTheDocument();
    expect(screen.queryByText(/GA4 sessions/i)).not.toBeInTheDocument();
  });

});
