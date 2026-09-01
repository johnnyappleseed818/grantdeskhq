import { describe, expect, it } from "vitest";
import { evaluateIncidentClosureEvidence, findHistoricalClosureCandidate } from "../../server/outboundIncidentClosure.ts";
import type { CanonicalGtmRecord } from "../lib/gtmCanonical.ts";

const legacy = (overrides: Partial<CanonicalGtmRecord> = {}): CanonicalGtmRecord => ({
  id: "legacy", organizationId: "org:legacy.example", organization: "Legacy", organizationDomain: "legacy.example", segment: "DIRECT", state: "ALREADY_CONTACTED", qualified: true,
  contact: "Finance Owner", title: "Finance Director", email: "legacy@example.org", verificationStatus: "VERIFIED", suppressionStatus: "BLOCKED", priorContact: true,
  blockers: ["ALREADY_CONTACTED"], nextAction: "PRESERVE_HISTORY", whyNow: "Historical contact", sourceUrl: "https://legacy.example", partnerType: null, subject: null, draft: null, lastUpdated: "2026-08-31T00:00:00.000Z", ...overrides
});

const tombstone = { tombstoneId: "tombstone_one", organizationId: "org:legacy.example", canonicalRecordId: "legacy", reason: "ALREADY_CONTACTED", priorContactReference: "legacy", permanent: true } as const;

describe("outbound incident closure evidence", () => {
  it("requires canonical history and a permanent tombstone even when the provider has no conflicting lead", () => {
    expect(evaluateIncidentClosureEvidence({ candidate: legacy(), tombstone, providerConflict: false, activeCanonicalOutboundState: false })).toMatchObject({ satisfied: true, canonicalHistory: true, tombstoneMatches: true, providerConflictClear: true, absentFromOutboundStates: true });
    expect(evaluateIncidentClosureEvidence({ candidate: null, tombstone: null, providerConflict: false, activeCanonicalOutboundState: false }).satisfied).toBe(false);
  });

  it("fails closed for an active provider enrollment, missing tombstone, or any eligible outbound state", () => {
    expect(evaluateIncidentClosureEvidence({ candidate: legacy(), tombstone, providerConflict: true, activeCanonicalOutboundState: false }).satisfied).toBe(false);
    expect(evaluateIncidentClosureEvidence({ candidate: legacy(), tombstone: null, providerConflict: false, activeCanonicalOutboundState: false }).satisfied).toBe(false);
    expect(evaluateIncidentClosureEvidence({ candidate: legacy({ instantlyStatus: "STAGED" }), tombstone, providerConflict: false, activeCanonicalOutboundState: true }).satisfied).toBe(false);
  });

  it("finds exactly one auditable historical candidate and never accepts a ready record", () => {
    expect(findHistoricalClosureCandidate([legacy()])?.id).toBe("legacy");
    expect(findHistoricalClosureCandidate([legacy(), legacy({ id: "second" })])).toBeNull();
    expect(findHistoricalClosureCandidate([legacy({ state: "READY_TO_SEND", priorContact: false, blockers: [] })])).toBeNull();
  });
});
