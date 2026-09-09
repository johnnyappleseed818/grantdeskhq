import { describe, expect, it } from "vitest";
import { scannerEvidenceBackedIdentity } from "../../server/scannerSourceValidation.ts";
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
