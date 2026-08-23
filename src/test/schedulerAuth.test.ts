import { describe, expect, it } from "vitest";
import { isVerifiedGoogleEmail } from "../../server/schedulerAuth";

describe("scheduler OIDC claims", () => {
  it("accepts both Google boolean and legacy string email verification claims", () => {
    expect(isVerifiedGoogleEmail(true)).toBe(true);
    expect(isVerifiedGoogleEmail("true")).toBe(true);
    expect(isVerifiedGoogleEmail(false)).toBe(false);
    expect(isVerifiedGoogleEmail("false")).toBe(false);
    expect(isVerifiedGoogleEmail(undefined)).toBe(false);
  });
});
