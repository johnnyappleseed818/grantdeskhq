import { describe, expect, it } from "vitest";
import { reliabilityCanaryOrigin } from "../../server/reliabilityCanaryOrigin";

describe("reliability canary origin", () => {
  it("keeps nested synthetic checks on the authenticated candidate instead of a stale configured tag", () => {
    const candidate = "https://oct8-safety---grantdeskhq-prototype-me423s5k5a-uc.a.run.app";
    expect(reliabilityCanaryOrigin(candidate, "https://gtm-content-truth---grantdeskhq-prototype-me423s5k5a-uc.a.run.app")).toBe(candidate);
  });
});
