import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyLegacyProviderExclusions, type InstantlyIntegrationRecord } from "../../server/instantly.ts";
import { closeOutboundCircuitIncident, hasActiveInstantlyHandoffReservation, outboundCircuitEventId, resetOutboundCircuitBreaker } from "../../server/persistence.ts";
import type { CanonicalGtmRecord } from "../lib/gtmCanonical.ts";

const legacy = (overrides: Partial<CanonicalGtmRecord> = {}): CanonicalGtmRecord => ({
  id: "legacy-direct", organizationId: "org:legacy.example.org", organization: "Legacy Nonprofit", organizationDomain: "legacy.example.org", segment: "DIRECT", state: "ALREADY_CONTACTED", qualified: true,
  contact: "Legacy Finance", title: "Finance Director", email: "Legacy@Example.org", verificationStatus: "VERIFIED", suppressionStatus: "CLEAR", priorContact: true,
  blockers: ["ALREADY_CONTACTED"], nextAction: "PRESERVE HISTORY", whyNow: "Historical provider enrollment", sourceUrl: "https://legacy.example.org", partnerType: null, subject: "Grant reporting", draft: "Hi", lastUpdated: "2026-08-31T00:00:00.000Z", ...overrides
});

const inCampaign = (overrides: Partial<InstantlyIntegrationRecord> = {}): InstantlyIntegrationRecord => ({
  id: "legacy-provider-record", canonicalOrganizationId: "org:legacy.example.org", canonicalContactId: "org:legacy.example.org:legacy@example.org", organization: "Legacy Nonprofit", contact: "Legacy Finance", email: "legacy@example.org", segment: "DIRECT", source: "https://legacy.example.org", signalType: "award", whyNowOrFit: "Historical provider enrollment", instantlyListId: "list", instantlyCampaignId: "campaign", instantlyLeadId: "lead-legacy", instantlySyncStatus: "IN_CAMPAIGN", firstSentAt: "", lastSentAt: "", replyReceivedAt: "", replyDisposition: "", bounceAt: "", unsubscribeAt: "", sequenceCompletedAt: "", productAttributionId: "", freeFirstAwardStartedAt: "", reportGeneratedAt: "", paidAt: "", messageVersion: "v1", lastInstantlySyncAt: "", lastProviderUpdatedAt: "", lastKnownLeadStatus: "", lastKnownReplyCount: 0, lastProcessedSequenceStatus: "", lastCampaignStepAt: "", sentAtSource: "", sequenceStopRequestedAt: "", sequenceStopReason: "", failureReason: "", createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z", ...overrides
});

const breaker = { tripped: true, reason: "DUPLICATE_PROVIDER_ENROLLMENT", detail: "legacy lead", trippedAt: "2026-08-31T00:00:00.000Z" };
const firestore = (state = breaker) => Response.json({ fields: {
  tripped: { booleanValue: state.tripped }, reason: { stringValue: state.reason }, detail: { stringValue: state.detail }, trippedAt: { stringValue: state.trippedAt }, resetEventId: { stringValue: (state as typeof state & { resetEventId?: string }).resetEventId || "" }, resetReason: { stringValue: (state as typeof state & { resetReason?: string }).resetReason || "" }
} });

describe("audited legacy provider exclusion", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("accepts a provider-enrolled Direct recipient after canonical reconciliation removed it from READY", () => {
    const result = verifyLegacyProviderExclusions({ records: [legacy()], integrationRecords: [inCampaign()], providerEnrolledEmails: new Set(["legacy@example.org"]) });
    expect(result).toEqual({ satisfied: true, excludedEmails: ["legacy@example.org"] });
  });

  it("accepts provider and canonical exclusion evidence when reconciliation has no duplicate local integration record", () => {
    const result = verifyLegacyProviderExclusions({ records: [legacy()], integrationRecords: [], providerEnrolledEmails: new Set(["legacy@example.org"]) });
    expect(result).toEqual({ satisfied: true, excludedEmails: ["legacy@example.org"] });
  });

  it("treats only an unexpired HANDOFF_STARTED lease as an active reservation", () => {
    const observedHistoricalReservations = [
      { handoffStatus: "HANDED_OFF", leaseExpiry: "", normalizedEmail: "one@example.org" },
      { handoffStatus: "HANDED_OFF", leaseExpiry: "", normalizedEmail: "two@example.org" },
      { handoffStatus: "FAILED", leaseExpiry: "2026-08-01T00:00:00.000Z", normalizedEmail: "three@example.org" }
    ] as never[];
    expect(hasActiveInstantlyHandoffReservation(observedHistoricalReservations, Date.parse("2026-09-01T00:00:00.000Z"))).toBe(false);
    expect(hasActiveInstantlyHandoffReservation([{ handoffStatus: "HANDOFF_STARTED", leaseExpiry: "2026-09-01T00:10:00.000Z" }] as never[], Date.parse("2026-09-01T00:00:00.000Z"))).toBe(true);
    expect(hasActiveInstantlyHandoffReservation([{ handoffStatus: "HANDOFF_STARTED", leaseExpiry: "not-a-timestamp" }] as never[], Date.parse("2026-09-01T00:00:00.000Z"))).toBe(true);
  });

  it("fails closed when the recipient returns to READY or a pending handoff state", () => {
    expect(verifyLegacyProviderExclusions({ records: [legacy({ state: "READY_TO_SEND", priorContact: false, blockers: [] })], integrationRecords: [inCampaign()], providerEnrolledEmails: new Set(["legacy@example.org"]) }).satisfied).toBe(false);
    expect(verifyLegacyProviderExclusions({ records: [legacy()], integrationRecords: [inCampaign({ instantlySyncStatus: "STAGED" })], providerEnrolledEmails: new Set(["legacy@example.org"]) }).satisfied).toBe(false);
  });

  it("fails closed when provider enrollment or canonical exclusion evidence is missing", () => {
    expect(verifyLegacyProviderExclusions({ records: [legacy()], integrationRecords: [inCampaign()], providerEnrolledEmails: new Set() }).satisfied).toBe(false);
    expect(verifyLegacyProviderExclusions({ records: [legacy({ priorContact: false, suppressionStatus: "CLEAR", blockers: [] })], integrationRecords: [inCampaign()], providerEnrolledEmails: new Set(["legacy@example.org"]) }).satisfied).toBe(false);
  });

  it("keeps the known legacy recipient ineligible after reconciliation", () => {
    const record = legacy();
    expect(verifyLegacyProviderExclusions({ records: [record], integrationRecords: [inCampaign()], providerEnrolledEmails: new Set(["legacy@example.org"]) }).satisfied).toBe(true);
    expect(record.state).not.toBe("READY_TO_SEND");
  });

  it("keeps reset dry-run, audited apply, idempotency, and failed prerequisites fail-closed", async () => {
    const eventId = outboundCircuitEventId(breaker);
    const prerequisites = { directSchedulerPaused: true, partnerSchedulerPaused: true, allRequiredFlags: true, noActiveReservation: true, legacyDirectStillExcluded: true };
    const dryFetch = vi.fn().mockImplementation(() => Promise.resolve(firestore()));
    vi.stubGlobal("fetch", dryFetch);
    await expect(resetOutboundCircuitBreaker({ expectedEventId: eventId, reason: "verified legacy exclusion", executionIdentity: "scheduler@example.org", prerequisites, dryRun: true })).resolves.toMatchObject({ cleared: false, eventId });
    expect(dryFetch).toHaveBeenCalledTimes(2);

    const writeFetch = vi.fn(async (url: string) => {
      if (url.includes("metadata.google.internal")) return Response.json({ access_token: "test-token", expires_in: 3600 });
      if (url.includes("circuit-breaker") && !url.includes("currentDocument.exists")) return firestore();
      return Response.json({});
    });
    vi.stubGlobal("fetch", writeFetch);
    await expect(resetOutboundCircuitBreaker({ expectedEventId: eventId, reason: "verified legacy exclusion", executionIdentity: "scheduler@example.org", prerequisites, dryRun: false })).resolves.toMatchObject({ cleared: true, idempotent: false, eventId });
    expect(writeFetch.mock.calls.some(([url]) => String(url).includes("reset-audits"))).toBe(true);

    const cleared = { ...breaker, tripped: false, resetEventId: eventId, resetReason: "verified legacy exclusion" };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(firestore(cleared))));
    await expect(resetOutboundCircuitBreaker({ expectedEventId: eventId, reason: "verified legacy exclusion", executionIdentity: "scheduler@example.org", prerequisites, dryRun: false })).resolves.toMatchObject({ cleared: true, idempotent: true, eventId });

    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(firestore())));
    await expect(resetOutboundCircuitBreaker({ expectedEventId: eventId, reason: "verified legacy exclusion", executionIdentity: "scheduler@example.org", prerequisites: { ...prerequisites, legacyDirectStillExcluded: false }, dryRun: true })).rejects.toThrow("prerequisites");
  });
  it("writes incident preservation and closure audits to valid Firestore document paths", async () => {
    const eventId = outboundCircuitEventId(breaker);
    const prerequisites = { directSchedulerPaused: true, partnerSchedulerPaused: true, allRequiredFlags: true, noActiveReservation: true, canonicalHistory: true, providerConflictClear: true, absentFromOutboundStates: true, tombstoneMatches: true };
    const writeFetch = vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes("metadata.google.internal")) return Response.json({ access_token: "test-token", expires_in: 3600 });
      if (target.includes("circuit-breaker") && !target.includes("currentDocument.exists")) return firestore();
      return Response.json({});
    });
    vi.stubGlobal("fetch", writeFetch);
    await expect(closeOutboundCircuitIncident({ expectedEventId: eventId, expectedVersion: 1, reason: "verified immutable tombstone", executionIdentity: "scheduler@example.org", tombstoneId: "tombstone_one", prerequisites, dryRun: false })).resolves.toMatchObject({ cleared: true, eventId });
    const closureUrls = writeFetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("gtm/instantly/safety/incidents") || url.includes("gtm/instantly/safety/incident-closures"));
    expect(closureUrls).toEqual(expect.arrayContaining([expect.stringContaining("/incidents/records/"), expect.stringContaining("/incident-closures/records/")]));
    for (const url of closureUrls) expect(url.split("/documents/")[1].split("?")[0].split("/").length % 2).toBe(0);
  });
});
