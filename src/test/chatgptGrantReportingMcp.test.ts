import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { agreementAnalysisProjection, budgetVsActualProjection, documentTextCompilationRequest, grantReportingMcpToolDefinitions, handleGrantReportingMcp, missingInputsProjection, reviewableDraftProjection } from "../../server/chatgptGrantReportingMcp.ts";
import { allowedGrantReportingMcpRedirectUri, grantReportingMcpAuthorizationMetadata, grantReportingMcpResourceMetadata } from "../../server/chatgptGrantReportingOAuth.ts";
import { MCP_COMPILATION_REQUEST_ID_PATTERN } from "../lib/prototype.ts";
import type { PersistedCompilationResponse } from "../types/prototype.ts";

const saved = {
  reportId: "report_0123456789abcdef0123456789abcdef",
  report: { id: "report_0123456789abcdef0123456789abcdef", organizationName: "Example Nonprofit", grantName: "Community Grant", reportingPeriod: "Q3 2026", status: "review_required", evidenceCoveragePercent: 88, unresolvedItems: 2, sourceCount: 2, createdAt: "2026-10-04T00:00:00.000Z", updatedAt: "2026-10-04T00:00:00.000Z" },
  sources: [{ role: "awardAgreement", name: "agreement.pdf", mimeType: "application/pdf", size: 500 }],
  result: {
    reportTitle: "Community Grant — Q3 2026", summary: "A reviewable draft.", generatedAt: "2026-10-04T00:00:00.000Z", model: "test",
    grantProfile: { funderName: { value: "Community Funder", confidence: 1, status: "verified", source: { sourceName: "agreement.pdf", locator: "p. 1", excerpt: "Community Funder" } }, grantName: { value: "Community Grant", confidence: 1, status: "verified", source: { sourceName: "agreement.pdf", locator: "p. 1", excerpt: "Community Grant" } }, grantId: { value: "CG-1", confidence: 1, status: "verified", source: { sourceName: "agreement.pdf", locator: "p. 1", excerpt: "CG-1" } }, grantStartDate: { value: "2026-01-01", confidence: 1, status: "verified", source: { sourceName: "agreement.pdf", locator: "p. 1", excerpt: "2026-01-01" } }, grantEndDate: { value: "2026-12-31", confidence: 1, status: "verified", source: { sourceName: "agreement.pdf", locator: "p. 1", excerpt: "2026-12-31" } }, grantType: { value: "restricted", confidence: 1, status: "verified", source: { sourceName: "agreement.pdf", locator: "p. 1", excerpt: "restricted" } } },
    setupConflicts: [], inputStatus: [], workflow: { readiness: "needs_review", actionRequiredCount: 1, needsReviewCount: 1, missingInputCount: 1 },
    requirements: [{ id: "req-1", requirement: "Submit a quarterly report.", source: { sourceName: "agreement.pdf", locator: "p. 2", excerpt: "Quarterly report" }, confidence: 1, status: "verified", canonicalType: "reporting_requirement", applicability: "current" }],
    mappings: [], missingInputs: [{ id: "input-1", question: "Provide the program update.", assignedRole: "Program", reason: "The outcome narrative is absent.", status: "open" }], narrative: [{ id: "draft-1", text: "Program outcomes need confirmation.", evidenceType: "needs_confirmation", source: { sourceName: "agreement.pdf", locator: "p. 2", excerpt: "Quarterly report" }, status: "review" }], qualityChecks: [], warnings: ["Human review required."],
    validation: { evidenceCoveragePercent: 88, sourceMatchedItems: 4, itemsNeedingReview: 1, blockedItems: 0, method: "fixture", findings: [] },
    financialAnalysis: { ledgerTransactionCount: 2, mappedTransactionCount: 2, excludedTransactionCount: 0, mappedActualTotal: 1200, budgetVariances: [{ category: "Program", approvedAmount: 1000, actualAmount: 1200, varianceAmount: 200, variancePercent: 20, explanationThreshold: 100, explanationRequired: true, status: "explanation_required", transactionIds: ["txn-1"] }], controls: [{ id: "material-variance", title: "Explain variance", detail: "A documented explanation is required.", status: "review", requiresAction: true, transactionIds: ["txn-1"] }] },
    programChecks: [{ id: "program-1", type: "kpi_result", title: "Program update required", detail: "No current result is supplied.", action: "Request the update.", owner: "Program", severity: "action_required", sources: [{ sourceName: "agreement.pdf", locator: "p. 2", excerpt: "Quarterly report" }], resolution: "open", status: "review" }]
  }
} as unknown as PersistedCompilationResponse;

describe("private ChatGPT grant-reporting tool projections", () => {
  it("returns source-linked agreement data without source-file contents", () => {
    const output = agreementAnalysisProjection(saved);
    expect(output.requirements[0]).toMatchObject({ id: "req-1", source: { sourceName: "agreement.pdf" } });
    expect(JSON.stringify(output)).not.toContain("data:");
  });

  it("returns persisted deterministic budget variances without recalculating or submitting anything", () => {
    expect(budgetVsActualProjection(saved.result)).toMatchObject({ mappedActualTotal: 1200, budgetVariances: [{ category: "Program", varianceAmount: 200, explanationRequired: true }], controlsRequiringAction: [{ id: "material-variance" }] });
  });

  it("keeps missing inputs and reviewable drafts explicitly source-supported", () => {
    expect(missingInputsProjection(saved.result)).toMatchObject({ missingInputs: [{ id: "input-1", status: "open" }], openProgramChecks: [{ id: "program-1", sources: [{ sourceName: "agreement.pdf" }] }] });
    expect(reviewableDraftProjection(saved.result)).toMatchObject({ reviewRequired: true, narrative: [{ id: "draft-1", source: { sourceName: "agreement.pdf" } }] });
  });

  it("accepts typed user-provided document text as the existing tenant-bound compilation input format", () => {
    const request = documentTextCompilationRequest({ requestId: "mcp_document_input_20261005", organizationName: "Example Nonprofit", grantName: "Community Grant", reportingPeriod: "Q3 2026", awardAgreementText: "Agreement terms", approvedBudgetText: "Program,1000", ledgerExportText: "Program,900" });
    expect(request.files.map((file) => file.role)).toEqual(["awardAgreement", "approvedBudget", "ledgerExport"]);
    expect(request.files.every((file) => file.data.startsWith("data:text/plain;base64,"))).toBe(true);
  });

  it("advertises the same MCP request identifier contract used by shared validation", () => {
    const create = grantReportingMcpToolDefinitions().find((tool) => tool.name === "create_report_from_document_text");
    expect(create?.inputSchema).toMatchObject({ properties: { requestId: { pattern: `^${MCP_COMPILATION_REQUEST_ID_PATTERN}$` } } });
  });

  it("publishes OAuth 2.1 metadata with resource binding, PKCE S256, and dynamic client registration", () => {
    expect(grantReportingMcpResourceMetadata()).toMatchObject({ resource: "https://grantdeskhq.com/mcp", authorization_servers: ["https://grantdeskhq.com"] });
    expect(grantReportingMcpAuthorizationMetadata()).toMatchObject({ issuer: "https://grantdeskhq.com", authorization_response_iss_parameter_supported: true, code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], grant_types_supported: ["authorization_code", "refresh_token"], registration_endpoint: "https://grantdeskhq.com/oauth/register" });
    expect(allowedGrantReportingMcpRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(allowedGrantReportingMcpRedirectUri("https://example.invalid/callback")).toBe(false);
  });

  it("publishes per-tool OAuth schemes instead of relying on an SDK-only type cast", () => {
    const tools = grantReportingMcpToolDefinitions();
    expect(tools).toHaveLength(7);
    expect(tools.find((tool) => tool.name === "get_grantdeskhq_profile")).toMatchObject({ securitySchemes: [{ type: "oauth2", scopes: ["grantdeskhq.reports.read"] }] });
    expect(tools.find((tool) => tool.name === "create_report_from_document_text")).toMatchObject({ securitySchemes: [{ type: "oauth2", scopes: ["grantdeskhq.reports.read", "grantdeskhq.reports.write"] }] });
    expect(tools.find((tool) => tool.name === "list_grant_reports")?.outputSchema).toMatchObject({ properties: { reports: { type: "array" } } });
  });

  it("supports unauthenticated MCP discovery and returns the OAuth challenge for a protected tool call", async () => {
    const server = createServer((request, response) => { void handleGrantReportingMcp(request, response); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("The MCP fixture did not bind a test port.");
    const endpoint = `http://127.0.0.1:${address.port}`;
    try {
      const initialize = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } }) });
      expect(initialize.status).toBe(200);
      expect(await initialize.json()).toMatchObject({ result: { protocolVersion: "2025-11-25", capabilities: { tools: { listChanged: false } } } });
      const listed = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) });
      const manifest = await listed.json() as { result: { tools: Array<{ name: string; securitySchemes: unknown }> } };
      expect(manifest.result.tools.find((tool) => tool.name === "list_grant_reports")?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["grantdeskhq.reports.read"] }]);
      const protectedCall = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_grant_reports", arguments: {} } }) });
      const protectedBody = await protectedCall.json() as { _meta?: Record<string, string> };
      expect(protectedCall.status).toBe(401);
      expect(protectedCall.headers.get("www-authenticate")).toContain("resource_metadata=");
      expect(protectedBody._meta?.["mcp/www_authenticate"]).toContain("resource_metadata=");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
