import { describe, expect, it } from "vitest";
import { addBusinessDays, confirmedHumanOutreach, initialOutreachEligibility, mergeOutreachRecords, nextPendingFollowUpDueAt, partnerFollowUpSchedule, reconcileOutreachControlPlane, summarizeOutreach } from "../lib/gtmOutreach";
import { createDirectOutreachDraft, createPartnerShadowDraft } from "../lib/contactEnrichment";
import { outreachFromRecord } from "../../server/persistence";

describe("human-confirmed GTM outreach ledger", () => {
  it("contains factual human-confirmed outreach only", () => {
    const metrics = summarizeOutreach(confirmedHumanOutreach);
    expect(metrics).toEqual({ totalSent: 25, directSent: 7, partnerSent: 18, uniqueOrganizationsContacted: 25, directUniqueOrganizationsContacted: 7, partnerUniqueOrganizationsContacted: 18, awaitingResponse: 25, replied: 0, trials: 0, customers: 0 });
    for (const record of confirmedHumanOutreach) {
      expect(record.status).toBe("SENT");
      expect(record.replied).toBe(false);
      expect(record.trial).toBe(false);
      expect(record.customer).toBe(false);
    }
  });

  it("deduplicates by immutable ledger id and preserves explicit Control Plane links only", () => {
    expect(mergeOutreachRecords(confirmedHumanOutreach, [confirmedHumanOutreach[0]])).toHaveLength(25);
    const links = reconcileOutreachControlPlane(confirmedHumanOutreach, ["job-ja-south-florida-2026"]);
    expect(links.filter((link) => link.status === "LINKED")).toEqual([{ recordId: "outreach_direct_junior_achievement_20260817", canonicalOpportunityId: "job-ja-south-florida-2026", status: "LINKED" }]);
    expect(links.filter((link) => link.status === "PENDING_CANONICAL_LEAD_LINK")).toHaveLength(24);
    expect(confirmedHumanOutreach.find((record) => record.id === "outreach_direct_junior_achievement_20260817")?.email).toBe("info@jasouthflorida.org");
    expect(confirmedHumanOutreach.filter((record) => record.organization === "Junior Achievement of South Florida")).toHaveLength(1);
  });

  it("blocks duplicate initial outreach by grant, hiring, email, domain, or future Instantly import while preserving human-only follow-up", () => {
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Interdistrict Committee for Project Oceanology" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Rodale Institute", email: "another-person@rodaleinstitute.org" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Unrelated organization", email: "elaine.macbeth@rodaleinstitute.org" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "NFO", domain: "nfoyourcfo.com" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Perkins School for the Blind", email: "maureen.lister@perkins.org" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "University of Nebraska at Omaha", email: "sara.myers@unomaha.edu" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Future import", instantlyInitialOutreachRecorded: true })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Project Oceanology" }, "FOLLOW_UP")).toBe("SEPARATE_HUMAN_AUTHORIZATION_REQUIRED");
    expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: "Project Oceanology", suppressionStatus: "UNSUBSCRIBED" }, "FOLLOW_UP")).toBe("SUPPRESSED_DO_NOT_CONTACT");
    expect(confirmedHumanOutreach.filter((record) => record.sentAt?.startsWith("2026-08-18"))).toHaveLength(2);
    expect(confirmedHumanOutreach.filter((record) => record.sentAt === null && record.sentTimePrecision === "DATE_NOT_RECORDED")).toHaveLength(5);
    expect(confirmedHumanOutreach.every((record) => record.initialOutreachGuard === "DO_NOT_SEND_NEW_INITIAL_OUTREACH")).toBe(true);
  });

  it("reconciles a repeat import by immutable id and restores canonical factual fields", () => {
    const stale = { ...confirmedHumanOutreach[3], canonicalOpportunityId: null, canonicalRecordStatus: "PENDING_CANONICAL_LEAD_LINK" as const };
    const reconciled = mergeOutreachRecords([stale], confirmedHumanOutreach);
    expect(reconciled).toHaveLength(25);
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
    const closingYourBooks = confirmedHumanOutreach.find((record) => record.organization === "Closing Your Books");
    expect(outreachFromRecord({ ...closingYourBooks! })).toMatchObject({ sentAt: null, lastContactAt: null, sentTimePrecision: "DATE_NOT_RECORDED", initialOutreachGuard: "DO_NOT_SEND_NEW_INITIAL_OUTREACH" });
  });

  it("keeps a recorded reply distinct from a first-touch candidate", () => {
    const junior = confirmedHumanOutreach.find((record) => record.organization === "Junior Achievement of South Florida")!;
    const replied = { ...junior, status: "REPLIED" as const, replied: true, replySentiment: "NEUTRAL" as const, nextAction: "AWAIT_RESPONSE" as const };
    expect(summarizeOutreach([...confirmedHumanOutreach.filter((record) => record.id !== junior.id), replied]).replied).toBe(1);
    expect(initialOutreachEligibility([replied], { organization: "Junior Achievement of South Florida" })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
  });

  it("records the founder-confirmed partner sends as awaiting reply with a business-day follow-up plan", () => {
    const records = confirmedHumanOutreach.filter((record) => record.sentBy === "HUMAN_FOUNDER");
    expect(records).toHaveLength(8);
    for (const record of records) {
      expect(record.followUpDueAt).toBe("2026-08-27T13:03:25.000Z");
      expect(record.secondFollowUpDueAt).toBe("2026-09-03T13:03:25.000Z");
      expect(record.finalCloseDueAt).toBe("2026-09-14T13:03:25.000Z");
      expect(initialOutreachEligibility(confirmedHumanOutreach, { organization: record.organization, email: record.email })).toBe("DO_NOT_SEND_NEW_INITIAL_OUTREACH");
    }
    expect(partnerFollowUpSchedule("2026-08-23T13:03:25.000Z").firstFollowUpDueAt).toBe(addBusinessDays("2026-08-23T13:03:25.000Z", 4));
    expect(nextPendingFollowUpDueAt({ ...records[0], replied: true })).toBeNull();
  });

  it("keeps future drafts benefit-led with one clear destination", () => {
    const partnerDraft = createPartnerShadowDraft({ firstName: "Casey", organization: "Example Advisors", partnerType: "fractional CFO", whySelected: "Their public services describe nonprofit finance support." });
    const directDraft = createDirectOutreachDraft({ firstName: "Casey", organization: "Example Nonprofit", timingSignal: "a recent award signal" });
    expect(partnerDraft.subject).toContain("save time on grant reporting");
    expect(partnerDraft.body.match(/https:\/\/grantdeskhq\.com\/demo/g)).toHaveLength(1);
    expect(directDraft.body.match(/https:\/\/grantdeskhq\.com\/assessment/g)).toHaveLength(1);
    expect(partnerDraft.subject).not.toMatch(/workflow|platform|solution/i);
  });

});
