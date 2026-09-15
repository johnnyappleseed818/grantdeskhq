import { describe, expect, it } from "vitest";
import { hunterFailureStopsValidation, scannerEvidenceBackedIdentity, scannerValidationDue, sourceProvesOrganizationDomain } from "../../server/scannerSourceValidation.ts";
import type { ChannelSeedRecord } from "../lib/gtmChannelSeeds.ts";

const seed = (hint: string, segment: "DIRECT" | "PARTNER" = "PARTNER"): ChannelSeedRecord => ({
  id: "scanner-test", organization: "Example Nonprofit Finance", segment,
  targetRoleGroup: [], source: "chatgpt_scanner_drive", sourceUrl: "https://example.org/team",
  observedAt: "2026-09-09", importedAt: "2026-09-09", lifecycle: "DISCOVERED", organizationDomain: null,
  evidenceSummary: "Research claim", qualificationReasons: [], rejectionReason: null, enrichmentProvider: null,
  enrichmentResult: null, deduplicationKey: "PARTNER:example", scannerUnknownFields: { role_or_public_identity_text: hint }
});

describe("scanner source identity gate", () => {
  it("permits Hunter only when an organization-controlled source confirms the named role", () => {
    expect(scannerEvidenceBackedIdentity(seed("Avery Grant, Founder and CEO"), "# Leadership\nAvery Grant\nFounder and CEO")).toMatchObject({ fullName: "Avery Grant", title: "Founder and CEO" });
  });

  it("does not treat an untrusted scanner hint or unsupported role as verified identity evidence", () => {
    expect(scannerEvidenceBackedIdentity(seed("Avery Grant, Founder and CEO"), "# Leadership\nNo named leaders listed")).toBeNull();
    expect(scannerEvidenceBackedIdentity(seed("Avery Grant, Volunteer Coordinator"), "Avery Grant\nVolunteer Coordinator")).toBeNull();
  });
});
describe("scanner source domain gate", () => {
  it("requires a claimed organization domain matching the source before Hunter can use scanner identity", () => {
    expect(sourceProvesOrganizationDomain({ sourceUrl: "https://example.org/team", scannerClaimedDomain: "example.org" })).toBe(true);
    expect(sourceProvesOrganizationDomain({ sourceUrl: "https://industry-directory.example/listing", scannerClaimedDomain: "example.org" })).toBe(false);
    expect(sourceProvesOrganizationDomain({ sourceUrl: "https://example.org/team", scannerClaimedDomain: null })).toBe(false);
  });
});

describe("scanner validation recovery", () => {
  const now = "2026-09-15T14:00:00.000Z";

  it("retries a legacy deferred scanner record once, then records a durable disposition", () => {
    const legacy = { ...seed(""), lifecycle: "ROLE_UNRESOLVED" as const, rejectionReason: "SOURCE_CLAIM_NOT_INDEPENDENTLY_VERIFIED" };
    expect(scannerValidationDue(legacy, now, {})).toBe(true);
    const deferred = {
      ...legacy,
      validationDisposition: "DEFERRED" as const,
      validationAttemptCount: 1,
      validationNextAttemptAt: "2026-09-15T14:30:00.000Z"
    };
    expect(scannerValidationDue(deferred, now, {})).toBe(false);
    expect(scannerValidationDue(deferred, "2026-09-15T14:30:00.000Z", {})).toBe(true);
  });

  it("does not retry terminal validation rejections or exceed the bounded retry count", () => {
    const rejected = { ...seed(""), lifecycle: "REJECTED" as const, validationDisposition: "REJECTED" as const };
    expect(scannerValidationDue(rejected, now, {})).toBe(false);
    const exhausted = {
      ...seed(""),
      lifecycle: "ROLE_UNRESOLVED" as const,
      validationDisposition: "DEFERRED" as const,
      validationAttemptCount: 3
    };
    expect(scannerValidationDue(exhausted, now, {})).toBe(false);
  });
  it("stops the batch after a provider throttle or exhausted allowance rather than repeating paid discovery calls", () => {
    expect(hunterFailureStopsValidation("rate_limited")).toBe(true);
    expect(hunterFailureStopsValidation("limit_reached")).toBe(true);
    expect(hunterFailureStopsValidation("provider_error")).toBe(false);
  });
});
