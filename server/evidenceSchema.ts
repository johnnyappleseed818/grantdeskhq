export const evidenceReconciliationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["relevance", "summary", "matches"],
  properties: {
    relevance: { type: "string", enum: ["matched", "review", "unmatched", "irrelevant"] },
    summary: { type: "string" },
    matches: {
      type: "array",
      maxItems: 80,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["targetId", "confidence", "status", "rationale", "locator", "excerpt"],
        properties: {
          targetId: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          status: { type: "string", enum: ["matched", "suggested"] },
          rationale: { type: "string" },
          locator: { type: "string" },
          excerpt: { type: "string" }
        }
      }
    }
  }
} as const;
