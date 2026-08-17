import { describe, expect, it } from "vitest";
import { validateFeedbackInput } from "../lib/feedback";

const valid = { name: "Avery Grant", email: "avery@example.org", organization: "Example Community Action", category: "PRODUCT_FEEDBACK", message: "The evidence review workflow is helpful.", sourcePage: "/contact" };

describe("feedback input validation", () => {
  it("accepts a bounded public feedback submission", () => {
    expect(validateFeedbackInput(valid).errors).toEqual([]);
  });

  it("rejects incomplete, malformed, or unsafe submissions", () => {
    expect(validateFeedbackInput({ ...valid, email: "not-an-email", category: "UNKNOWN", sourcePage: "https://outside.example" }).errors).toEqual(expect.arrayContaining([
      "Enter a valid email address.", "Choose a contact category.", "The source page is invalid."
    ]));
  });

  it("retains the honeypot value for server-side abuse handling without treating it as user content", () => {
    expect(validateFeedbackInput({ ...valid, website: "https://spam.example" }).value.website).toBe("https://spam.example");
  });
});
