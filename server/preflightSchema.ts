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
  required: ["grantProfile", "reportingPeriods", "referencePeriodId", "workflowObligations"],
  properties: {
    grantProfile: {
      type: "object",
      additionalProperties: false,
      required: ["granteeName", "funderName", "grantName", "grantId", "grantStartDate", "grantEndDate", "grantType", "awardAmount"],
      properties: {
        granteeName: profileField,
        funderName: profileField,
        grantName: profileField,
        grantId: profileField,
        grantStartDate: profileField,
        grantEndDate: profileField,
        grantType: profileField,
        awardAmount: profileField
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
    },
    referencePeriodId: { type: "string" },
    workflowObligations: {
      type: "array",
      maxItems: 80,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "detail", "owner", "applicability", "trigger", "source", "confidence", "status"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          detail: { type: "string" },
          owner: { type: "string", enum: ["Finance", "Program", "Grants", "Approver"] },
          applicability: { type: "string", enum: ["required_now", "conditional", "future", "not_applicable"] },
          trigger: { type: "string" },
          source,
          confidence: { type: "number", minimum: 0, maximum: 1 },
          status: { type: "string", enum: ["verified", "review", "blocked", "not_evaluated"] }
        }
      }
    }
  }
} as const;
