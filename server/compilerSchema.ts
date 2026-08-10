export const compilationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reportTitle", "summary", "grantProfile", "requirements", "mappings", "missingInputs", "narrative", "programChecks", "qualityChecks", "warnings"],
  properties: {
    reportTitle: { type: "string" },
    summary: { type: "string" },
    grantProfile: {
      type: "object",
      additionalProperties: false,
      required: ["granteeName", "funderName", "grantName", "grantId", "grantStartDate", "grantEndDate", "grantType", "awardAmount"],
      properties: {
        granteeName: { $ref: "#/$defs/profileField" },
        funderName: { $ref: "#/$defs/profileField" },
        grantName: { $ref: "#/$defs/profileField" },
        grantId: { $ref: "#/$defs/profileField" },
        grantStartDate: { $ref: "#/$defs/profileField" },
        grantEndDate: { $ref: "#/$defs/profileField" },
        grantType: { $ref: "#/$defs/profileField" },
        awardAmount: { $ref: "#/$defs/profileField" }
      }
    },
    requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "requirement", "source", "confidence", "status"],
        properties: {
          id: { type: "string" },
          requirement: { type: "string" },
          source: { $ref: "#/$defs/source" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          status: { $ref: "#/$defs/reviewState" }
        }
      }
    },
    mappings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["transactionId", "date", "description", "amount", "suggestedCategory", "confidence", "rationale", "status"],
        properties: {
          transactionId: { type: "string" }, date: { type: "string" }, description: { type: "string" }, amount: { type: "number" },
          suggestedCategory: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, rationale: { type: "string" },
          status: { $ref: "#/$defs/reviewState" }
        }
      }
    },
    missingInputs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "assignedRole", "reason", "status"],
        properties: {
          id: { type: "string" }, question: { type: "string" }, assignedRole: { type: "string" }, reason: { type: "string" },
          status: { type: "string", enum: ["open", "answered"] }
        }
      }
    },
    narrative: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "evidenceType", "source", "status"],
        properties: {
          id: { type: "string" }, text: { type: "string" },
          evidenceType: { type: "string", enum: ["source_fact", "calculation", "program_response", "needs_confirmation", "unsupported"] },
          source: { $ref: "#/$defs/source" }, status: { $ref: "#/$defs/reviewState" }
        }
      }
    },
    programChecks: {
      type: "array",
      maxItems: 80,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "title", "detail", "action", "owner", "severity", "sources", "resolution", "status"],
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["kpi_result", "data_conflict", "award_trigger", "source_context"] },
          title: { type: "string" }, detail: { type: "string" }, action: { type: "string" },
          owner: { type: "string", enum: ["Finance", "Program", "Grants", "Approver"] },
          severity: { type: "string", enum: ["action_required", "review", "info"] },
          sources: { type: "array", minItems: 1, maxItems: 3, items: { $ref: "#/$defs/source" } },
          resolution: { type: "string", enum: ["open", "resolved", "not_applicable"] },
          status: { $ref: "#/$defs/reviewState" }
        }
      }
    },
    qualityChecks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "detail", "required", "status"],
        properties: {
          id: { type: "string" }, label: { type: "string" }, detail: { type: "string" }, required: { type: "boolean" },
          status: { type: "string", enum: ["passed", "review", "blocked", "not_evaluated"] }
        }
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  },
  $defs: {
    reviewState: { type: "string", enum: ["verified", "review", "blocked", "not_evaluated"] },
    profileField: {
      type: "object",
      additionalProperties: false,
      required: ["value", "confidence", "source", "status"],
      properties: {
        value: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        source: { $ref: "#/$defs/source" },
        status: { $ref: "#/$defs/reviewState" }
      }
    },
    source: {
      type: "object",
      additionalProperties: false,
      required: ["sourceName", "locator", "excerpt"],
      properties: { sourceName: { type: "string" }, locator: { type: "string" }, excerpt: { type: "string" } }
    }
  }
} as const;

export const verificationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "itemId", "verdict", "reason", "source"],
        properties: {
          id: { type: "string" },
          itemId: { type: "string" },
          verdict: { type: "string", enum: ["source_matched", "review", "blocked"] },
          reason: { type: "string" },
          source: {
            type: "object",
            additionalProperties: false,
            required: ["sourceName", "locator", "excerpt"],
            properties: { sourceName: { type: "string" }, locator: { type: "string" }, excerpt: { type: "string" } }
          }
        }
      }
    }
  }
} as const;
