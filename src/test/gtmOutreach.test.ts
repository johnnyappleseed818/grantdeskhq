import { describe, expect, it } from "vitest";
import { confirmedHumanOutreach, mergeOutreachRecords, reconcileOutreachControlPlane, summarizeOutreach } from "../lib/gtmOutreach";

describe("human-confirmed GTM outreach ledger", () => {
  it("contains exactly five direct and five partner sends with no inferred downstream outcome", () => {
    const metrics = summarizeOutreach(confirmedHumanOutreach);
    expect(metrics).toEqual({ totalSent: 10, directSent: 5, partnerSent: 5, awaitingResponse: 10, replied: 0, trials: 0, customers: 0 });
    for (const record of confirmedHumanOutreach) {
      expect(record.email).toBeNull();
      expect(record.status).toBe("SENT");
      expect(record.replied).toBe(false);
      expect(record.trial).toBe(false);
      expect(record.customer).toBe(false);
    }
  });

  it("deduplicates by immutable ledger id and preserves explicit Control Plane links only", () => {
    expect(mergeOutreachRecords(confirmedHumanOutreach, [confirmedHumanOutreach[0]])).toHaveLength(10);
    const links = reconcileOutreachControlPlane(confirmedHumanOutreach, ["job-ja-south-florida-2026"]);
    expect(links.filter((link) => link.status === "LINKED")).toEqual([{ recordId: "outreach_direct_junior_achievement_20260817", canonicalOpportunityId: "job-ja-south-florida-2026", status: "LINKED" }]);
    expect(links.filter((link) => link.status === "PENDING_CANONICAL_LEAD_LINK")).toHaveLength(9);
  });
});
