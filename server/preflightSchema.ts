const source = {
  type: "object",
  additionalProperties: false,
  required: ["sourceName", "locator", "excerpt"],
  properties: {
    sourceName: { type: "string" },
    locator: { type: "string" },
    excerpt: { type: "string" }
  }
} as const;

const profileField = {
  type: "object",
  additionalProperties: false,
  required: ["value", "confidence", "source", "status"],
  properties: {
    value: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    source,
    status: { type: "string", enum: ["verified", "review", "blocked", "not_evaluated"] }
  }
} as const;

export const preflightSchema = {
  type: "object",
  additionalProperties: false,
  required: ["grantProfile", "reportingPeriods"],
  properties: {
    grantProfile: {
      type: "object",
      additionalProperties: false,
      required: ["funderName", "grantName", "grantId", "grantStartDate", "grantEndDate", "grantType"],
      properties: {
        funderName: profileField,
        grantName: profileField,
        grantId: profileField,
        grantStartDate: profileField,
        grantEndDate: profileField,
        grantType: profileField
      }
    },
    reportingPeriods: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "startDate", "endDate", "dueDate", "source", "confidence", "status"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          dueDate: { type: "string" },
          source,
          confidence: { type: "number", minimum: 0, maximum: 1 },
          status: { type: "string", enum: ["verified", "review", "blocked", "not_evaluated"] }
        }
      }
    }
  }
} as const;
