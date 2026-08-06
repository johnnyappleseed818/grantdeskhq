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
  scoreOpportunity,
  type GtmOpportunity
} from "../lib/gtm";

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
});

describe("GTM command center", () => {
  it("renders the alert queue, source evidence, and no-send boundary", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><GtmDashboardContent /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /Find the few organizations worth acting on today/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Junior Achievement of South Florida" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing is posted or emailed automatically/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Review evidence" })[0]);
    expect(screen.getByText("Observed evidence")).toBeInTheDocument();
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
});
