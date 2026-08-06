const source = {
  type: "object",
  additionalProperties: false,
  required: ["sourceName", "locator", "excerpt"],
  properties: { sourceName: { type: "string" }, locator: { type: "string" }, excerpt: { type: "string" } }
} as const;

const reviewState = { type: "string", enum: ["verified", "review", "blocked"] } as const;

const readinessItem = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "detail", "source", "confidence", "status"],
  properties: {
    id: { type: "string" }, label: { type: "string" }, detail: { type: "string" }, source,
    confidence: { type: "number", minimum: 0, maximum: 1 }, status: reviewState
  }
} as const;

export const readinessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "nextDeadline", "obligations", "financialRequirements", "programMetrics", "evidenceGaps", "warnings"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    nextDeadline: {
      type: "object", additionalProperties: false, required: ["date", "label", "source", "status"],
      properties: { date: { type: "string" }, label: { type: "string" }, source, status: reviewState }
    },
    obligations: { type: "array", items: readinessItem },
    financialRequirements: { type: "array", items: readinessItem },
    programMetrics: { type: "array", items: readinessItem },
    evidenceGaps: {
      type: "array", items: {
        type: "object", additionalProperties: false, required: ["id", "item", "reason", "suggestedOwner", "status"],
        properties: { id: { type: "string" }, item: { type: "string" }, reason: { type: "string" }, suggestedOwner: { type: "string" }, status: { type: "string", enum: ["open", "confirmed"] } }
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  }
} as const;

export const readinessVerificationSchema = {
  type: "object", additionalProperties: false, required: ["findings"], properties: {
    findings: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["id", "itemId", "verdict", "reason", "source"],
      properties: { id: { type: "string" }, itemId: { type: "string" }, verdict: { type: "string", enum: ["source_matched", "review", "blocked"] }, reason: { type: "string" }, source }
    } }
  }
} as const;
