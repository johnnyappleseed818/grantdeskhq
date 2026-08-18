import { describe, expect, it } from "vitest";
import { confirmedHumanOutreach, initialOutreachEligibility, mergeOutreachRecords, reconcileOutreachControlPlane, summarizeOutreach } from "../lib/gtmOutreach";
import { outreachFromRecord } from "../../server/persistence";

describe("human-confirmed GTM outreach ledger", () => {
  it("contains exactly seven direct and five partner sends with no inferred downstream outcome", () => {
    const metrics = summarizeOutreach(confirmedHumanOutreach);
    expect(metrics).toEqual({ totalSent: 12, directSent: 7, partnerSent: 5, uniqueOrganizationsContacted: 12, directUniqueOrganizationsContacted: 7, partnerUniqueOrganizationsContacted: 5, awaitingResponse: 12, replied: 0, trials: 0, customers: 0 });
    for (const record of confirmedHumanOutreach) {
      expect(record.status).toBe("SENT");
      expect(record.replied).toBe(false);
      expect(record.trial).toBe(false);
      expect(record.customer).toBe(false);
    }
  });

  it("deduplicates by immutable ledger id and preserves explicit Control Plane links only", () => {
    expect(mergeOutreachRecords(confirmedHumanOutreach, [confirmedHumanOutreach[0]])).toHaveLength(12);
    const links = reconcileOutreachControlPlane(confirmedHumanOutreach, ["job-ja-south-florida-2026"]);
    expect(links.filter((link) => link.status === "LINKED")).toEqual([{ recordId: "outreach_direct_junior_achievement_20260817", canonicalOpportunityId: "job-ja-south-florida-2026", status: "LINKED" }]);
    expect(links.filter((link) => link.status === "PENDING_CANONICAL_LEAD_LINK")).toHaveLength(11);
    expect(confirmedHumanOutreach.find((record) => record.id === "outreach_direct_junior_achievement_20260817")?.email).toBe("info@jasouthflorida.org");
    expect(confirmedHumanOutreach.filter((record) => record.organization === "Junior Achievement of South Florida")).toHaveLength(1);
  });

  it("blocks duplicate initial outreach by canonical organization or known recipient and requires separate follow-up authorization", () => {
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Interdistrict Committee for Project Oceanology" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Unrelated organization", email: "elaine.macbeth@rodaleinstitute.org" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Project Oceanology" }, "FOLLOW_UP")).toBe("SEPARATE_HUMAN_AUTHORIZATION_REQUIRED");
    expect(confirmedHumanOutreach.filter((record) => record.sentAt.startsWith("2026-08-18"))).toHaveLength(2);
    expect(confirmedHumanOutreach.every((record) => record.followUpDueAt === null && record.initialOutreachGuard === "DO_NOT_SEND_NEW_INITIAL_OUTREACH")).toBe(true);
  });

  it("reconciles a repeat import by immutable id and restores canonical factual fields", () => {
    const stale = { ...confirmedHumanOutreach[3], canonicalOpportunityId: null, canonicalRecordStatus: "PENDING_CANONICAL_LEAD_LINK" as const };
    const reconciled = mergeOutreachRecords([stale], confirmedHumanOutreach);
    expect(reconciled).toHaveLength(12);
    expect(reconciled.find((record) => record.id === stale.id)?.canonicalOpportunityId).toBe("job-sustainable-food-center-2026");
  });

  it("round-trips a known business recipient without relaxing malformed-email rejection", () => {
    const oceanology = confirmedHumanOutreach.find((record) => record.organization === "Project Oceanology");
    expect(oceanology).toBeDefined();
    expect(outreachFromRecord({ ...oceanology! })).toMatchObject({
      id: "outreach_direct_project_oceanology_20260818",
      email: "lmcolon@oceanology.org",
      initialOutreachGuard: "DO_NOT_SEND_NEW_INITIAL_OUTREACH",
      sentAt: "2026-08-18T00:00:00.000Z",
      sentTimePrecision: "DATE_CONFIRMED"
    });
    expect(outreachFromRecord({ ...oceanology!, email: "not-a-valid-address" })).toBeNull();
  });

});
