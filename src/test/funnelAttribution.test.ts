import { describe, expect, it } from "vitest";
import { normalizeAttribution } from "../../server/billing";

describe("funnel attribution", () => {
  it("keeps canonical acquisition and partner fields while rejecting unapproved data", () => {
    expect(normalizeAttribution({ utm_source: "partner", partner_referral_id: "partner_42", landing_page: "/assessment", document_text: "do not persist" })).toEqual({ utm_source: "partner", partner_referral_id: "partner_42", landing_page: "/assessment" });
  });
});
