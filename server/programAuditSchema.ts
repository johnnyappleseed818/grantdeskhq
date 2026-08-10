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

export const programAuditSchema = {
  type: "object",
  additionalProperties: false,
  required: ["missingChecks"],
  properties: {
    missingChecks: {
      type: "array",
      maxItems: 80,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "detail", "action", "owner", "severity", "sources"],
        properties: {
          type: { type: "string", enum: ["kpi_result", "data_conflict", "award_trigger", "source_context"] },
          title: { type: "string" },
          detail: { type: "string" },
          action: { type: "string" },
          owner: { type: "string", enum: ["Finance", "Program", "Grants", "Approver"] },
          severity: { type: "string", enum: ["action_required", "review", "info"] },
          sources: { type: "array", minItems: 1, maxItems: 3, items: source }
        }
      }
    }
  }
} as const;
