import { describe, expect, it } from "vitest";
import { confirmedHumanOutreach, initialOutreachEligibility, mergeOutreachRecords, reconcileOutreachControlPlane, summarizeOutreach } from "../lib/gtmOutreach";
import { outreachFromRecord } from "../../server/persistence";

describe("human-confirmed GTM outreach ledger", () => {
  it("contains exactly seven direct and ten partner contacted organizations with no inferred downstream outcome", () => {
    const metrics = summarizeOutreach(confirmedHumanOutreach);
    expect(metrics).toEqual({ totalSent: 17, directSent: 7, partnerSent: 10, uniqueOrganizationsContacted: 17, directUniqueOrganizationsContacted: 7, partnerUniqueOrganizationsContacted: 10, awaitingResponse: 17, replied: 0, trials: 0, customers: 0 });
    for (const record of confirmedHumanOutreach) {
      expect(record.status).toBe("SENT");
      expect(record.replied).toBe(false);
      expect(record.trial).toBe(false);
      expect(record.customer).toBe(false);
    }
  });

  it("deduplicates by immutable ledger id while treating all human-confirmed sends as canonical", () => {
    expect(mergeOutreachRecords(confirmedHumanOutreach, [confirmedHumanOutreach[0]])).toHaveLength(17);
    const links = reconcileOutreachControlPlane(confirmedHumanOutreach, ["job-ja-south-florida-2026"]);
    expect(links.filter((link) => link.status === "LINKED")).toEqual([{ recordId: "outreach_direct_junior_achievement_20260817", canonicalOpportunityId: "job-ja-south-florida-2026", status: "LINKED" }]);
    expect(links.filter((link) => link.status === "HUMAN_CONFIRMED_CANONICAL")).toHaveLength(16);
    expect(confirmedHumanOutreach.find((record) => record.id === "outreach_direct_junior_achievement_20260817")?.email).toBe("info@jasouthflorida.org");
    expect(confirmedHumanOutreach.filter((record) => record.organization === "Junior Achievement of South Florida")).toHaveLength(1);
  });

  it("blocks duplicate initial outreach by organization, recipient, domain, suppression, or future Instantly import", () => {
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Interdistrict Committee for Project Oceanology" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Unrelated organization", email: "elaine.macbeth@rodaleinstitute.org" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Project Oceanology" }, "FOLLOW_UP")).toBe("SEPARATE_HUMAN_AUTHORIZATION_REQUIRED");
    expect(confirmedHumanOutreach.filter((record) => record.sentAt?.startsWith("2026-08-18"))).toHaveLength(2);
    expect(confirmedHumanOutreach.filter((record) => record.sentAt === null && record.sentTimePrecision === "DATE_NOT_RECORDED")).toHaveLength(5);
    expect(confirmedHumanOutreach.every((record) => record.followUpDueAt === null && record.initialOutreachGuard === "DO_NOT_SEND_NEW_INITIAL_OUTREACH")).toBe(true);
  });

  it("reconciles a repeat import by immutable id and restores canonical factual fields", () => {
    const stale = { ...confirmedHumanOutreach[3], canonicalOpportunityId: null, canonicalRecordStatus: "HUMAN_CONFIRMED_CANONICAL" as const };
    const reconciled = mergeOutreachRecords([stale], confirmedHumanOutreach);
    expect(reconciled).toHaveLength(17);
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

  it("keeps a reply separate from first-touch eligibility", () => {
    const junior = confirmedHumanOutreach.find((record) => record.organization === "Junior Achievement of South Florida")!;
    const replied = { ...junior, status: "REPLIED" as const, replied: true, replySentiment: "NEUTRAL" as const };
    expect(summarizeOutreach([...confirmedHumanOutreach.filter((record) => record.id !== junior.id), replied]).replied).toBe(1);
    expect(initialOutreachEligibility([replied], { organization: junior.organization })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
  });

});
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Rodale Institute", email: "another-person@rodaleinstitute.org" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "NFO", domain: "nfoyourcfo.com" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Future import", instantlyInitialOutreachRecorded: true })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Project Oceanology", suppressionStatus: "UNSUBSCRIBED" }, "FOLLOW_UP")).toBe("SUPPRESSED_DO_NOT_CONTACT");
