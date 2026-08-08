export const requirementAuditSchema = {
  type: "object",
  additionalProperties: false,
  required: ["missingRequirements"],
  properties: {
    missingRequirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requirement", "source", "confidence"],
        properties: {
          requirement: { type: "string" },
          source: {
            type: "object",
            additionalProperties: false,
            required: ["sourceName", "locator", "excerpt"],
            properties: {
              sourceName: { type: "string" },
              locator: { type: "string" },
              excerpt: { type: "string" }
            }
          },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        }
      }
    }
  }
} as const;
