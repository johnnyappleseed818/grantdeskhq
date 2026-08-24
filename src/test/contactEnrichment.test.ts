import { describe, expect, it, vi } from "vitest";
import {
  INTRODUCTORY_GROWTH_OFFER,
  accumulateEnrichmentUsage,
  buildContactEnrichmentRecord,
  createPartnerShadowDraft,
  createTopicalShadowDraft,
  isVerifiedBusinessEmail,
  runProviderWaterfall,
  shouldRefreshContactEnrichment,
  type EnrichmentTarget,
  type ProviderLookupResult,
  type SuppressionCheck
} from "../lib/contactEnrichment";
import { createApolloProvider, createHunterProvider } from "../../server/contactEnrichmentProviders";

const target: EnrichmentTarget = {
  organization: "Example Community Action",
  organizationDomain: "example.org",
  domainSourceUrl: "https://example.org/about",
  person: {
    firstName: "Jordan",
    lastName: "Finance",
    fullName: "Jordan Finance",
    currentTitle: "Chief Financial Officer",
    titleSourceUrl: "https://example.org/leadership",
    titleObservedAt: "2026-08-16"
  }
};

const clear: SuppressionCheck = { status: "CLEAR", reasons: [], checkedAt: "2026-08-16T00:00:00.000Z", sourcesChecked: ["gtm/contact-suppressions", "organizations.ownerEmail"] };
const unknown: SuppressionCheck = { status: "UNKNOWN", reasons: ["History unavailable"], checkedAt: "2026-08-16T00:00:00.000Z", sourcesChecked: [] };

function result(provider: "hunter" | "apollo", status: ProviderLookupResult["status"], email?: string): ProviderLookupResult {
  return { provider, status, ...(email ? { email } : {}), sourceUrls: [{ url: "https://example.org/leadership", lastSeenAt: "2026-08-16" }], providerMetadata: {}, attemptedAt: "2026-08-16T00:00:00.000Z", attempted: true };
}

describe("SHADOW contact enrichment", () => {
  it("uses Hunter first and does not call Apollo after a verified business email", async () => {
    const apollo = vi.fn(async () => result("apollo", "VERIFIED", "jordan.finance@example.org"));
    const attempts = await runProviderWaterfall(target, {
      hunter: async () => result("hunter", "VERIFIED", "jordan.finance@example.org"),
      apollo
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].provider).toBe("hunter");
    expect(apollo).not.toHaveBeenCalled();
  });

  it("falls back to Apollo for an unresolved or accept-all Hunter result", async () => {
    const attempts = await runProviderWaterfall(target, {
      hunter: async () => result("hunter", "ACCEPT_ALL", "jordan.finance@example.org"),
      apollo: async () => result("apollo", "VERIFIED", "jordan.finance@example.org")
    });
    expect(attempts.map((attempt) => attempt.provider)).toEqual(["hunter", "apollo"]);
    expect(attempts[1].status).toBe("VERIFIED");
  });

  it("never promotes a verified result when suppression is unknown or blocked", () => {
    const attempts = [result("hunter", "VERIFIED", "jordan.finance@example.org")];
    const unknownRecord = buildContactEnrichmentRecord(target, attempts, unknown, "2026-08-16T00:00:00.000Z");
    const blockedRecord = buildContactEnrichmentRecord(target, attempts, { ...clear, status: "BLOCKED", reasons: ["unsubscribe"] }, "2026-08-16T00:00:00.000Z");
    const clearRecord = buildContactEnrichmentRecord(target, attempts, clear, "2026-08-16T00:00:00.000Z");
    expect(unknownRecord.readyForHumanApproval).toBe(false);
    expect(blockedRecord.readiness).toBe("SUPPRESSED");
    expect(clearRecord.readiness).toBe("READY_FOR_HUMAN_APPROVAL");
  });

  it("rejects guessed or mismatched-domain email values and refreshes unresolved cache entries", () => {
    const mismatched = buildContactEnrichmentRecord(target, [result("hunter", "VERIFIED", "jordan.finance@elsewhere.org")], clear, "2026-08-16T00:00:00.000Z");
    expect(isVerifiedBusinessEmail("jordan.finance@elsewhere.org", "example.org")).toBe(false);
    expect(mismatched.email).toBeUndefined();
    expect(mismatched.readyForHumanApproval).toBe(false);
    expect(shouldRefreshContactEnrichment(mismatched, Date.parse("2026-08-17T00:00:00.000Z"))).toBe(true);
  });

  it("tracks provider usage without treating unavailable attempts as verified", () => {
    const usage = accumulateEnrichmentUsage(null, [result("hunter", "VERIFIED", "jordan.finance@example.org"), { ...result("apollo", "NOT_FOUND"), attempted: true }], "2026-08-16T00:00:00.000Z");
    expect(usage.hunterLookups).toBe(1);
    expect(usage.apolloLookups).toBe(1);
    expect(usage.emailsVerified).toBe(1);
    expect(usage.contactsNotFound).toBe(1);
  });

  it("uses only the approved offer and free-first-award CTA in a source-specific SHADOW draft", () => {
    const draft = createTopicalShadowDraft({ firstName: "Jordan", organization: "Example Community Action", awardAmount: "$1.25M", awardingAgency: "Administration for Children and Families", awardStartDate: "August 1" });
    expect(draft.status).toBe("SHADOW_DRAFT");
    expect(draft.body).toContain(INTRODUCTORY_GROWTH_OFFER);
    expect(draft.body).toContain("Would you be open to trying it with one award for free?");
    expect(draft.body).not.toMatch(/first 25|early adopter|beta customer|launch cohort|2027-02-14/i);
    const wordCount = draft.body.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeGreaterThanOrEqual(70);
    expect(wordCount).toBeLessThanOrEqual(110);
  });
  it("keeps partner drafts separate from end-customer pricing and delivery", () => {
    const draft = createPartnerShadowDraft({ firstName: "Tosha", organization: "Example Nonprofit CFO", partnerType: "nonprofit CFO advisory firm", whySelected: "Your public services include nonprofit finance and grant reporting." });
    expect(draft.status).toBe("SHADOW_DRAFT");
    expect(draft.subject).toContain("Example Nonprofit CFO");
    expect(draft.body).toContain("one nonprofit client or award");
    expect(draft.body).not.toContain("$99");
    expect(draft.body).not.toContain("Outbound locked");
  });

});

describe("normalized READY_TO_SEND policy", () => {
  it("promotes a verified provider result with clear suppression and evidence", () => {
    const record = buildContactEnrichmentRecord(target, [result("hunter", "VERIFIED", "jordan.finance@example.org")], clear);
    expect(record).toMatchObject({ readyForHumanApproval: true, verification: { verifierStatus: "VERIFIED", readyToSend: true, readyBlocker: null } });
  });

  it("does not promote a verified Direct email for a non-operating recipient title", () => {
    const policyContact = { ...target, prospectChannel: "DIRECT_NONPROFIT" as const, person: { ...target.person, currentTitle: "Legislative and Policy Director" } };
    const record = buildContactEnrichmentRecord(policyContact, [result("hunter", "VERIFIED", "jordan.finance@example.org")], clear);
    expect(record.readyForHumanApproval).toBe(false);
    expect(record.verification.readyBlocker).toContain("finance or grants contact");
  });

  it("keeps accept-all, risky, and invalid outcomes explicitly blocked", () => {
    for (const status of ["ACCEPT_ALL", "RISKY", "INVALID"] as const) {
      const record = buildContactEnrichmentRecord(target, [result("hunter", status, "jordan.finance@example.org")], clear);
      expect(record.readyForHumanApproval).toBe(false);
      expect(record.verification.verifierStatus).toBe(status);
      expect(record.verification.readyBlocker).toBeTruthy();
    }
  });

  it("blocks a verified email when prior contact or suppression blocks it", () => {
    const attempt = [result("hunter", "VERIFIED", "jordan.finance@example.org")];
    const priorContact = buildContactEnrichmentRecord(target, attempt, clear, undefined, undefined, { priorContactStatus: "ALREADY_CONTACTED" });
    const suppressed = buildContactEnrichmentRecord(target, attempt, { ...clear, status: "BLOCKED", reasons: ["unsubscribe"] });
    expect(priorContact.verification.readyBlocker).toContain("Previously contacted");
    expect(priorContact.readiness).toBe("ALREADY_CONTACTED");
    expect(suppressed.verification.readyBlocker).toContain("Suppressed");
    expect(priorContact.readyForHumanApproval).toBe(false);
    expect(suppressed.readyForHumanApproval).toBe(false);
  });

  it("records missing verifier payload and provider errors as explicit non-ready outcomes", () => {
    const missing = buildContactEnrichmentRecord(target, [], clear);
    const error = buildContactEnrichmentRecord(target, [result("hunter", "ERROR", "jordan.finance@example.org")], clear);
    expect(missing.verification.verifierStatus).toBe("VERIFICATION_RESULT_MISSING");
    expect(missing.verification.readyBlocker).toContain("VERIFICATION_RESULT_MISSING");
    expect(error.verification.verifierStatus).toBe("ERROR");
    expect(error.verification.readyBlocker).toContain("provider error");
  });
});

describe("provider adapters", () => {
  it("uses Hunter Email Finder then Email Verifier and retains provider provenance", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { email: "jordan.finance@example.org", score: 92, sources: [{ uri: "https://example.org/leadership", last_seen_on: "2026-08-16" }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { status: "valid", score: 100, smtp_check: true, accept_all: false, sources: [{ uri: "https://example.org/leadership", last_seen_on: "2026-08-16" }] } }), { status: 200 }));
    const provider = createHunterProvider({ enabled: true, apiKey: " test-key\n", lookupLimit: 1, lookupsUsed: 0, fetcher });
    const discovered = await provider.discover(target);
    expect(discovered.status).toBe("VERIFIED");
    expect(discovered.email).toBe("jordan.finance@example.org");
    expect(discovered.sourceUrls).toEqual([{ url: "https://example.org/leadership", lastSeenAt: "2026-08-16" }]);
    expect(discovered).toMatchObject({ providerRequestType: "EMAIL_FINDER_AND_VERIFIER", finderResult: "FOUND", verifierStatus: "VERIFIED" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0][0])).toContain("email-finder");
    expect(String(fetcher.mock.calls[1][0])).toContain("email-verifier");
  });

  it("keeps Apollo as a secondary, business-email-only fallback", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ person: { email: "jordan.finance@example.org", email_status: "verified" } }), { status: 200 }));
    const provider = createApolloProvider({ enabled: true, apiKey: " test-key\n", lookupLimit: 1, lookupsUsed: 0, fetcher });
    const discovered = await provider.discover(target);
    expect(discovered.status).toBe("VERIFIED");
    const [, init] = fetcher.mock.calls[0];
    expect(init.body).toContain("reveal_personal_emails");
    expect(init.body).toContain("false");
    expect(init.body).toContain("reveal_phone_number");
  });

  it("fails closed for Hunter authentication, rate-limit, and malformed responses", async () => {
    const auth = createHunterProvider({ enabled: true, apiKey: "test-key", lookupLimit: 1, lookupsUsed: 0, fetcher: vi.fn().mockResolvedValue(new Response("{}", { status: 401 })) });
    const rate = createHunterProvider({ enabled: true, apiKey: "test-key", lookupLimit: 1, lookupsUsed: 0, fetcher: vi.fn().mockResolvedValue(new Response("{}", { status: 429 })) });
    const malformed = createHunterProvider({ enabled: true, apiKey: "test-key", lookupLimit: 1, lookupsUsed: 0, fetcher: vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })) });
    await expect(auth.discover(target)).resolves.toMatchObject({ status: "UNAVAILABLE", attempted: true, errorCategory: "authentication" });
    await expect(rate.discover(target)).resolves.toMatchObject({ status: "UNAVAILABLE", attempted: true, errorCategory: "rate_limited" });
    await expect(malformed.discover(target)).resolves.toMatchObject({ status: "UNAVAILABLE", attempted: true, errorCategory: "invalid_response" });
  });

  it("does not call a provider with missing credentials or an exhausted bounded lookup limit", async () => {
    const fetcher = vi.fn();
    const missing = createHunterProvider({ enabled: true, apiKey: "", lookupLimit: 1, lookupsUsed: 0, fetcher });
    const limited = createHunterProvider({ enabled: true, apiKey: "test-key", lookupLimit: 2, lookupsUsed: 2, fetcher });
    await expect(missing.discover(target)).resolves.toMatchObject({ status: "UNAVAILABLE", attempted: false, errorCategory: "not_configured" });
    await expect(limited.discover(target)).resolves.toMatchObject({ status: "UNAVAILABLE", attempted: false, errorCategory: "limit_reached" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps accept-all, invalid, and explicit suppression outcomes out of human approval", () => {
    const acceptAll = buildContactEnrichmentRecord(target, [result("hunter", "ACCEPT_ALL", "jordan.finance@example.org")], clear, "2026-08-16T00:00:00.000Z");
    const invalid = buildContactEnrichmentRecord(target, [result("hunter", "INVALID", "jordan.finance@example.org")], clear, "2026-08-16T00:00:00.000Z");
    const unsubscribed = buildContactEnrichmentRecord(target, [result("hunter", "VERIFIED", "jordan.finance@example.org")], { ...clear, status: "BLOCKED", reasons: ["unsubscribe", "prior outreach"] }, "2026-08-16T00:00:00.000Z");
    expect(acceptAll.readyForHumanApproval).toBe(false);
    expect(invalid.readyForHumanApproval).toBe(false);
    expect(unsubscribed).toMatchObject({ readiness: "SUPPRESSED", readyForHumanApproval: false });
    expect(unsubscribed.blockers.join(" ")).toContain("unsubscribe");
  });
});
