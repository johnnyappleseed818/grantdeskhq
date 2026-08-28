import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { initialOpportunities } from "../data/gtmData";
import { GtmExecutiveOverview, GtmOpportunityQueue } from "../components/GtmCanonicalOperations";
import type { CanonicalGtmModel, CanonicalGtmRecord } from "../lib/gtmCanonical";
import {
  assessOpportunityAccuracy,
  canMoveToContacted,
  findDuplicateOpportunities,
  rankGtmOpportunities,
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

  function canonicalRecord(overrides: Partial<CanonicalGtmRecord> = {}): CanonicalGtmRecord {
    return { id: "canonical-one", organizationId: "org:example.org", organization: "Example Nonprofit", organizationDomain: "example.org", segment: "DIRECT", state: "READY_TO_SEND", qualified: true, contact: "Casey Finance", title: "Finance Director", email: "casey@example.org", verificationStatus: "VERIFIED", suppressionStatus: "CLEAR", priorContact: false, blockers: [], nextAction: "Instantly handoff after final guardrails.", whyNow: "Recent award announcement", sourceUrl: "https://example.org/award", partnerType: null, subject: "Grant reporting", draft: "Hi Casey", instantlyStatus: null, instantlyLeadId: null, instantlyCampaignId: null, lastUpdated: "2026-08-28T00:00:00.000Z", ...overrides };
  }
  function canonicalModel(records: CanonicalGtmRecord[]): CanonicalGtmModel { return { generatedAt: "2026-08-28T00:00:00.000Z", records, queues: { RESEARCH_BACKLOG: [], NEEDS_VERIFICATION: [], READY_TO_SEND: [], ALREADY_CONTACTED: [], AWAITING_REPLY: [], FOLLOW_UP_DUE: [], REPLIED: [], POSITIVE: [], TRIAL: [], PAID: [] }, metrics: { directReady: 1, partnerReady: 0, directNeedsVerification: 0, partnerNeedsVerification: 0, followUpsDue: 0, awaitingReply: 0, replies: 0, positiveReplies: 0, trials: 0, paid: 0, mrr: 0 } }; }

  it("separates the executive overview from detailed canonical opportunities", () => {
    const model = canonicalModel([canonicalRecord(), canonicalRecord({ id: "partner-one", organization: "Example Accounting", organizationId: "org:example-accounting.com", organizationDomain: "example-accounting.com", segment: "PARTNER", contact: "Pat Partner", title: "Managing Partner", email: "pat@example-accounting.com", instantlyStatus: "IN_CAMPAIGN" })]);
    const { rerender } = render(<GtmExecutiveOverview model={model} health={null} persisted={null} seo={{ published: 0, indexed: null, impressions: null, clicks: null, nextPublication: null, error: null }} />);
    expect(screen.getByRole("heading", { name: /Demand, delivery, and blockers/i })).toBeInTheDocument();
    expect(screen.queryByText("Example Nonprofit")).not.toBeInTheDocument();
    rerender(<GtmOpportunityQueue model={model} />);
    expect(screen.getByRole("heading", { name: "Opportunities" })).toBeInTheDocument();
    expect(screen.getByText("Example Nonprofit")).toBeInTheDocument();
    expect(screen.getByText("Example Accounting")).toBeInTheDocument();
  });

  it("labels provider enrollment as scheduled and reserves sent for provider evidence", () => {
    const model = canonicalModel([canonicalRecord({ instantlyStatus: "IN_CAMPAIGN" }), canonicalRecord({ id: "sent", organization: "Sent Nonprofit", organizationId: "org:sent.org", email: "finance@sent.org", instantlyStatus: "SENT", state: "AWAITING_REPLY", priorContact: true })]);
    render(<GtmOpportunityQueue model={model} />);
    expect(screen.getAllByText("SCHEDULED").length).toBeGreaterThan(1);
    expect(screen.getAllByText("SENT").length).toBeGreaterThan(1);
  });

  it("exposes searchable, segment, lifecycle, and blocker filters", () => {
    const model = canonicalModel([canonicalRecord(), canonicalRecord({ id: "blocked", organization: "Blocked Partner", organizationId: "org:blocked.com", organizationDomain: "blocked.com", segment: "PARTNER", blockers: ["Suppressed by policy"], suppressionStatus: "BLOCKED" })]);
    render(<GtmOpportunityQueue model={model} />);
    expect(screen.getByPlaceholderText(/Search organization/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Filter segment")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter lifecycle stage")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter blocker")).toBeInTheDocument();
  });
});
