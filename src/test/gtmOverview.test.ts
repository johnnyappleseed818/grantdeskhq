import { describe, expect, it } from "vitest";
import { buildGtmOverview } from "../lib/gtmOverview";
import type { ControlPlaneQueueReconciliation } from "../lib/gtmControlPlaneQueue";

const counts: ControlPlaneQueueReconciliation["counts"] = { DISQUALIFIED: 1, QUALIFIED: 2, CONTACT_RESEARCH_REQUIRED: 5, ENRICHMENT_READY: 3, EMAIL_VERIFICATION_REQUIRED: 0, SUPPRESSION_CHECK_REQUIRED: 1, DRAFT_REQUIRED: 1, READY_FOR_HUMAN_REVIEW: 2, ALREADY_CONTACTED: 0, CUSTOMER: 0, DUPLICATE: 1 };
const reconciliation: ControlPlaneQueueReconciliation = { generatedAt: "2026-08-17T08:00:00.000Z", uniqueOrganizations: 14, counts, cards: [{ cardId: "one", canonicalCardId: "one", organization: "Research nonprofit", normalizedOrganization: "research nonprofit", signalKind: "grant_award", observedAt: "2026-08-16", sourceUrls: [], state: "ENRICHMENT_READY", reason: "email needed" }] };

describe("GTM overview", () => {
  it("derives factual direct KPIs and target gaps from the canonical reconciliation", () => {
    const overview = buildGtmOverview({ reconciliation, shadowStatus: null, usage: { hunterLookups: 2, hunterVerifications: 1, apolloLookups: 0, emailsVerified: 1, contactsNotFound: 1, providerSuccesses: { hunter: 1 }, updatedAt: "2026-08-17T08:00:00.000Z" }, now: "2026-08-17T09:00:00.000Z" });
    expect(overview.direct.metrics.qualified).toMatchObject({ actual: 13, target: 100, gap: 87 });
    expect(overview.direct.metrics.humanReview).toMatchObject({ actual: 2, target: 25 });
    expect(overview.direct.topNextEnrichmentCandidates).toEqual(["Research nonprofit"]);
    expect(overview.controlPlane).toMatchObject({ health: "HEALTHY", missingOrUnaccounted: 0 });
    expect(overview.enrichment).toMatchObject({ hunterLookups: 2, hunterLookupLimit: 2, verifiedEmails: 1 });
    expect(overview.outboundEnabled).toBe(false);
  });
  it("fails closed for unavailable sources and leaves uninstrumented partner counts blank", () => {
    const overview = buildGtmOverview({ reconciliation: null, shadowStatus: null, usage: null, now: "2026-08-17T09:00:00.000Z" });
    expect(overview.direct.health).toBe("BLOCKED");
    expect(overview.direct.metrics.qualified.actual).toBeNull();
    expect(overview.partner).toMatchObject({ health: "NOT_INSTRUMENTED" });
    expect(overview.partner.metrics.researched.actual).toBeNull();
  });
  it("marks stale Control Plane data without discarding its last known values", () => {
    const overview = buildGtmOverview({ reconciliation, shadowStatus: null, usage: null, now: "2026-08-19T09:00:00.000Z" });
    expect(overview.controlPlane.health).toBe("STALE");
    expect(overview.direct.metrics.uniqueOrganizations.actual).toBe(14);
  });
});