import { describe, expect, it } from "vitest";
import { buildCanonicalGtmModel, canonicalOrganizationId, type CanonicalGtmCandidate } from "../lib/gtmCanonical";
import type { ContactEnrichmentRecord } from "../lib/contactEnrichment";
import type { OutreachRecord } from "../lib/gtmOutreach";

const candidate: CanonicalGtmCandidate = { id: "candidate", segment: "DIRECT", qualified: true, sourceUrl: "https://example.org", whyNow: "New award", target: { prospectChannel: "DIRECT_NONPROFIT", organization: "Project Oceanology", organizationDomain: "oceanology.org", domainSourceUrl: "https://example.org", person: { firstName: "Lisa", lastName: "Colon", fullName: "Lisa Colon", currentTitle: "Finance Director", titleSourceUrl: "https://example.org" } } };
function enrichment(status: ContactEnrichmentRecord["verification"]["verifierStatus"], ready = false): ContactEnrichmentRecord {
 const verification = { provider: "hunter" as const, providerRequestType: "EMAIL_FINDER_AND_VERIFIER" as const, email: "lisa@oceanology.org", finderResult: "FOUND" as const, verifierStatus: status, providerScore: 95, verificationTimestamp: "2026-08-22T00:00:00.000Z", verificationSource: [], suppressionStatus: "CLEAR" as const, priorContactStatus: "CLEAR" as const, organizationDedupe: "PASS" as const, contactEvidence: "PASS" as const, blockers: ready ? [] : ["VERIFICATION_MISSING"], readyToSend: ready, readyBlocker: ready ? null : "VERIFICATION_MISSING", lastEnrichmentAttempt: null, nextEligibleRetry: null };
 return { id: "record", mode: "SHADOW", target: candidate.target, email: verification.email!, emailVerificationStatus: status, providerAttempts: [], emailProvenance: [], suppression: { status: "CLEAR", reasons: [], checkedAt: "2026-08-22T00:00:00.000Z", sourcesChecked: [] }, readiness: ready ? "READY_FOR_HUMAN_APPROVAL" : status, readyForHumanApproval: ready, blockers: verification.blockers, createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z", verification };
}
function outreach(organization = "Project Oceanology"): OutreachRecord { return { id: "sent", organization, contact: "Lisa Colon", persona: "Finance Director", email: "lisa@oceanology.org", type: "DIRECT_NONPROFIT", whyNowSignal: null, signalSource: null, canonicalOpportunityId: null, canonicalRecordStatus: "PENDING_CANONICAL_LEAD_LINK", initialOutreachGuard: "DO_NOT_SEND_NEW_INITIAL_OUTREACH", sentAt: "2026-08-22T00:00:00.000Z", sentTimePrecision: "DATE_CONFIRMED", status: "SENT", lastContactAt: "2026-08-22T00:00:00.000Z", nextAction: "AWAIT_RESPONSE", followUpDueAt: null, replied: false, replySentiment: "NONE", trial: false, customer: false, notes: "", source: "HUMAN_CONFIRMED_OUTREACH", createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" }; }

describe("canonical GTM model", () => {
 it("uses one canonical identity for name/domain variants", () => expect(canonicalOrganizationId("Interdistrict Committee for Project Oceanology", "oceanology.org")).toBe(canonicalOrganizationId("Project Oceanology", "oceanology.org")));
  it("promotes a clear verified enrichment to READY_TO_SEND", () => expect(buildCanonicalGtmModel({ candidates: [candidate], enrichments: [enrichment("VERIFIED", true)], outreach: [] }).records[0].state).toBe("READY_TO_SEND"));
  it("keeps a verified Direct email out of READY_TO_SEND when its stored title is not a finance or grants operating role", () => {
    const policyCandidate = { ...candidate, target: { ...candidate.target, person: { ...candidate.target.person, currentTitle: "Legislative and Policy Director" } } };
    const stored = { ...enrichment("VERIFIED", true), target: policyCandidate.target };
    const record = buildCanonicalGtmModel({ candidates: [policyCandidate], enrichments: [stored], outreach: [] }).records[0];
    expect(record.state).toBe("NEEDS_VERIFICATION");
    expect(record.blockers).toContain("INAPPROPRIATE_DIRECT_RECIPIENT: a finance or grants operating owner is required.");
  });
 it("keeps a missing verifier result explicit", () => { const record = buildCanonicalGtmModel({ candidates: [candidate], enrichments: [enrichment("VERIFICATION_RESULT_MISSING")], outreach: [] }).records[0]; expect(record.state).toBe("NEEDS_VERIFICATION"); expect(record.blockers).toContain("VERIFICATION_MISSING"); });
 it("never returns a contacted organization to first touch", () => expect(buildCanonicalGtmModel({ candidates: [candidate], enrichments: [enrichment("VERIFIED", true)], outreach: [outreach()] }).records[0].state).toBe("AWAITING_REPLY"));
 it("protects the explicit historical prior-contact record without inventing a send", () => { const perkins = { ...candidate, target: { ...candidate.target, organization: "Perkins School for the Blind", organizationDomain: "perkins.org" } }; expect(buildCanonicalGtmModel({ candidates: [perkins], enrichments: [enrichment("VERIFIED", true)], outreach: [] }).records[0].state).toBe("ALREADY_CONTACTED"); });
 it("does not count a provider status as sent without provider send evidence", () => {
   const external = [{ canonicalOrganizationId: "org:oceanology.org", email: "lisa@oceanology.org", instantlySyncStatus: "SENT" }];
   const record = buildCanonicalGtmModel({ candidates: [candidate], enrichments: [enrichment("VERIFIED", true)], outreach: [], instantly: external }).records[0];
   expect(record.sentAt).toBeNull();
   expect(record.blockers).toContain("PROVIDER_SEND_TIMESTAMP_MISSING");
 });
});
