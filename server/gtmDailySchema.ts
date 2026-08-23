const painTheme = {
  type: "string",
  enum: [
    "spreadsheet_bridge",
    "funder_mapping",
    "manual_coding",
    "missing_evidence",
    "fragmented_handoff",
    "funder_format",
    "price_sensitivity",
    "competitor_friction"
  ]
} as const;

export const dailySocialScanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "signals"],
  properties: {
    summary: { type: "string" },
    signals: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["platform", "title", "url", "author", "publishedAt", "evidenceSummary", "observedPain", "painThemes", "whyRelevant", "suggestedResponse"],
        properties: {
          platform: { type: "string", enum: ["reddit", "forum"] },
          title: { type: "string" },
          url: { type: "string" },
          author: { type: "string" },
          publishedAt: { type: "string" },
          evidenceSummary: { type: "string" },
          observedPain: { type: "string" },
          painThemes: { type: "array", items: painTheme },
          whyRelevant: { type: "string" },
          suggestedResponse: { type: "string" }
        }
      }
    }
  }
} as const;
